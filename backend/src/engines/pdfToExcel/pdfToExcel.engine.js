const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { assertReadableFile, assertResult } = require("../engineContract");
const { analyzePdf } = require("../../services/document/documentAnalyzer");

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 180000, maxBuffer: 4 * 1024 * 1024, ...options },
      (error, stdout, stderr) => {
        if (error) { error.stderr = stderr; reject(error); return; }
        resolve({ stdout, stderr });
      });
  });
}

/**
 * PDF → Excel (XLSX).
 * Uses pdfplumber for text/table PDFs and Tesseract TSV + Poppler
 * for scanned PDFs. LibreOffice is intentionally not used for PDF→XLSX:
 * PDFs are imported by LibreOffice as Draw documents, not reliably as Calc
 * sheets, so direct PDF→Calc conversion can fail or produce empty workbooks.
 */
async function pdfToExcel(inputPath) {
  await assertReadableFile(inputPath);
  const analysis = await analyzePdf(inputPath);

  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-pdf-excel-"));
  const inputName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${inputName}.xlsx`);
  const scriptPath = path.resolve(__dirname, "../../../scripts/pdf_to_excel.py");

  try {
    await execFileAsync("python3", [
      scriptPath,
      inputPath,
      outputPath,
      analysis.requiresOcr ? "ocr" : "normal"
    ], {
      env: { ...process.env, OCR_LANG: process.env.OCR_LANG || "eng+amh" }
    });

    const outputStat = await fs.stat(outputPath);
    if (outputStat.size === 0) throw new Error("Excel output is empty.");

    return assertResult({
      outputPath,
      outputDir,
      analysis,
      outputSizeBytes: outputStat.size
    });
  } catch (error) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    const detail = error.stderr || error.message;
    throw new Error(`PDF to Excel conversion failed: ${detail}`);
  }
}

module.exports = { pdfToExcel };
