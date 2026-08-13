/**
 * Bot Payment Handler
 * -------------------
 * Fixes applied:
 * 1. callback_data ≤ 64 bytes — paymentId/fileId stored in session, NOT in callback_data
 * 2. Webhook auto-confirms — no "ከፍዬ ጨርሼያለሁ" button needed
 * 3. File sent directly via sendDocumentFromBuffer (not a link)
 * 4. Payment popup — horizontal layout (ProjectContext fourth)
 */

const { sendMessage, answerCallback, sendChatAction, sendDocumentFromBuffer } = require("../telegramApi");
const session = require("../sessionStore");

const BACKEND = process.env.BACKEND_URL || "http://localhost:10000";
const LOCAL_PROVIDERS = new Set(["telebirr", "cbe", "dashen", "abyssinia"]);

// ---------------------------------------------------------------------------
// Payment popup keyboard — horizontal layout (ProjectContext fourth)
// callback_data: "p:<provider>" — short, no UUIDs (IDs are in session)
// ---------------------------------------------------------------------------
function paymentPopup(context) {
  // context = "conv" (conversion) | "doc" (document download)
  return {
    inline_keyboard: [
      [
        { text: "📱 Telebirr",   callback_data: `p:${context}:telebirr` },
        { text: "🏦 CBE",        callback_data: `p:${context}:cbe` },
        { text: "🏦 Dashen",     callback_data: `p:${context}:dashen` }
      ],
      [
        { text: "🏦 Abyssinia",  callback_data: `p:${context}:abyssinia` },
        { text: "🌎 Airtm",      callback_data: `p:${context}:airtm` },
        { text: "🌎 PayPal",     callback_data: `p:${context}:paypal` }
      ]
    ]
  };
}

// ---------------------------------------------------------------------------
// Show payment popup — called after conversion or document download
// Stores fileId/documentId in SESSION (not in callback_data)
// ---------------------------------------------------------------------------
async function showPaymentPopup(chatId, { fileId, documentId, service, label }) {
  const context = documentId ? "doc" : "conv";

  // Store IDs in session so callback_data stays short
  session.update(chatId, {
    step: "awaiting_payment",
    fileId:     fileId     || null,
    documentId: documentId || null,
    service:    service    || "conversion"
  });

  const amount = "3 ብር (ETB) ወይም $1 (USD - 7 ቀን)";

  await sendMessage(chatId,
    `✅ <b>${label}</b> ተጠናቅቋል!\n\n` +
    `💾 ለማስቀመጥ ይክፈሉ — <b>${amount}</b>\n\n` +
    `👇 የክፍያ ዘዴ ይምረጡ:`,
    { reply_markup: paymentPopup(context) }
  );
}

