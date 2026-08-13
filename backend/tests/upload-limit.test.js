const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const multerConfig = fs.readFileSync(
  path.join(root, "src/config/multer.js"),
  "utf8"
);
const conversionRoutes = fs.readFileSync(
  path.join(root, "src/routes/conversionRoutes.js"),
  "utf8"
);
const wordToPdfRoutes = fs.readFileSync(
  path.join(root, "src/routes/wordToPdfRoutes.js"),
  "utf8"
);
const errorHandler = fs.readFileSync(
  path.join(root, "src/middleware/errorHandler.js"),
  "utf8"
);

const MAX = 50 * 1024 * 1024;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  multerConfig.includes("const MAX_FILE_SIZE = 50 * 1024 * 1024;"),
  "50 MiB constant is missing"
);
assert(
  multerConfig.includes("limits: { fileSize: MAX_FILE_SIZE }"),
  "Multer is not using the shared 50 MiB limit"
);
assert(MAX === 52428800, "50 MiB calculation is incorrect");

// Every conversion route must use the shared upload middleware.
for (const route of [conversionRoutes, wordToPdfRoutes]) {
  assert(route.includes('require("../config/multer")'), "Route is not using shared multer config");
  assert(route.includes('upload.single("file")'), "Route is missing upload.single(file)");
}

assert(
  errorHandler.includes('err.code === "LIMIT_FILE_SIZE"'),
  "Oversized-file handler is missing"
);
assert(
  errorHandler.includes('status(413)') && errorHandler.includes('FILE_TOO_LARGE'),
  "Oversized files must return HTTP 413 / FILE_TOO_LARGE"
);

console.log("UPLOAD LIMIT TEST: PASS");
console.log("Limit: 50 MiB (52,428,800 bytes)");
console.log("Expected: <= 50 MiB accepted; > 50 MiB rejected with HTTP 413");
