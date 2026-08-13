const express = require("express");
const { search, preview, prepareDownload, downloadBySession } = require("../controllers/documentController");

const router = express.Router();

// GET /api/documents/search?q=&language=&category=&file_type=
router.get("/search", search);

// GET /api/documents/download/:sessionId  — must be before /:id
router.get("/download/:sessionId", downloadBySession);

// GET /api/documents/:id
router.get("/:id", preview);

// POST /api/documents/:id/prepare-download
router.post("/:id/prepare-download", prepareDownload);

module.exports = router;