// ---------------------------------------------------------------------------
// Handle payment provider selection
// callback_data: "p:<context>:<provider>"  — always ≤ 20 chars ✅
// IDs come from session (not from callback_data)
// ---------------------------------------------------------------------------
async function handlePaymentSelection(chatId, userId, callbackQueryId, callbackData) {
  await answerCallback(callbackQueryId);

  const parts = callbackData.split(":");
  if (parts.length < 3) return;

  const [, context, provider] = parts;
  const state = session.get(chatId);

  if (!state || (!state.fileId && !state.documentId)) {
    return sendMessage(chatId, "❌ Session ጊዜው አልፏል። /start ይጫኑ።");
  }

  const market      = LOCAL_PROVIDERS.has(provider) ? "local" : "international";
  const customerRef = String(userId);
  const service     = state.service || (context === "doc" ? "document_download" : "conversion");
  const fileId      = state.fileId     || undefined;
  const documentId  = state.documentId || undefined;

  try {
    const res = await fetch(`${BACKEND}/api/payments/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId, documentId, service, provider, market, customerRef,
        returnUrl: process.env.PAYMENT_RETURN_URL
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return sendMessage(chatId, `❌ ክፍያ መጀመር አልተቻለም: ${data.message || "ስህተት"}`);
    }

    // Store paymentId in session — webhook will use it to auto-deliver
    session.update(chatId, {
      step: "awaiting_payment_confirmation",
      paymentId: data.payment.id
    });

    const amount = market === "local" ? "3 ብር (ETB)" : "$1 (USD - 7 ቀን)";

    await sendMessage(chatId,
      `💳 <b>ክፍያ</b>\n\n` +
      `💰 መጠን: <b>${amount}</b>\n` +
      `📱 አቅራቢ: <b>${provider.toUpperCase()}</b>\n\n` +
      `👇 ክፍያ ለማጠናቀቅ ይጫኑ:\n` +
      `<a href="${data.checkout_url}">💰 ይህን ጫኑ</a>\n\n` +
      `✅ ክፍያ ከጠናቀቁ በኋላ ፋይሉ <b>ወዲያውኑ</b> ይላካሎ።`
    );
  } catch (err) {
    console.error("Payment selection error:", err.message);
    await sendMessage(chatId, "❌ ስህተት ተፈጥሯል። እባክዎ እንደ አዲስ ይሞክሩ።");
  }
}

// ---------------------------------------------------------------------------
// Auto-deliver file after webhook confirms payment
// Called by botRoutes.js when payment webhook fires for a bot user
// ---------------------------------------------------------------------------
async function deliverAfterPayment(chatId, userId, paymentId) {
  const state = session.get(chatId);
  if (!state) return; // session expired — nothing to do

  try {
    await sendChatAction(chatId);

    if (state.fileId) {
      // Conversion result — fetch from backend download endpoint
      await deliverConversionFile(chatId, state.fileId, paymentId);
    } else if (state.documentId) {
      // Document download — prepare and send
      await deliverDocument(chatId, userId, state.documentId);
    }

    session.clear(chatId);
  } catch (err) {
    console.error("deliverAfterPayment error:", err.message);
    await sendMessage(chatId,
      "✅ ክፍያ ተረጋግጧል! ነገር ግን ፋይሉን ማምጣት አልተቻለም።\n" +
      "እባክዎ /start ይጫኑ እና እንደ አዲስ ይሞክሩ።"
    );
  }
}

async function deliverConversionFile(chatId, fileId, paymentId) {
  const dlRes = await fetch(`${BACKEND}/api/download/${fileId}`, {
    headers: { "x-payment-key": paymentId }
  });
  const dlData = await dlRes.json();

  if (!dlRes.ok || !dlData.success) {
    await sendMessage(chatId, "❌ ፋይሉ ጊዜው አልፏል። እንደ አዲስ ይሞክሩ።");
    return;
  }

  // Fetch file bytes and send directly to user
  const fileRes = await fetch(dlData.download_url);
  if (!fileRes.ok) throw new Error("Could not fetch file bytes");

  const buffer   = Buffer.from(await fileRes.arrayBuffer());
  const filename = dlData.filename || "converted_file";

  await sendDocumentFromBuffer(chatId, buffer, filename,
    "✅ ፋይልዎ ዝግጁ ነው! 📄"
  );
}

async function deliverDocument(chatId, userId, documentId) {
  const customerRef = String(userId);

  const prepRes = await fetch(`${BACKEND}/api/documents/${documentId}/prepare-download`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-customer-ref": customerRef }
  });
  const prepData = await prepRes.json();

  if (!prepRes.ok || !prepData.success) {
    await sendMessage(chatId, `❌ ሰነዱን ማዘጋጀት አልተቻለም: ${prepData.message}`);
    return;
  }

  const dlRes  = await fetch(`${BACKEND}/api/documents/download/${prepData.session.id}`);
  const dlData = await dlRes.json();

  if (!dlRes.ok || !dlData.success) {
    await sendMessage(chatId, "❌ ሰነዱን ማምጣት አልተቻለም።");
    return;
  }

  const fileRes = await fetch(dlData.download_url);
  if (!fileRes.ok) throw new Error("Could not fetch document bytes");

  const buffer   = Buffer.from(await fileRes.arrayBuffer());
  const filename = dlData.filename || "document.pdf";

  await sendDocumentFromBuffer(chatId, buffer, filename,
    "✅ ሰነዱ ዝግጁ ነው! 📄"
  );
}

module.exports = {
  showPaymentPopup,
  handlePaymentSelection,
  deliverAfterPayment
};
