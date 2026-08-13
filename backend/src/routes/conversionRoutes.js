const express = require("express");
const upload = require("../config/multer");
const validateFile = require("../middleware/uploadValidation");

const { convertPdfToWord }  = require("../controllers/pdfToWordController");
const { convertWordToPdf }  = require("../controllers/wordToPdfController");
const { convertPdfToExcel } = require("../controllers/pdfToExcelController");
const { compressPdfHandler } = require("../controllers/compressionController");
const { lockPdfHandler, unlockPdfHandler } = require("../controllers/lockUnlockController");
const { editPdfHandler }    = require("../controllers/pdfEditController");

const router = express.Router();

// --- Conversion ---
router.post("/pdf-to-word",  upload.single("file"), validateFile, convertPdfToWord);
router.post("/word-to-pdf",  upload.single("file"), validateFile, convertWordToPdf);
router.post("/pdf-to-excel", upload.single("file"), validateFile, convertPdfToExcel);

// --- Processing ---
router.post("/compress",     upload.single("file"), validateFile, compressPdfHandler);
router.post("/lock",         upload.single("file"), validateFile, lockPdfHandler);
router.post("/unlock",       upload.single("file"), validateFile, unlockPdfHandler);
router.post("/pdf-edit",     upload.single("file"), validateFile, editPdfHandler);

module.exports = router;
