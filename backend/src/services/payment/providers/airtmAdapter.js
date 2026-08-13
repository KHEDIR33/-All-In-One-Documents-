/**
 * Airtm Adapter — International payment provider
 *
 * Docs: https://developers.airtm.com
 * NOTE: Airtm Ethiopia eligibility, KYC, payout options, and settlement
 *       must be verified from official Airtm documentation before production.
 */

const crypto = require("crypto");

const AIRTM_API_KEY    = process.env.AIRTM_API_KEY;
const AIRTM_APP_ID     = process.env.AIRTM_APP_ID;
const AIRTM_BASE_URL   = process.env.AIRTM_BASE_URL || "https://app.airtm.com/api/v1";
const WEBHOOK_SECRET   = process.env.AIRTM_WEBHOOK_SECRET;

async function initiatePayment({ txRef, amount, returnUrl, email }) {
  if (!AIRTM_API_KEY || !AIRTM_APP_ID) {
    throw new Error("AIRTM_API_KEY and AIRTM_APP_ID are required");
  }

  const body = {
    app_id: AIRTM_APP_ID,
    reference: txRef,
    amount: String(amount),
    currency: "USD",
    redirect_url: returnUrl || process.env.PAYMENT_RETURN_URL,
    webhook_url: `${process.env.BACKEND_URL}/api/payments/webhook/airtm`,
    ...(email && { email })
  };

  const response = await fetch(`${AIRTM_BASE_URL}/deposits`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${AIRTM_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Airtm initiation failed: ${data.message || response.statusText}`);
  }

  return {
    checkoutUrl: data.deposit_url || data.url,
    txRef
  };
}

async function verifyTransaction(txRef) {
  if (!AIRTM_API_KEY) throw new Error("AIRTM_API_KEY is not configured");

  const response = await fetch(`${AIRTM_BASE_URL}/deposits/${txRef}`, {
    headers: { "Authorization": `Bearer ${AIRTM_API_KEY}` }
  });

  const data = await response.json();
  if (!response.ok) return { verified: false, raw: data };

  return {
    verified: data.status === "completed" || data.status === "confirmed",
    providerTransactionId: data.id || txRef,
    amount: parseFloat(data.amount),
    currency: "USD",
    raw: data
  };
}

function validateWebhookSignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) throw new Error("AIRTM_WEBHOOK_SECRET is not configured");
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

module.exports = { initiatePayment, verifyTransaction, validateWebhookSignature };
