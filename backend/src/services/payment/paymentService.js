const crypto = require("crypto");
const { supabase } = require("../../config/database");
const { createPaymentIntent } = require("../../engines/payment/payment.engine");
const {
  initiatePayment: routerInitiate,
  getMarket,
  getWebhookAdapter
} = require("./paymentRouter");
const { grantFromVerifiedPayment } = require("../access/accessService");

idempotency_key:
  data.idempotencyKey || crypto.randomUUID(),
// ---------------------------------------------------------------------------
// Create payment record + initiate with provider
// ---------------------------------------------------------------------------
async function createPayment(data) {
  const market = data.market || getMarket(data.provider);
  const intent = createPaymentIntent({ ...data, market });
  const paymentKey = crypto.randomUUID();

  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      payment_key: paymentKey,
      file_id: intent.file_id,
      document_id: intent.document_id,
      provider: intent.provider,
      amount: intent.amount,
      currency: intent.currency,
      status: "pending",
      service: intent.service,
      access_type: intent.access_type,
      customer_ref: intent.customer_ref,
      access_expires_at: intent.duration_days
        ? new Date(Date.now() + intent.duration_days * 24 * 60 * 60 * 1000).toISOString()
        : null
    })
    .select()
    .single();

  if (error) throw error;

  if (data.idempotencyKey) {
  const { data: existing, error: lookupError } =
    await supabase
      .from("payments")
      .select("*")
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    return {
      payment: existing,
      checkoutUrl: null,
      idempotentReplay: true
    };
  }
}

  // Initiate with payment provider — use payment.id as txRef
  const providerResult = await routerInitiate({
    txRef: payment.id,
    amount: payment.amount,
    provider: payment.provider,
    returnUrl: data.returnUrl,
    email: data.email,
    firstName: data.firstName
  });

  return { payment, checkoutUrl: providerResult.checkoutUrl };
}

if (
  payment.provider_gateway &&
  payment.provider_gateway !== gateway
) {
  throw new Error("Payment gateway mismatch");
}

if (
  verifiedAmount == null ||
  Number(verifiedAmount) !== Number(payment.amount)
) {
  throw new Error("Payment amount mismatch");
}

if (
  !verifiedCurrency ||
  String(verifiedCurrency).toUpperCase() !==
    String(payment.currency).toUpperCase()
) {
  throw new Error("Payment currency mismatch");
}

// ---------------------------------------------------------------------------
// Called only by trusted webhook handlers after authentic verification
// ---------------------------------------------------------------------------
const { recordServiceUsage } = require("../access/usageService");

async function verifyAndGrantAccess({
  paymentId,
  providerTransactionId,
  gateway,
  verifiedAmount,
  verifiedCurrency
}) {

}) {
  if (!paymentId || !providerTransactionId) {
    throw new Error("paymentId and providerTransactionId are required");
  }

if (
  payment.access_type === "seven_day" &&
  !alreadyVerified
) {
  await recordServiceUsage({
    customerRef: payment.customer_ref,
    service: payment.service
  });
}
  

  // Idempotency — if already verified, just return the existing payment
  const { data: existing } = await supabase
    .from("payments").select("*").eq("id", paymentId).maybeSingle();

if (existing?.status === "verified") {
  // Payment is already verified. Re-check/recreate the access grant
  // so a previous grant failure can be recovered safely.
  const grant = await grantFromVerifiedPayment(existing);

  return {
    payment: existing,
    grant,
    alreadyVerified: true
  };
}


  const { data: payment, error } = await supabase
    .from("payments")
    .update({
      status: "verified",
      provider_transaction_id: providerTransactionId,
      verified_at: new Date().toISOString()
    })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select()
    .single();

  if (error) throw error;
  if (!payment) throw new Error("Payment not found, already verified, or not pending");

  const grant = await grantFromVerifiedPayment(payment);
  return { payment, grant, alreadyVerified: false };
}

async function getPayment(paymentId) {
  const { data, error } = await supabase
    .from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (error) throw error;
  return data;
}

module.exports = { createPayment, verifyAndGrantAccess, getPayment };
