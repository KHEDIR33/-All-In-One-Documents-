/*
 * Real Supabase integration test.
 * Run only with a real Supabase project configured in the environment.
 * The test creates temporary DB/storage data and removes it in finally.
 */
const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("SUPABASE_INTEGRATION_TEST: SKIPPED (Supabase env vars are not configured)");
    return;
  }

  const { supabase } = require("../src/config/database");
  const { BUCKET, uploadTemporaryFile, createDownloadUrl, removeTemporaryFile } = require("../src/services/storage/supabaseStorage");
  const { createFileMetadata, deleteFileRecord } = require("../src/services/storage/fileRepository");

  const token = crypto.randomUUID();
  const localPath = path.join(os.tmpdir(), `supabase-integration-${token}.txt`);
  const storagePath = `tests/${token}/sample.txt`;
  let fileId;

  try {
    await fs.writeFile(localPath, "All-In-One Documents Supabase integration test", "utf8");

    const bucketCheck = await supabase.storage.from(BUCKET).list("tests", { limit: 1 });
    assert.ifError(bucketCheck.error);

    const row = await createFileMetadata({
      original_name: "sample.txt",
      mime_type: "text/plain",
      size_bytes: (await fs.stat(localPath)).size,
      service: "integration_test",
      status: "processed",
      storage_bucket: BUCKET,
      storage_path: storagePath,
      processed_at: new Date().toISOString(),
      delete_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    });
    fileId = row.id;

    await uploadTemporaryFile(localPath, storagePath, "text/plain");

    const signedUrl = await createDownloadUrl(storagePath, 120);
    assert.ok(signedUrl.startsWith("http"), "Signed URL should be an absolute URL");

    const response = await fetch(signedUrl);
    assert.equal(response.status, 200, "Signed URL should return the stored file");
    const body = await response.text();
    assert.equal(body, "All-In-One Documents Supabase integration test");

    console.log("SUPABASE_INTEGRATION_TEST: PASS");
  } finally {
    await removeTemporaryFile(storagePath).catch(() => {});
    if (fileId) await deleteFileRecord(fileId).catch(() => {});
    await fs.rm(localPath, { force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error("SUPABASE_INTEGRATION_TEST: FAIL");
  console.error(error);
  process.exit(1);
});
