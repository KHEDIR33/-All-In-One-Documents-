const express = require("express");
const { download } = require("../controllers/downloadController");

const router = express.Router();
router.get("/:id", download);

module.exports = router;
