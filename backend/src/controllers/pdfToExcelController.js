const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { pdfToExcel } = require("../engines/pdfToExcel/pdfToExcel.engine");
const { createFileMetadata, markProcessed, deleteFileRecord } = require("../services/storage/fileRepository");
const {
  uploadTemporaryFile,
  removeTemporaryFile,
  BUCKET
} = require("../services/storage/supabaseStorage");


const { getDeleteAt } = require("../services/filePolicy");

async function convertPdfToExcel(req, res, next) {
  let outputDir;
let fileId;
let storagePath;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }

    const source = await createFileMetadata({
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      service: "pdf_to_excel",
      status: "uploaded",
      delete_at: getDeleteAt()
    });
    fileId = source.id;

    const result = await pdfToExcel(req.file.path);
    outputDir = result.outputDir;

    const outputName = path.basename(result.outputPath);
storagePath = `processed/pdf-to-excel/${fileId}/${crypto.randomUUID()}-${outputName}`;
    

    await uploadTemporaryFile(
      result.outputPath,
      storagePath,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
      message: "PDF converted to Excel successfully",
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
    if (fileId) await deleteFileRecord(fileId).catch(() => {});

    next(error);
  } finally {
    if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
    if (outputDir) await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { convertPdfToExcel };
