const express = require("express");
const { dispatch } = require("../bot/dispatcher");
const { deliverAfterPayment } = require("../bot/handlers/paymentHandler");
const { supabase } = require("../config/database");

const router = express.Router();

const BOT_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const BOT_INTERNAL_SECRET = process.env.BOT_INTERNAL_SECRET;
// ---------------------------------------------------------------------------
// POST /bot/webhook — Telegram updates
// ---------------------------------------------------------------------------
router.post(
  "/webhook",
  express.json(),
  async (req, res) => {
    if (BOT_SECRET) {
      const incoming = req.headers["x-telegram-bot-api-secret-token"] || "";
      if (incoming !== BOT_SECRET) return res.status(401).json({ ok: false });
    }
    res.json({ ok: true }); // respond immediately
    dispatch(req.body).catch(err => console.error("Bot dispatch error:", err.message));
  }
);

// ---------------------------------------------------------------------------
// POST /bot/payment-confirmed — called internally by paymentController
// after a webhook from Chapa/PayPal/etc confirms a payment made via bot.
//
// paymentController.js calls this when:
//   payment.customer_ref looks like a Telegram user_id (numeric string)
// ---------------------------------------------------------------------------
const incoming =
  req.headers["x-bot-internal-secret"] || "";

if (
  !BOT_INTERNAL_SECRET ||
  incoming !== BOT_INTERNAL_SECRET
) {
  return res.status(401).json({ ok: false });
}
router.post
  "/payment-confirmed",
  express.json(),
  async (req, res) => {
    const { paymentId, customerRef } = req.body;
    res.json({ ok: true }); // respond immediately

    if (!paymentId || !customerRef) return;

    // customerRef for bot users is the Telegram chat_id (user_id as string)
    const chatId = customerRef;
    const userId = customerRef;

    deliverAfterPayment(chatId, userId, paymentId).catch(err =>
      console.error("Auto-deliver error:", err.message)
    );
  }
);

// ---------------------------------------------------------------------------
// GET /bot/setup — register webhook with Telegram (call once after deploy)
// ---------------------------------------------------------------------------
router.get("/setup", async (req, res) => {
  try {
    const { setWebhook } = require("../bot/telegramApi");
    const webhookUrl = `${process.env.BACKEND_URL}/bot/webhook`;
    const result = await setWebhook(webhookUrl);
    res.json({ ok: true, result, webhookUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
