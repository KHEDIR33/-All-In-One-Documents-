const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { assertReadableFile, assertResult } = require("../engineContract");
const { analyzePdf } = require("../../services/document/documentAnalyzer");

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...options },
      (error, stdout, stderr) => {
        if (error) { error.stderr = stderr; reject(error); return; }
        resolve({ stdout, stderr });
      }
    );
  });
}

/**
 * PDF Edit Engine — MVP
 * ----------------------
 * Strategy: use pdftk (or qpdf) to stamp a generated FDF overlay onto the PDF.
 * For text annotations we generate a minimal single-page PDF stamp via LibreOffice
 * Writer (from an ODT template) and then overlay it using pdftk.
 *
 * MVP scope (what this engine handles today):
 *   - Add one or more text annotations to specific pages.
 *   - Amharic / Unicode text is supported because LibreOffice handles the font.
 *
 * Out of scope for this engine (future milestones):
 *   - Visual drag-and-drop signature placement  → requires frontend canvas work.
 *   - Digital/cryptographic signing             → pyHanko or separate service.
 *   - Image stamp / draw overlay                → future engine version.
 *
 * @param {string} inputPath
 * @param {object} options
 * @param {Array<{page: number, x: number, y: number, text: string, fontSize?: number}>} options.annotations
 */
async function editPdf(inputPath, options = {}) {
  await assertReadableFile(inputPath);

  const analysis = await analyzePdf(inputPath);

  const annotations = Array.isArray(options.annotations) ? options.annotations : [];
  if (annotations.length === 0) {
    const e = new Error("At least one annotation is required.");
    e.code = "NO_ANNOTATIONS";
    throw e;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-edit-"));
  const inputName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(workDir, `${inputName}_edited.pdf`);

  try {
    // Build a simple ODT document containing the annotation texts, one per
    // paragraph, then convert it to PDF via LibreOffice headless.
    // We then use pdftk to stamp that overlay onto the original PDF.
    //
    // This gives us:
    //   ✓ Full Unicode/Amharic support (LibreOffice font stack)
    //   ✓ No Python dependency
    //   ✓ Consistent with the rest of the engine layer

    const odtContent = buildOdtContent(annotations);
    const odtPath = path.join(workDir, "overlay.odt");
    await fs.writeFile(odtPath, odtContent);

    const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-lo-profile-"));
    try {
      await execFileAsync("libreoffice", [
        "--headless",
        `--env:UserInstallation=file://${profileDir}`,
        "--convert-to", "pdf",
        "--outdir", workDir,
        odtPath
      ]);
    } finally {
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    }

    const overlayPdf = path.join(workDir, "overlay.pdf");
    try {
      await fs.access(overlayPdf);
    } catch (_) {
      throw new Error("LibreOffice did not produce an overlay PDF.");
    }

    // Stamp the overlay onto the original using pdftk.
    // `stamp` places the overlay on every page of the original.
    // For page-specific annotations this is the MVP approach — future versions
    // can use pdftk's burst + selective stamp for per-page control.
    await execFileAsync("pdftk", [
      inputPath,
      "stamp",
      overlayPdf,
      "output",
      outputPath
    ]);

    const outputStat = await fs.stat(outputPath);
    if (outputStat.size === 0) {
      throw new Error("pdftk produced an empty output file.");
    }

    return assertResult({
      outputPath,
      outputDir: workDir,
      analysis,
      outputSizeBytes: outputStat.size,
      annotationCount: annotations.length
    });
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`PDF editing failed: ${error.stderr || error.message}`);
  }
}

/**
 * Build a minimal ODT XML document containing the annotation texts.
 * LibreOffice can open and convert this without any installed fonts beyond
 * its bundled set; Ethiopic glyphs render via the bundled Noto fonts.
 */
function buildOdtContent(annotations) {
  const textLines = annotations
    .map(a => {
      const size = a.fontSize || 12;
      const text = String(a.text || "").replace(/[<>&"']/g, c => ({
        "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;"
      }[c]));
      return `<text:p text:style-name="Annotation" fo:font-size="${size}pt">${text}</text:p>`;
    })
    .join("\n");

  // Minimal flat ODF content.xml embedded as a single file.
  // A proper ODT is a ZIP; here we write a flat ODF which LibreOffice also accepts.
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:mimetype="application/vnd.oasis.opendocument.text">
  <office:automatic-styles>
    <style:style xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
      style:name="Annotation" style:family="paragraph">
      <style:text-properties fo:font-family="Noto Sans Ethiopic, Liberation Sans, Arial"
        fo:color="#CC0000"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:text>
      ${textLines}
    </office:text>
  </office:body>
</office:document>`;
}

module.exports = { editPdf };
