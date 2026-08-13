const { getFileById } = require("./storage/fileRepository");
const { createDownloadUrl } = require("./storage/supabaseStorage");

async function getDownload(fileId) {
  const file = await getFileById(fileId);
  if (!file) {
    const error = new Error("File not found or expired");
    error.statusCode = 404;
    throw error;
  }
  if (file.status !== "processed" || !file.storage_path) {
    const error = new Error("File is not ready");
    error.statusCode = 409;
    throw error;
  }
  if (new Date(file.delete_at).getTime() <= Date.now()) {
    const error = new Error("File has expired");
    error.statusCode = 410;
    throw error;
  }

  // Payment verification is intentionally a separate shared layer.
  // Do not issue a download URL here until access has been verified.
  const signedUrl = await createDownloadUrl(file.storage_path, 120);
  return { file, signedUrl };
}

module.exports = { getDownload };
