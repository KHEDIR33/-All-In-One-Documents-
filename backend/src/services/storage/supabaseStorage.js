const fs = require("fs/promises");
const { supabase } = require("../../config/database");

const BUCKET = process.env.SUPABASE_TEMP_BUCKET || "processing-files";

async function uploadTemporaryFile(localPath, storagePath, contentType) {
  const fileBuffer = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, fileBuffer, {
    contentType,
    upsert: true
  });
  if (error) throw error;
  return storagePath;
}

async function createDownloadUrl(storagePath, expiresIn = 120) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

async function removeTemporaryFile(storagePath) {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw error;
}

module.exports = { BUCKET, uploadTemporaryFile, createDownloadUrl, removeTemporaryFile };
