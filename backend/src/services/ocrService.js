const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout: 300000,
        maxBuffer: 8 * 1024 * 1024,
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

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

async function assertOcrLanguages(languages) {
  const result = await execFileAsync("tesseract", ["--list-langs"], {
    timeout: 30000
  });

  const installed = new Set(
    result.stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
  );

  const missing = languages.filter((language) => !installed.has(language));
  if (missing.length) {
    throw new Error(
      `OCR language data is missing: ${missing.join(", ")}. Install the matching Tesseract language packages.`
    );
  }
}

/**
 * OCR scanned PDFs and produce a DOCX.
 *
 * Pipeline:
 *   PDF -> Poppler page images -> Tesseract OCR -> UTF-8 HTML -> LibreOffice DOCX
 *
 * This is intentionally a shared OCR processing layer, not a future placeholder.
 * Normal text PDFs can continue through the faster native LibreOffice path.
 */
async function ocrPdfToWord(inputPath, options = {}) {
  const languages = String(
    options.languages || process.env.OCR_LANGUAGES || "eng+amh"
  )
    .split("+")
    .map((value) => value.trim())
    .filter(Boolean);

  const dpi = Math.max(
    150,
    Math.min(300, Number(options.dpi || process.env.OCR_DPI || 200))
  );

  const maxPages = Math.max(
    1,
    Number(options.maxPages || process.env.OCR_MAX_PAGES || 50)
  );

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-ocr-"));
  const imageDir = path.join(workDir, "pages");
  const outputDir = path.join(workDir, "output");
  const profileDir = path.join(workDir, "lo-profile");

  await fs.mkdir(imageDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  try {
    await assertOcrLanguages(languages);

    // Render pages at a practical OCR resolution. Limiting page count protects
    // the free Render service from unexpectedly expensive OCR jobs.
    await execFileAsync("pdftoppm", [
      "-r",
      String(dpi),
      "-png",
      "-f",
      "1",
      "-l",
      String(maxPages),
      inputPath,
      path.join(imageDir, "page")
    ]);

    const imageFiles = (await fs.readdir(imageDir))
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort((a, b) => {
        const pageA = Number(a.match(/(\d+)/)[1]);
        const pageB = Number(b.match(/(\d+)/)[1]);
        return pageA - pageB;
      });

    if (!imageFiles.length) {
      throw new Error("OCR could not render any PDF pages.");
    }

    const pages = [];
    let totalCharacters = 0;

    for (const imageFile of imageFiles) {
      const imagePath = path.join(imageDir, imageFile);
      const result = await execFileAsync("tesseract", [
        imagePath,
        "stdout",
        "-l",
        languages.join("+"),
        "--psm",
        "3"
      ]);

      const text = (result.stdout || "").replace(/\r/g, "").trim();
      totalCharacters += text.length;
      pages.push(text);
    }

    const body = pages
      .map((text, index) => {
        const pageContent = text
          ? escapeHtml(text).replace(/\n/g, "<br/>\n")
          : "[No text detected on this page]";
        return `<section class="page"><h2>Page ${index + 1}</h2><div>${pageContent}</div></section>`;
      })
      .join("\n");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>OCR Document</title>
  <style>
    body { font-family: "Noto Sans", Arial, sans-serif; font-size: 11pt; }
    .page { page-break-after: always; margin-bottom: 20px; }
    .page:last-child { page-break-after: auto; }
    h2 { font-size: 10pt; font-weight: normal; color: #666; }
  </style>
</head>
<body>${body}</body>
</html>`;

    const htmlPath = path.join(workDir, "ocr.html");
    await fs.writeFile(htmlPath, html, "utf8");

    await execFileAsync("libreoffice", [
      "--headless",
      `-env:UserInstallation=file://${profileDir}`,
      "--convert-to",
      "docx:Office Open XML Text",
      "--outdir",
      outputDir,
      htmlPath
    ]);

    const generatedPath = path.join(outputDir, "ocr.docx");
    await fs.access(generatedPath);

    const inputName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(outputDir, `${inputName}.docx`);
    await fs.rename(generatedPath, outputPath);

    const outputStat = await fs.stat(outputPath);
    if (outputStat.size === 0) {
      throw new Error("OCR created an empty DOCX file.");
    }

    return {
      outputPath,
      outputDir: workDir,
      pagesProcessed: imageFiles.length,
      totalCharacters,
      ocrLanguages: languages,
      ocrDpi: dpi
    };
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`OCR PDF to Word failed: ${error.stderr || error.message}`);
  }
}

module.exports = { ocrPdfToWord };
