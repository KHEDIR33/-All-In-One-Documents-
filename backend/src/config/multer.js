const multer = require("multer");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// Hard upload limit for every file-upload route: 50 MiB.
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: MAX_FILE_SIZE }
});

module.exports = upload;
module.exports.MAX_FILE_SIZE = MAX_FILE_SIZE;
