const { supabase } = require("../../config/database");

const TTL_MINUTES = Number(process.env.DOCUMENT_DOWNLOAD_TTL_MINUTES || 3);

function getDeleteAt() {
  return new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString();
}

async function createDownloadSession({ documentId, customerRef }) {
  const { data, error } = await supabase
    .from("document_downloads")
    .insert({ document_id: documentId, customer_ref: customerRef || null, status: "pending", delete_at: getDeleteAt() })
    .select().single();
  if (error) throw error;
  return data;
}

async function markDownloadReady(sessionId, { storagePath, storageBucket }) {
  const { data, error } = await supabase
    .from("document_downloads")
    .update({ storage_path: storagePath, storage_bucket: storageBucket, status: "ready", delete_at: getDeleteAt() })
    .eq("id", sessionId).select().single();
  if (error) throw error;
  return data;
}

async function getDownloadSession(sessionId) {
  const { data, error } = await supabase
    .from("document_downloads").select("*").eq("id", sessionId).maybeSingle();
  if (error) throw error;
  return data;
}

async function findExpiredDownloadSessions() {
  const { data, error } = await supabase
    .from("document_downloads").select("id, storage_path")
    .lte("delete_at", new Date().toISOString())
    .not("storage_path", "is", null);
  if (error) throw error;
  return data || [];
}

async function deleteDownloadSession(sessionId) {
  const { error } = await supabase.from("document_downloads").delete().eq("id", sessionId);
  if (error) throw error;
}

module.exports = { createDownloadSession, markDownloadReady, getDownloadSession, findExpiredDownloadSessions, deleteDownloadSession };
