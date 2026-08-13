/**
 * Chapa Adapter — Primary local payment gateway
 * Routes: Telebirr, CBE, Dashen, Abyssinia (user never sees "Chapa")
 *
 * Docs: https://developer.chapa.co
 */

const crypto = require("crypto");

const CHAPA_SECRET_KEY = process.env.CHAPA_SECRET_KEY;
const CHAPA_BASE_URL = "https://api.chapa.co/v1";
const WEBHOOK_SECRET = process.env.CHAPA_WEBHOOK_SECRET;

// Maps the user-facing provider name to the Chapa subaccount/channel.
// Chapa handles the actual routing internally.
const PROVIDER_CHANNEL_MAP = {
  telebirr:  "telebirr",
  cbe:       "cbe",
  dashen:    "dashen_bank",
  abyssinia: "abyssinia_bank"
};

/**
 * Initiate a Chapa payment.
 *
 * @param {object} params
 * @param {string} params.txRef       - Unique transaction reference (our payment.id)
 * @param {number} params.amount      - Amount in ETB
 * @param {string} params.provider    - "telebirr" | "cbe" | "dashen" | "abyssinia"
 * @param {string} params.returnUrl   - URL to redirect user after payment
 * @param {string} [params.email]     - Customer email (optional)
 * @param {string} [params.firstName] - Customer first name (optional)
 */
async function initiatePayment({ txRef, amount, provider, returnUrl, email, firstName }) {
  if (!CHAPA_SECRET_KEY) throw new Error("CHAPA_SECRET_KEY is not configured");

  const channel = PROVIDER_CHANNEL_MAP[provider?.toLowerCase()];
  if (!channel) throw new Error(`Unsupported local provider: ${provider}`);

  const body = {
    amount: String(amount),
    currency: "ETB",
    tx_ref: txRef,
    callback_url: `${process.env.BACKEND_URL}/api/payments/webhook/chapa`,
    return_url: returnUrl || process.env.PAYMENT_RETURN_URL,
    ...(email     && { email }),
    ...(firstName && { first_name: firstName }),
    ...(channel   && { payment_options: channel })
  };

  const response = await fetch(`${CHAPA_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CHAPA_SECRET_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok || data.status !== "success") {
    throw new Error(`Chapa initiation failed: ${data.message || response.statusText}`);
  }

  return {
    checkoutUrl: data.data.checkout_url,
    txRef
  };
}

/**
 * Verify a Chapa payment by tx_ref.
 * Called after webhook fires or user returns from checkout.
 */
async function verifyTransaction(txRef) {
  if (!CHAPA_SECRET_KEY) throw new Error("CHAPA_SECRET_KEY is not configured");

  const response = await fetch(`${CHAPA_BASE_URL}/transaction/verify/${txRef}`, {
    headers: { "Authorization": `Bearer ${CHAPA_SECRET_KEY}` }
  });

  const data = await response.json();

  if (!response.ok || data.status !== "success") {
    return { verified: false, raw: data };
  }

  const tx = data.data;
  return {
    verified: tx.status === "success",
    providerTransactionId: tx.id || txRef,
    amount: parseFloat(tx.amount),
    currency: tx.currency,
    raw: tx
  };
}

/**
 * Validate Chapa webhook signature.
 * Chapa sends X-Chapa-Signature: sha256=<hmac>
 */
function validateWebhookSignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) throw new Error("CHAPA_WEBHOOK_SECRET is not configured");
  if (!signatureHeader) return false;

  const expected = "sha256=" + crypto
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
