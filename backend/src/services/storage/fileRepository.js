const { supabase } = require("../../config/database");

async function createFileMetadata(data) {
  const { data: row, error } = await supabase.from("files").insert(data).select().single();
  if (error) throw error;
  return row;
}

async function getFileById(id) {
  const { data, error } = await supabase.from("files").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function markProcessed(id, values) {
  const { data, error } = await supabase.from("files").update(values).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

async function findExpiredFiles() {
  const { data, error } = await supabase
    .from("files")
    .select("id, storage_path, delete_at")
    .lte("delete_at", new Date().toISOString())
    .not("storage_path", "is", null);

  if (error) throw error;
  return data || [];
}

async function deleteFileRecord(id) {
  const { error } = await supabase.from("files").delete().eq("id", id);
  if (error) throw error;
}

module.exports = { createFileMetadata, getFileById, markProcessed, findExpiredFiles, deleteFileRecord };
