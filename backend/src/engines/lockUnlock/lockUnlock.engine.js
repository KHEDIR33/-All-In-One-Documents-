const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { assertReadableFile, assertResult } = require("../engineContract");

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: 60000, maxBuffer: 4 * 1024 * 1024, ...options },
      (error, stdout, stderr) => {
        if (error) { error.stderr = stderr; reject(error); return; }
        resolve({ stdout, stderr });
      }
    );
  });
}

/**
 * Validate that the file header is a PDF and is non-empty.
 * Does NOT run the full documentAnalyzer (no pdfinfo/pdftotext needed here).
 */
async function validatePdf(inputPath) {
  await assertReadableFile(inputPath);
  const stat = await fs.stat(inputPath);
  if (stat.size === 0) {
    const e = new Error("The uploaded PDF is empty.");
    e.code = "EMPTY_PDF";
    throw e;
  }
  const header = Buffer.alloc(5);
  const handle = await fs.open(inputPath, "r");
  try {
    await handle.read(header, 0, 5, 0);
  } finally {
    await handle.close();
  }
  if (header.toString("ascii") !== "%PDF-") {
    const e = new Error("Uploaded file is not a valid PDF.");
    e.code = "INVALID_PDF";
    throw e;
  }
  return { sizeBytes: stat.size };
}

/**
 * Lock (encrypt) a PDF with a user password using qpdf.
 *
 * qpdf is a mature, widely-packaged CLI tool (apt: qpdf).
 * We use 256-bit AES (PDF 2.0) when available, falling back to 128-bit AES.
 *
 * @param {string} inputPath
 * @param {string} password   - Password the user chooses.
 */
async function lockPdf(inputPath, password) {
  if (!password || password.length < 1) {
    const e = new Error("A password is required to lock a PDF.");
    e.code = "PASSWORD_REQUIRED";
    throw e;
  }

  const analysis = await validatePdf(inputPath);
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-lock-"));
  const inputName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${inputName}_locked.pdf`);

  try {
    await execFileAsync("qpdf", [
      "--encrypt",
      password,   // user password  (required to open the file)
      password,   // owner password (required to change permissions)
      "256",      // AES-256; qpdf falls back to 128 on older builds
      "--",
      inputPath,
      outputPath
    ]);

    const outputStat = await fs.stat(outputPath);
    if (outputStat.size === 0) {
      throw new Error("qpdf produced an empty locked file.");
    }

    return assertResult({
      outputPath,
      outputDir,
      analysis,
      outputSizeBytes: outputStat.size,
      locked: true
    });
  } catch (error) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`PDF locking failed: ${error.stderr || error.message}`);
  }
}

/**
 * Unlock (decrypt) a PDF using qpdf.
 *
 * @param {string} inputPath
 * @param {string} password   - The password set when the PDF was locked.
 */
async function unlockPdf(inputPath, password) {
  if (!password || password.length < 1) {
    const e = new Error("A password is required to unlock a PDF.");
    e.code = "PASSWORD_REQUIRED";
    throw e;
  }

  const analysis = await validatePdf(inputPath);
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-unlock-"));
  const inputName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${inputName}_unlocked.pdf`);

  try {
    await execFileAsync("qpdf", [
      "--decrypt",
      "--password=" + password,
      inputPath,
      outputPath
    ]);

    const outputStat = await fs.stat(outputPath);
    if (outputStat.size === 0) {
      throw new Error("qpdf produced an empty unlocked file.");
    }

    return assertResult({
      outputPath,
      outputDir,
      analysis,
      outputSizeBytes: outputStat.size,
      locked: false
    });
  } catch (error) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});

    // qpdf exits with code 2 and mentions "password" in stderr on bad password.
    const msg = (error.stderr || error.message || "").toLowerCase();
    if (msg.includes("password") || msg.includes("invalid password")) {
      const e = new Error("Incorrect password — the PDF could not be unlocked.");
      e.code = "WRONG_PASSWORD";
      throw e;
    }

    throw new Error(`PDF unlocking failed: ${error.stderr || error.message}`);
  }
}

module.exports = { lockPdf, unlockPdf };
