const { findExpiredFiles, deleteFileRecord } = require("./storage/fileRepository");
const { removeTemporaryFile } = require("./storage/supabaseStorage");
const { findExpiredDownloadSessions, deleteDownloadSession } = require("./search/documentRepository");

async function cleanupExpiredFiles() {
  const files = await findExpiredFiles();
  for (const file of files) {
    try {
      await removeTemporaryFile(file.storage_path);
    } catch (error) {
      console.error(`Storage cleanup failed for ${file.id}:`, error.message);
      continue;
    }
    await deleteFileRecord(file.id);
    console.log(`Expired conversion file cleaned: ${file.id}`);
  }
}

async function cleanupExpiredDocumentSessions() {
  const sessions = await findExpiredDownloadSessions();
  for (const session of sessions) {
    try {
      if (session.storage_path) await removeTemporaryFile(session.storage_path);
    } catch (error) {
      console.error(`Storage cleanup failed for session ${session.id}:`, error.message);
      continue;
    }
    await deleteDownloadSession(session.id);
    console.log(`Expired document session cleaned: ${session.id}`);
  }
}

function startCleanupWorker() {
  const intervalMs = 60 * 1000;
  async function runAll() {
    await cleanupExpiredFiles().catch(err =>
      console.error("Conversion cleanup failed:", err.message));
    await cleanupExpiredDocumentSessions().catch(err =>
      console.error("Document session cleanup failed:", err.message));
  }
  runAll();
  return setInterval(runAll, intervalMs);
}

module.exports = { startCleanupWorker };
