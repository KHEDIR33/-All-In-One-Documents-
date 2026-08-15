const paymentService = require("../services/payment/paymentService");
const { getWebhookAdapter } = require("../services/payment/paymentRouter");

// ---------------------------------------------------------------------------
// POST /api/payments/create
// Body: { fileId?, service, provider, customerRef?, returnUrl?, email?, firstName? }
// ---------------------------------------------------------------------------
async function createPayment(req, res, next) {
  try {
    const { fileId, documentId, service, provider, customerRef, returnUrl, email, firstName } = req.body;

    if (!service)  return res.status(400).json({ success: false, message: "service is required" });
    if (!provider) return res.status(400).json({ success: false, message: "provider is required" });

    const { payment, checkoutUrl } = await paymentService.createPayment({
      fileId, documentId, service, provider, customerRef, returnUrl, email, firstName
    });

    return res.status(201).json({
      success: true,
      payment: {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        provider: payment.provider,
        status: payment.status,
        access_type: payment.access_type
      },
      checkout_url: checkoutUrl
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/:id/status
// ---------------------------------------------------------------------------
async function getPaymentStatus(req, res, next) {
  try {
    const payment = await paymentService.getPayment(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

    return res.json({
      success: true,
      payment: {
        id: payment.id,
        status: payment.status,
        access_type: payment.access_type,
        provider: payment.provider,
        verified_at: payment.verified_at,
        access_expires_at: payment.access_expires_at
      }
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Shared webhook handler factory
// POST /api/payments/webhook/:gateway
// gateway = "chapa" | "santimpay" | "airtm" | "paddle" | "paypal"
// ---------------------------------------------------------------------------
async function handleWebhook(req, res, next) {
  const gateway = req.params.gateway;

  try {
    const adapter = getWebhookAdapter(gateway);

    // Validate signature
    const rawBody = req.rawBody; // set by express.raw() in routes
    const signatureHeader =
      req.headers["x-chapa-signature"] ||
      req.headers["x-santimpay-signature"] ||
      req.headers["x-airtm-signature"]  ||
      req.headers["paddle-signature"]   ||
      req.headers["paypal-transmission-sig"];

    let sigValid;
    if (gateway === "paypal") {
      sigValid = await adapter.validateWebhookSignature(rawBody, req.headers);
    } else {
      sigValid = adapter.validateWebhookSignature(rawBody, signatureHeader);
    }

    if (!sigValid) {
      console.warn(`Webhook signature validation failed for ${gateway}`);
      return res.status(401).json({ success: false, message: "Invalid webhook signature" });
    }

    const event = JSON.parse(rawBody);

    // Extract paymentId (our txRef) and providerTransactionId from event
    const { paymentId, providerTransactionId, isSuccess } = extractWebhookData(gateway, event);

    if (!isSuccess) {
      // Not a success event — acknowledge and ignore
      return res.json({ success: true, message: "Event received (not a success event)" });
    }

    if (!paymentId) {
      console.error(`Webhook from ${gateway}: could not extract paymentId`, event);
      return res.status(400).json({ success: false, message: "Could not identify payment" });
    }

    const { payment } = await paymentService.verifyAndGrantAccess({ paymentId, providerTransactionId });

    // If payment was made via Telegram bot, trigger auto-deliver
    if (payment?.customer_ref && /^\d+$/.test(payment.customer_ref)) {
      fetch(`${process.env.BACKEND_URL}/bot/payment-confirmed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id, customerRef: payment.customer_ref })
      }).catch(err => console.error("Bot notify error:", err.message));
    }

    return res.json({ success: true });
  } catch (error) {
    console.error(
      `Webhook processing error (${gateway}):`,
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed"
    });
  }


// ---------------------------------------------------------------------------
// Extract payment data from provider-specific webhook payloads
// ---------------------------------------------------------------------------
function extractWebhookData(gateway, event) {
  switch (gateway) {
    case "chapa": {
      const tx = event.data || event;
      return {
        paymentId: tx.tx_ref || tx.reference,
        providerTransactionId: tx.id || tx.transaction_id || tx.tx_ref,
        isSuccess: tx.status === "success" || event.event === "charge.success"
      };
    }
    case "santimpay": {
      const tx = event.data || event;
      return {
        paymentId: tx.reference || tx.tx_ref,
        providerTransactionId: tx.transaction_id || tx.reference,
        isSuccess: tx.status === "success" || tx.payment_status === "paid"
      };
    }
    case "airtm": {
      return {
        paymentId: event.reference || event.custom_data?.tx_ref,
        providerTransactionId: event.id || event.deposit_id,
        isSuccess: event.status === "completed" || event.event === "deposit.completed"
      };
    }
    case "paddle": {
      const tx = event.data || {};
      return {
        paymentId: tx.custom_data?.tx_ref,
        providerTransactionId: tx.id,
        isSuccess: event.event_type === "transaction.completed" || tx.status === "completed"
      };
    }
    case "paypal": {
      const resource = event.resource || {};
      const txRef = resource.purchase_units?.[0]?.reference_id || resource.custom_id;
      return {
        paymentId: txRef,
        providerTransactionId: resource.id || resource.capture_id,
        isSuccess: event.event_type === "PAYMENT.CAPTURE.COMPLETED" ||
                   resource.status === "COMPLETED"
      };
    }
    default:
      return { paymentId: null, providerTransactionId: null, isSuccess: false };
  }
}

module.exports = { createPayment, getPaymentStatus, handleWebhook };
