const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { compressPdf } = require("../engines/compression/compression.engine");
const { createFileMetadata, markProcessed, deleteFileRecord } = require("../services/storage/fileRepository");
const { uploadTemporaryFile, BUCKET } = require("../services/storage/supabaseStorage");
const { getDeleteAt } = require("../services/filePolicy");

async function compressPdfHandler(req, res, next) {
  let outputDir;
  let fileId;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }

    // Optional: "high" | "medium" | "low" — defaults to "medium" inside engine
    const level = req.body?.level || "medium";

    const source = await createFileMetadata({
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      service: "pdf_compression",
      status: "uploaded",
      delete_at: getDeleteAt()
    });
    fileId = source.id;

    const result = await compressPdf(req.file.path, { level });
    outputDir = result.outputDir;

    const outputName = path.basename(result.outputPath);
    const storagePath = `processed/compression/${fileId}/${crypto.randomUUID()}-${outputName}`;

    await uploadTemporaryFile(result.outputPath, storagePath, "application/pdf");

    const processed = await markProcessed(fileId, {
      output_name: outputName,
      storage_path: storagePath,
      storage_bucket: BUCKET,
      status: "processed",
      processed_at: new Date().toISOString(),
      delete_at: getDeleteAt()
    });

    return res.status(201).json({
      success: true,
      message: result.wasShrunk
        ? `PDF compressed — ${result.reductionPercent}% smaller`
        : "PDF processed (file was already well-optimised — no further reduction achieved)",
      file: {
        id: processed.id,
        name: outputName,
        service: processed.service,
        status: processed.status,
        save_requires_payment: true,
        expires_at: processed.delete_at
      },
      compression: {
        level,
        originalSizeBytes: result.originalSizeBytes,
        outputSizeBytes: result.outputSizeBytes,
        wasShrunk: result.wasShrunk,
        reductionPercent: result.reductionPercent
      }
    });
  } catch (error) {
    if (fileId) await deleteFileRecord(fileId).catch(() => {});
    next(error);
  } finally {
    if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
    if (outputDir) await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { compressPdfHandler };
