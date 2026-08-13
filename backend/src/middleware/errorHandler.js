function errorHandler(err, req, res, next) {
  console.error(err);

  // Multer upload errors
  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        code: "FILE_TOO_LARGE",
        message: "File exceeds the 50 MiB upload limit"
      });
    }

    return res.status(400).json({
      success: false,
      code: err.code,
      message: err.message
    });
  }

  // Custom errors
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Server error"
  });
}

module.exports = errorHandler;
