const { execFile } = require("child_process");
const fs = require("fs/promises");

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: 30000, maxBuffer: 4 * 1024 * 1024, ...options },
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

async function analyzePdf(inputPath) {
  const stat = await fs.stat(inputPath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error("Invalid or empty PDF file");
  }

  const header = Buffer.alloc(5);
  const handle = await fs.open(inputPath, "r");
  try {
    await handle.read(header, 0, 5, 0);
  } finally {
    await handle.close();
  }

  if (header.toString("ascii") !== "%PDF-") {
    throw new Error("Uploaded file is not a valid PDF");
  }

  let pages = null;
  try {
    const info = await execFileAsync("pdfinfo", [inputPath]);
    const match = info.stdout.match(/^Pages:\s+(\d+)/mi);
    pages = match ? Number(match[1]) : null;
  } catch (_) {
    // pdfinfo is an optimization/metadata dependency, not a hard requirement.
  }

  let extractedText = "";
  try {
    const text = await execFileAsync("pdftotext", ["-layout", inputPath, "-"]);
    extractedText = text.stdout || "";
  } catch (_) {
    // A PDF can still be valid when text extraction is unavailable.
  }

  const normalized = extractedText.replace(/\s+/g, " ").trim();
  const hasSelectableText = normalized.length >= 20;

  return {
    type: "pdf",
    pages,
    hasSelectableText,
    requiresOcr: !hasSelectableText,
    extractedCharacterCount: normalized.length
  };
}

module.exports = { analyzePdf };
