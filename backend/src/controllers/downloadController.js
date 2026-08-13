const { getFileById } = require("../services/storage/fileRepository");
const { createDownloadUrl } = require("../services/storage/supabaseStorage");
const { hasFileAccess } = require("../services/access/accessService");

async function download(req, res, next) {
  try {
    const file = await getFileById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: "File not found or expired" });
    if (file.status !== "processed" || !file.storage_path) {
      return res.status(409).json({ success: false, message: "File is not ready" });
    }
    if (new Date(file.delete_at).getTime() <= Date.now()) {
      return res.status(410).json({ success: false, message: "File has expired" });
    }

    const customerRef = req.get("x-customer-ref") || null;
    const allowed = await hasFileAccess({ fileId: file.id, customerRef });
    if (!allowed) {
      return res.status(403).json({
        success: false,
        code: "PAYMENT_REQUIRED",
        message: "Payment verification is required before download"
      });
    }

    const signedUrl = await createDownloadUrl(file.storage_path, 120);
    return res.json({
      success: true,
      file: { id: file.id, name: file.output_name },
      download_url: signedUrl,
      expires_in_seconds: 120
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { download };
