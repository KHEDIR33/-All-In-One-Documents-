const express = require("express");
const upload = require("../config/multer");
const validateFile = require("../middleware/uploadValidation");
const { convertWordToPdf } = require("../controllers/wordToPdfController");

const router = express.Router();

// Uses the same 50 MiB upload policy as all other conversion routes.
router.post("/", upload.single("file"), validateFile, convertWordToPdf);

module.exports = router;
