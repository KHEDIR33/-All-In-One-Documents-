const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { editPdf } = require("../engines/pdfEdit/pdfEdit.engine");
const { createFileMetadata, markProcessed, deleteFileRecord } = require("../services/storage/fileRepository");
const { uploadTemporaryFile, BUCKET } = require("../services/storage/supabaseStorage");
const { getDeleteAt } = require("../services/filePolicy");

/**
 * POST /api/conversion/pdf-edit
 *
 * Body (multipart/form-data):
 *   file        — PDF file
 *   annotations — JSON string: [{page, x, y, text, fontSize?}, ...]
 *
 * Example annotations value:
 *   [{"page":0,"x":50,"y":100,"text":"ተፈርሟል","fontSize":14}]
 */
async function editPdfHandler(req, res, next) {
  let outputDir;
  let fileId;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }

    let annotations = [];
    try {
      annotations = JSON.parse(req.body?.annotations || "[]");
    } catch (_) {
      return res.status(400).json({ success: false, message: "annotations must be a valid JSON array" });
    }

    if (!Array.isArray(annotations) || annotations.length === 0) {
      return res.status(400).json({ success: false, message: "At least one annotation is required" });
    }

    const source = await createFileMetadata({
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      service: "pdf_edit",
      status: "uploaded",
      delete_at: getDeleteAt()
    });
    fileId = source.id;

    const result = await editPdf(req.file.path, { annotations });
    outputDir = result.outputDir;

    const outputName = path.basename(result.outputPath);
    const storagePath = `processed/pdf-edit/${fileId}/${crypto.randomUUID()}-${outputName}`;

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
      message: "PDF edited successfully",
      file: {
        id: processed.id,
        name: outputName,
        service: processed.service,
        status: processed.status,
        save_requires_payment: true,
        expires_at: processed.delete_at
      },
      edit: {
        annotationCount: result.annotationCount
      }
    });
  } catch (error) {
    if (fileId) await deleteFileRecord(fileId).catch(() => {});

    if (error.code === "NO_ANNOTATIONS") {
      return res.status(400).json({ success: false, code: error.code, message: error.message });
    }

    next(error);
  } finally {
    if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
    if (outputDir) await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { editPdfHandler };
