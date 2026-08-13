const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { lockPdf, unlockPdf } = require("../engines/lockUnlock/lockUnlock.engine");
const { createFileMetadata, markProcessed, deleteFileRecord } = require("../services/storage/fileRepository");
const { uploadTemporaryFile, BUCKET } = require("../services/storage/supabaseStorage");
const { getDeleteAt } = require("../services/filePolicy");

async function _process(req, res, next, action) {
  let outputDir;
  let fileId;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }

    const password = req.body?.password;
    if (!password) {
      return res.status(400).json({ success: false, message: "Password is required" });
    }

    const service = action === "lock" ? "pdf_lock" : "pdf_unlock";

    const source = await createFileMetadata({
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      service,
      status: "uploaded",
      delete_at: getDeleteAt()
    });
    fileId = source.id;

    const result = action === "lock"
      ? await lockPdf(req.file.path, password)
      : await unlockPdf(req.file.path, password);

    outputDir = result.outputDir;

    const outputName = path.basename(result.outputPath);
    const storagePath = `processed/${service}/${fileId}/${crypto.randomUUID()}-${outputName}`;

    await uploadTemporaryFile(result.outputPath, storagePath, "application/pdf");

    const processed = await markProcessed(fileId, {
      output_name: outputName,
      storage_path: storagePath,
      storage_bucket: BUCKET,
      status: "processed",
      processed_at: new Date().toISOString(),
      delete_at: getDeleteAt()
    });

    const message = action === "lock"
      ? "PDF locked successfully"
      : "PDF unlocked successfully";

    return res.status(201).json({
      success: true,
      message,
      file: {
        id: processed.id,
        name: outputName,
        service: processed.service,
        status: processed.status,
        save_requires_payment: true,
        expires_at: processed.delete_at
      }
    });
  } catch (error) {
    if (fileId) await deleteFileRecord(fileId).catch(() => {});

    if (error.code === "WRONG_PASSWORD") {
      return res.status(401).json({ success: false, code: error.code, message: error.message });
    }
    if (error.code === "PASSWORD_REQUIRED") {
      return res.status(400).json({ success: false, code: error.code, message: error.message });
    }
    if (error.code === "INVALID_PDF" || error.code === "EMPTY_PDF") {
      return res.status(422).json({ success: false, code: error.code, message: error.message });
    }

    next(error);
  } finally {
    if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
    if (outputDir) await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function lockPdfHandler(req, res, next) {
  return _process(req, res, next, "lock");
}

async function unlockPdfHandler(req, res, next) {
  return _process(req, res, next, "unlock");
}

module.exports = { lockPdfHandler, unlockPdfHandler };
