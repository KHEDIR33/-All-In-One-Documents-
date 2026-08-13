const allowedTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function validateFile(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "File is required" });
  }

  if (!allowedTypes.has(req.file.mimetype)) {
    return res.status(400).json({ success: false, message: "File type not supported" });
  }

  next();
}

module.exports = validateFile;
