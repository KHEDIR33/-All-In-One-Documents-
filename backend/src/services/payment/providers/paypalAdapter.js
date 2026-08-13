/**
 * PayPal Adapter — International payment provider
 *
 * Docs: https://developer.paypal.com/docs/api/orders/v2
 * NOTE: PayPal Ethiopia eligibility, KYC, payout, and settlement options
 *       must be verified from official PayPal documentation before production.
 */

const crypto = require("crypto");

const PAYPAL_CLIENT_ID     = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_WEBHOOK_ID    = process.env.PAYPAL_WEBHOOK_ID;
const PAYPAL_BASE_URL      = process.env.PAYPAL_MODE === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

// Cache access token to avoid fetching it on every request
let _tokenCache = null;

async function getAccessToken() {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60000) {
    return _tokenCache.token;
  }
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required");
  }

  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`PayPal auth failed: ${data.error_description}`);

  _tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  };
  return _tokenCache.token;
}

async function initiatePayment({ txRef, amount, returnUrl }) {
  const token = await getAccessToken();

  const body = {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: txRef,
      amount: { currency_code: "USD", value: String(amount) }
    }],
    application_context: {
      return_url: returnUrl || process.env.PAYMENT_RETURN_URL,
      cancel_url: process.env.PAYMENT_CANCEL_URL || process.env.PAYMENT_RETURN_URL,
      brand_name: "All-In-One Documents",
      user_action: "PAY_NOW"
    }
  };

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`PayPal order creation failed: ${data.message || response.statusText}`);
  }

  const approveLink = data.links?.find(l => l.rel === "approve")?.href;
  return { checkoutUrl: approveLink, txRef, orderId: data.id };
}

async function captureOrder(orderId) {
  const token = await getAccessToken();

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();
  if (!response.ok) return { verified: false, raw: data };

  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    verified: capture?.status === "COMPLETED",
    providerTransactionId: capture?.id || orderId,
    amount: parseFloat(capture?.amount?.value || 0),
    currency: capture?.amount?.currency_code || "USD",
    raw: data
  };
}

async function verifyTransaction(orderId) {
  return captureOrder(orderId);
}

/**
 * PayPal webhook validation using PayPal's own verification API.
 * More reliable than HMAC for PayPal — they recommend this approach.
 */
async function validateWebhookSignature(rawBody, headers) {
  if (!PAYPAL_WEBHOOK_ID) throw new Error("PAYPAL_WEBHOOK_ID is not configured");

  const token = await getAccessToken();
  const body = {
    auth_algo:         headers["paypal-auth-algo"],
    cert_url:          headers["paypal-cert-url"],
    transmission_id:   headers["paypal-transmission-id"],
    transmission_sig:  headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id:        PAYPAL_WEBHOOK_ID,
    webhook_event:     JSON.parse(rawBody)
  };

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  return data.verification_status === "SUCCESS";
}

module.exports = { initiatePayment, verifyTransaction, validateWebhookSignature };
