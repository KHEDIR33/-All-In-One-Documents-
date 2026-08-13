const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { assertReadableFile, assertResult } = require("../engineContract");
const { analyzePdf } = require("../../services/document/documentAnalyzer");
const { ocrPdfToWord } = require("../../services/ocrService");

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
        ...options
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

async function pdfToWord(inputPath) {
  await assertReadableFile(inputPath);

  const analysis = await analyzePdf(inputPath);

  // Scanned PDFs use the active OCR processing layer. Normal text PDFs keep
  // the faster native LibreOffice path.
  if (analysis.requiresOcr) {
    const ocrResult = await ocrPdfToWord(inputPath);

    return assertResult({
      ...ocrResult,
      analysis: {
        ...analysis,
        ocrProcessed: true,
        ocrLanguages: ocrResult.ocrLanguages,
        ocrDpi: ocrResult.ocrDpi,
        pagesProcessed: ocrResult.pagesProcessed
      },
      outputSizeBytes: (await fs.stat(ocrResult.outputPath)).size
    });
  }

  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-pdf-word-"));
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-lo-profile-"));

  try {
    // LibreOffice treats PDFs as Draw documents and direct PDF -> DOCX export
    // is not reliable across headless builds. For text PDFs, extract UTF-8
    // text with Poppler and use the same HTML -> DOCX path as OCR.
    const extracted = await execFileAsync("pdftotext", ["-layout", inputPath, "-"]);
    const text = (extracted.stdout || "").replace(/\r/g, "").trim();
    if (!text) {
      throw new Error("No selectable text could be extracted from the PDF.");
    }

    const escapeHtml = (value) => value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");

    const pages = text.split(/\f/);
    const body = pages.map((page, index) => {
      const content = escapeHtml(page.trim()).replace(/\n/g, "<br/>\n");
      return `<section class="page"><h2>Page ${index + 1}</h2><div>${content}</div></section>`;
    }).join("\n");

    const htmlPath = path.join(outputDir, "source.html");
    await fs.writeFile(htmlPath, `<!doctype html>
<html><head><meta charset="utf-8"><title>PDF Document</title>
<style>body{font-family:"Noto Sans",Arial,sans-serif;font-size:11pt}.page{page-break-after:always;margin-bottom:20px}.page:last-child{page-break-after:auto}h2{font-size:10pt;font-weight:normal;color:#666;}</style>
</head><body>${body}</body></html>`, "utf8");

    await execFileAsync("libreoffice", [
      "--headless",
      `-env:UserInstallation=file://${profileDir}`,
      "--convert-to",
      "docx:Office Open XML Text",
      "--outdir",
      outputDir,
      htmlPath
    ]);

    const generatedPath = path.join(outputDir, "source.docx");
    await fs.access(generatedPath);

    const inputName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(outputDir, `${inputName}.docx`);
    await fs.rename(generatedPath, outputPath);

    const outputStat = await fs.stat(outputPath);
    if (outputStat.size === 0) {
      throw new Error("LibreOffice created an empty DOCX file.");
    }

    return assertResult({
      outputPath,
      outputDir,
      analysis,
      outputSizeBytes: outputStat.size
    });
  } catch (error) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `PDF to Word conversion failed: ${error.stderr || error.message}`
    );
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { pdfToWord };
