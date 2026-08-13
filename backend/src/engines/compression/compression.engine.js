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
      { timeout: 120000, maxBuffer: 4 * 1024 * 1024, ...options },
      (error, stdout, stderr) => {
        if (error) { error.stderr = stderr; reject(error); return; }
        resolve({ stdout, stderr });
      }
    );
  });
}

/**
 * Compression levels — maps user-facing label to Ghostscript dPDFSETTINGS value.
 *
 * /screen   — lowest quality, highest compression  (~72 dpi images)
 * /ebook    — medium quality                       (~150 dpi images)  ← default
 * /printer  — good quality                         (~300 dpi images)
 * /prepress — near-lossless (minimal compression)
 */
const GS_SETTINGS = {
  high: "/screen",
  medium: "/ebook",
  low: "/printer"
};

/**
 * Compress a PDF using Ghostscript.
 *
 * @param {string} inputPath   - Local path to the uploaded PDF.
 * @param {object} options
 * @param {string} [options.level="medium"] - "high" | "medium" | "low"
 */
async function compressPdf(inputPath, options = {}) {
  await assertReadableFile(inputPath);

  // Validate it is a real PDF (re-use existing analyzer — also gives page count).
  const analysis = await analyzePdf(inputPath);

  const level = options.level && GS_SETTINGS[options.level] ? options.level : "medium";
  const gsSettings = GS_SETTINGS[level];

  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-compress-"));
  const inputName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${inputName}_compressed.pdf`);

  try {
    await execFileAsync("gs", [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      `-dPDFSETTINGS=${gsSettings}`,
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${outputPath}`,
      inputPath
    ]);

    try {
      await fs.access(outputPath);
    } catch (_) {
      throw new Error("Ghostscript did not produce a compressed PDF.");
    }

    const [inputStat, outputStat] = await Promise.all([
      fs.stat(inputPath),
      fs.stat(outputPath)
    ]);

    if (outputStat.size === 0) {
      throw new Error("Ghostscript created an empty file.");
    }

    // If Ghostscript made the file LARGER (can happen with already-optimised PDFs),
    // return the original. The caller should still succeed — just no reduction.
    const wasShrunk = outputStat.size < inputStat.size;
    const actualOutputPath = wasShrunk ? outputPath : inputPath;
    const actualOutputSize = wasShrunk ? outputStat.size : inputStat.size;

    // Validate the file that will actually be returned to the caller.
    const outputAnalysis = await analyzePdf(actualOutputPath);

    return assertResult({
      outputPath: actualOutputPath,
      outputDir,
      analysis,
      outputAnalysis,
      compressionLevel: level,
      originalSizeBytes: inputStat.size,
      outputSizeBytes: actualOutputSize,
      wasShrunk,
      reductionPercent: wasShrunk
        ? Math.round((1 - actualOutputSize / inputStat.size) * 100)
        : 0
    });
  } catch (error) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`PDF compression failed: ${error.stderr || error.message}`);
  }
}

module.exports = { compressPdf };
