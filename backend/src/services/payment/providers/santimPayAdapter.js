/**
 * SantimPay Adapter — Secondary local fallback gateway
 * Used when Chapa is unavailable or fails.
 * User never sees "SantimPay" — they see Telebirr/CBE/Dashen/Abyssinia.
 *
 * Docs: https://santimpay.com/docs
 * NOTE: API details must be verified from official SantimPay documentation
 *       before production use. Endpoint paths may change.
 */

const crypto = require("crypto");

const SANTIMPAY_API_KEY    = process.env.SANTIMPAY_API_KEY;
const SANTIMPAY_BASE_URL   = process.env.SANTIMPAY_BASE_URL || "https://api.santimpay.com/v1";
const SANTIMPAY_MERCHANT   = process.env.SANTIMPAY_MERCHANT_ID;
const WEBHOOK_SECRET       = process.env.SANTIMPAY_WEBHOOK_SECRET;

async function initiatePayment({ txRef, amount, provider, returnUrl, email }) {
  if (!SANTIMPAY_API_KEY) throw new Error("SANTIMPAY_API_KEY is not configured");

  const body = {
    merchant_id: SANTIMPAY_MERCHANT,
    amount: String(amount),
    currency: "ETB",
    reference: txRef,
    payment_method: provider,
    callback_url: `${process.env.BACKEND_URL}/api/payments/webhook/santimpay`,
    return_url: returnUrl || process.env.PAYMENT_RETURN_URL,
    ...(email && { customer_email: email })
  };

  const response = await fetch(`${SANTIMPAY_BASE_URL}/payment/initialize`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SANTIMPAY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(`SantimPay initiation failed: ${data.message || response.statusText}`);
  }

  return {
    checkoutUrl: data.data?.checkout_url || data.redirect_url,
    txRef
  };
}

async function verifyTransaction(txRef) {
  if (!SANTIMPAY_API_KEY) throw new Error("SANTIMPAY_API_KEY is not configured");

  const response = await fetch(`${SANTIMPAY_BASE_URL}/payment/verify/${txRef}`, {
    headers: { "Authorization": `Bearer ${SANTIMPAY_API_KEY}` }
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    return { verified: false, raw: data };
  }

  const tx = data.data || data;
  return {
    verified: tx.status === "success" || tx.payment_status === "paid",
    providerTransactionId: tx.transaction_id || tx.reference || txRef,
    amount: parseFloat(tx.amount),
    currency: "ETB",
    raw: tx
  };
}

function validateWebhookSignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) throw new Error("SANTIMPAY_WEBHOOK_SECRET is not configured");
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
