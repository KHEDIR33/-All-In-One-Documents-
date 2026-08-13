const express = require("express");
const { createPayment, getPaymentStatus, handleWebhook } = require("../controllers/paymentController");

const router = express.Router();

// Initiate payment — called by frontend after conversion
// POST /api/payments/create
router.post("/create", createPayment);

// Check payment status — polled by frontend while waiting
// GET /api/payments/:id/status
router.get("/:id/status", getPaymentStatus);

// Webhooks — called by payment providers (raw body needed for signature check)
// POST /api/payments/webhook/:gateway
// gateway = chapa | santimpay | airtm | paddle | paypal
router.post(
  "/webhook/:gateway",
  express.raw({ type: "application/json" }),
  handleWebhook
);

module.exports = router;
