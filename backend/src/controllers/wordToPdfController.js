const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { wordToPdf } = require("../engines/wordToPdf/wordToPdf.engine");
const {
  createFileMetadata,
  markProcessed,
  deleteFileRecord
} = require("../services/storage/fileRepository");
const {
  uploadTemporaryFile,
  removeTemporaryFile,
  BUCKET
} = require("../services/storage/supabaseStorage");
const { getDeleteAt } = require("../services/filePolicy");

async function convertWordToPdf(req, res, next) {
  let outputDir;
  let fileId;
  let storagePath;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "DOC or DOCX file is required"
      });
    }

    const result = await wordToPdf(req.file.path, {
      mimeType: req.file.mimetype
    });
    outputDir = result.outputDir;

    const source = await createFileMetadata({
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      service: "word_to_pdf",
      status: "uploaded",
      delete_at: getDeleteAt()
    });
    fileId = source.id;

    const outputName = path.basename(result.outputPath);
    storagePath =
      `processed/word-to-pdf/${fileId}/${crypto.randomUUID()}-${outputName}`;

    await uploadTemporaryFile(
      result.outputPath,
      storagePath,
      "application/pdf"
    );

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
      message: "Word document converted to PDF successfully",
      file: {
        id: processed.id,
        name: outputName,
        service: processed.service,
        status: processed.status,
        save_requires_payment: true,
        expires_at: processed.delete_at
      },
      analysis: result.analysis
    });
  } catch (error) {
    if (storagePath) {
      await removeTemporaryFile(storagePath).catch(() => {});
    }
    if (fileId) {
      await deleteFileRecord(fileId).catch(() => {});
    }

    if (error.code === "INVALID_WORD_FILE" || error.code === "EMPTY_WORD_FILE") {
      return res.status(422).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }

    next(error);
  } finally {
    if (req.file?.path) {
      await fs.rm(req.file.path, { force: true }).catch(() => {});
    }
    if (outputDir) {
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

module.exports = { convertWordToPdf };
