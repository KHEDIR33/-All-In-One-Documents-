/**
 * Payment Provider Router
 * -----------------------
 * Maps user-facing provider names → correct adapter.
 *
 * User sees:   Telebirr | CBE | Dashen | Abyssinia | Airtm | Paddle | PayPal
 * User never sees: Chapa | SantimPay
 *
 * Backend routing:
 *   Local (telebirr/cbe/dashen/abyssinia) → Chapa (primary) → SantimPay (fallback)
 *   International (airtm/paddle/paypal)   → Direct adapter
 */

const chapaAdapter    = require("./providers/chapaAdapter");
const santimPayAdapter = require("./providers/santimPayAdapter");
const airtmAdapter    = require("./providers/airtmAdapter");
const paddleAdapter   = require("./providers/paddleAdapter");
const paypalAdapter   = require("./providers/paypalAdapter");

const LOCAL_PROVIDERS         = new Set(["telebirr", "cbe", "dashen", "abyssinia"]);
const INTERNATIONAL_PROVIDERS = new Set(["airtm", "paddle", "paypal"]);

function getMarket(provider) {
  const p = provider?.toLowerCase();
  if (LOCAL_PROVIDERS.has(p))         return "local";
  if (INTERNATIONAL_PROVIDERS.has(p)) return "international";
  throw new Error(`Unknown payment provider: ${provider}`);
}
const result = await chapaAdapter.initiatePayment(params);
const result = await chapaAdapter.initiatePayment(params);
return { ...result, gateway: "chapa" };
const result = await santimPayAdapter.initiatePayment(params);
return { ...result, gateway: "santimpay" };
if (provider === "airtm") {
  const result = await airtmAdapter.initiatePayment(params);
  return { ...result, gateway: "airtm" };
}

if (provider === "paddle") {
  const result = await paddleAdapter.initiatePayment(params);
  return { ...result, gateway: "paddle" };
}

if (provider === "paypal") {
  const result = await paypalAdapter.initiatePayment(params);
  return { ...result, gateway: "paypal" };
}


/**
 * Initiate a payment through the correct adapter.
 * Local providers try Chapa first, fall back to SantimPay on failure.
 */
async function initiatePayment(params) {
  const provider = params.provider?.toLowerCase();

  if (LOCAL_PROVIDERS.has(provider)) {
    try {
      return await chapaAdapter.initiatePayment(params);
    } catch (chapErr) {
      console.warn(`Chapa failed for ${provider}, falling back to SantimPay:`, chapErr.message);
      try {
        return await santimPayAdapter.initiatePayment(params);
      } catch (santimErr) {
        throw new Error(`All local payment gateways failed. Chapa: ${chapErr.message}. SantimPay: ${santimErr.message}`);
      }
    }
  }

  if (provider === "airtm")  return airtmAdapter.initiatePayment(params);
  if (provider === "paddle")  return paddleAdapter.initiatePayment(params);
  if (provider === "paypal")  return paypalAdapter.initiatePayment(params);

  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Get the correct adapter for webhook processing.
 */
function getWebhookAdapter(gateway) {
  switch (gateway?.toLowerCase()) {
    case "chapa":     return chapaAdapter;
    case "santimpay": return santimPayAdapter;
    case "airtm":     return airtmAdapter;
    case "paddle":    return paddleAdapter;
    case "paypal":    return paypalAdapter;
    default: throw new Error(`Unknown webhook gateway: ${gateway}`);
  }
}

module.exports = { initiatePayment, getWebhookAdapter, getMarket, LOCAL_PROVIDERS, INTERNATIONAL_PROVIDERS };
