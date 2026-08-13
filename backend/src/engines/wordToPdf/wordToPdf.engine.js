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

const WORD_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword"
]);

async function validateWord(inputPath, mimeType) {
  await assertReadableFile(inputPath);

  const extension = path.extname(inputPath).toLowerCase();
  const allowedExtension = [".docx", ".doc"].includes(extension);

  if (!allowedExtension || (mimeType && !WORD_MIME_TYPES.has(mimeType))) {
    const error = new Error("Only DOC or DOCX files are supported.");
    error.code = "INVALID_WORD_FILE";
    throw error;
  }

  const stat = await fs.stat(inputPath);
  if (stat.size === 0) {
    const error = new Error("The Word document is empty.");
    error.code = "EMPTY_WORD_FILE";
    throw error;
  }

  return {
    extension,
    sizeBytes: stat.size,
    format: extension === ".docx" ? "docx" : "doc"
  };
}

async function wordToPdf(inputPath, options = {}) {
  const analysis = await validateWord(inputPath, options.mimeType);

  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-word-pdf-"));
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-lo-profile-"));

  try {
    await execFileAsync("libreoffice", [
      "--headless",
      `-env:UserInstallation=file://${profileDir}`,
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      inputPath
    ]);

    const inputName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(outputDir, `${inputName}.pdf`);

    try {
      await fs.access(outputPath);
    } catch (_) {
      throw new Error("LibreOffice did not create a PDF output.");
    }

    const outputStat = await fs.stat(outputPath);
    if (outputStat.size === 0) {
      throw new Error("LibreOffice created an empty PDF file.");
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
      `Word to PDF conversion failed: ${error.stderr || error.message}`
    );
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { wordToPdf, validateWord };
