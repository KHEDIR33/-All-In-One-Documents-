/**
 * Bot Search Handler
 * ------------------
 * Flow: Search → Results → Open/View (preview) → Save to Device → Payment popup → File sent
 *
 * Fixes applied:
 * 1. callback_data ≤ 64 bytes — only short prefixes + documentId (36 chars UUID is fine alone)
 * 2. No duplicate API call — is_free cached in session after preview
 * 3. Free docs delivered directly, paid docs show payment popup
 * 4. File sent via sendDocumentFromBuffer (not a link)
 */

const { sendMessage, sendChatAction, answerCallback } = require("../telegramApi");
const { showPaymentPopup, deliverDocument } = require("./paymentHandler");
const session = require("../sessionStore");

const BACKEND = process.env.BACKEND_URL || "http://localhost:10000";

// ---------------------------------------------------------------------------
// 1. Search
// ---------------------------------------------------------------------------
async function handleSearch(chatId, userId, query) {
  try {
    await sendChatAction(chatId, "typing");

    const res  = await fetch(`${BACKEND}/api/documents/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      return sendMessage(chatId, "❌ ፍለጋ አልተሳካም። እንደ አዲስ ይሞክሩ።");
    }

    const results = data.top_results || [];

    if (results.length === 0) {
      return sendMessage(chatId,
        `🔍 "<b>${query}</b>" — ምንም ሰነድ አልተገኘም።\n\nሌላ ቃል ይሞክሩ።`
      );
    }

    // Top 5 results — one button per row
    // callback_data: "dv:<documentId>" — max ~40 chars ✅
    const buttons = results.slice(0, 5).map(doc => ([{
      text: `📄 ${doc.title.substring(0, 48)}${doc.title.length > 48 ? "…" : ""} ${doc.is_free ? "🆓" : "💰"}`,
      callback_data: `dv:${doc.id}`
    }]));

    await sendMessage(chatId,
      `🔍 "<b>${query}</b>" — ${results.length} ሰነድ ተገኘ:\n\nለመክፈት ይምረጡ:`,
      { reply_markup: { inline_keyboard: buttons } }
    );
  } catch (err) {
    console.error("Search error:", err.message);
    await sendMessage(chatId, "❌ ስህተት ተፈጥሯል። እባክዎ እንደ አዲስ ይሞክሩ።");
  }
}

// ---------------------------------------------------------------------------
// 2. Open/View — user tapped a result
// callback_data: "dv:<documentId>"
// ---------------------------------------------------------------------------
async function handleDocumentView(chatId, userId, callbackQueryId, documentId) {
  await answerCallback(callbackQueryId);

  try {
    const res  = await fetch(`${BACKEND}/api/documents/${documentId}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      return sendMessage(chatId, "❌ ሰነዱ ሊገኝ አልቻለም።");
    }

    const doc  = data.document;
    const size = doc.file_size_bytes
      ? `${(doc.file_size_bytes / 1024 / 1024).toFixed(1)} MB`
      : "—";
    const lang = doc.language === "am" ? "አማርኛ"
               : doc.language === "en" ? "English"
               : "Mixed";

    const preview =
      `📄 <b>${doc.title}</b>\n\n` +
      (doc.description ? `📝 ${doc.description}\n\n` : "") +
      `🌐 ቋንቋ: ${lang}\n` +
      (doc.page_count ? `📃 ገፆች: ${doc.page_count}\n` : "") +
      (doc.publisher  ? `🏢 አሳታሚ: ${doc.publisher}\n` : "") +
      (doc.year       ? `📅 ዓ.ም: ${doc.year}\n`         : "") +
      `📦 መጠን: ${size}\n` +
      `💰 ዋጋ: ${doc.is_free ? "🆓 ነጻ" : "3 ብር (ETB)"}`;

    // Cache is_free in session — avoids duplicate API call on download tap
    session.update(chatId, {
      step: "idle",
      documentId,
      documentIsFree: doc.is_free
    });

    // "Save to Device" button
    // callback_data: "sd:<documentId>" — max ~40 chars ✅
    await sendMessage(chatId, preview, {
      reply_markup: {
        inline_keyboard: [[
          { text: "💾 Save to Device", callback_data: `sd:${documentId}` }
        ]]
      }
    });
  } catch (err) {
    console.error("Document view error:", err.message);
    await sendMessage(chatId, "❌ ስህተት ተፈጥሯል።");
  }
}

// ---------------------------------------------------------------------------
// 3. Save to Device — user tapped the button
// callback_data: "sd:<documentId>"
// If free  → deliver immediately
// If paid  → show payment popup
// ---------------------------------------------------------------------------
async function handleSaveToDevice(chatId, userId, callbackQueryId, documentId) {
  await answerCallback(callbackQueryId);

  const state = session.get(chatId);

  // Use cached is_free from session (set during view) — no extra API call
  const isFree = state?.documentIsFree === true &&
                 state?.documentId === documentId;

  if (isFree) {
    await sendMessage(chatId, "⏳ ሰነዱ እየተዘጋጀ ነው...");
    return deliverDocument(chatId, userId, documentId);
  }

  // Paid — show payment popup
  // IDs stored in session inside showPaymentPopup — callback_data stays short
  return showPaymentPopup(chatId, {
    documentId,
    service: "document_download",
    label: "ሰነድ ማውረድ"
  });
}

module.exports = { handleSearch, handleDocumentView, handleSaveToDevice };
