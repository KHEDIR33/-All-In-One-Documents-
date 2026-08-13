/**
 * Paddle Adapter — International payment provider
 *
 * Docs: https://developer.paddle.com
 * NOTE: Paddle acts as Merchant of Record. Ethiopia seller eligibility,
 *       KYC, payout, taxes, and fees must be verified before production.
 *       Uses Paddle Billing (v2) API.
 */

const crypto = require("crypto");

const PADDLE_API_KEY    = process.env.PADDLE_API_KEY;
const PADDLE_PRICE_ID   = process.env.PADDLE_PRICE_ID;   // $1 / 7-day price created in Paddle dashboard
const PADDLE_BASE_URL   = process.env.PADDLE_BASE_URL || "https://api.paddle.com";
const WEBHOOK_SECRET    = process.env.PADDLE_WEBHOOK_SECRET;

async function initiatePayment({ txRef, amount, returnUrl, email }) {
  if (!PADDLE_API_KEY || !PADDLE_PRICE_ID) {
    throw new Error("PADDLE_API_KEY and PADDLE_PRICE_ID are required");
  }

  // Create a Paddle checkout session
  const body = {
    items: [{ price_id: PADDLE_PRICE_ID, quantity: 1 }],
    custom_data: { tx_ref: txRef },
    success_url: returnUrl || process.env.PAYMENT_RETURN_URL,
    ...(email && { customer: { email } })
  };

  const response = await fetch(`${PADDLE_BASE_URL}/transactions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PADDLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(`Paddle initiation failed: ${data.error?.detail || response.statusText}`);
  }

  return {
    checkoutUrl: data.data?.checkout?.url,
    txRef,
    paddleTransactionId: data.data?.id
  };
}

async function verifyTransaction(paddleTransactionId) {
  if (!PADDLE_API_KEY) throw new Error("PADDLE_API_KEY is not configured");

  const response = await fetch(`${PADDLE_BASE_URL}/transactions/${paddleTransactionId}`, {
    headers: { "Authorization": `Bearer ${PADDLE_API_KEY}` }
  });

  const data = await response.json();
  if (!response.ok) return { verified: false, raw: data };

  return {
    verified: data.data?.status === "completed" || data.data?.status === "paid",
    providerTransactionId: data.data?.id,
    amount: parseFloat(data.data?.details?.totals?.grand_total || 0) / 100,
    currency: data.data?.currency_code || "USD",
    raw: data.data
  };
}

/**
 * Paddle uses a signature scheme with ts + h1 in the header.
 * Header format: ts=<timestamp>;h1=<hmac>
 */
function validateWebhookSignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) throw new Error("PADDLE_WEBHOOK_SECRET is not configured");
  if (!signatureHeader) return false;

  try {
    const parts = Object.fromEntries(
      signatureHeader.split(";").map(p => p.split("="))
    );
    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) return false;

    const signed = `${ts}:${rawBody}`;
    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(signed)
      .digest("hex");

    return crypto.timingSafeEqual(Buffer.from(h1), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

module.exports = { initiatePayment, verifyTransaction, validateWebhookSignature };
