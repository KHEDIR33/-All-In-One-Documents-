/**
 * Bot Dispatcher
 * --------------
 * Routes all incoming Telegram updates to the correct handler.
 *
 * callback_data patterns (all ≤ 64 bytes):
 *   action:<action>          — menu selection
 *   dv:<documentId>          — document view/open
 *   sd:<documentId>          — save to device
 *   p:<context>:<provider>   — payment provider selected
 */

const { sendMessage, sendInlineKeyboard, answerCallback } = require("./telegramApi");
const session = require("./sessionStore");
const { handleConversionFile, handleAnnotationInput, handlePasswordInput, ACTION_CONFIG } = require("./handlers/conversionHandler");
const { handlePaymentSelection } = require("./handlers/paymentHandler");
const { handleSearch, handleDocumentView, handleSaveToDevice } = require("./handlers/searchHandler");
const { handleLink, isUrl } = require("./handlers/linkHandler");

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------
const MAIN_MENU = [
  [
    { text: "📄 PDF → Word",    callback_data: "action:pdf_to_word" },
    { text: "📝 Word → PDF",    callback_data: "action:word_to_pdf" }
  ],
  [
    { text: "📊 PDF → Excel",   callback_data: "action:pdf_to_excel" },
    { text: "🗜 PDF Compress",   callback_data: "action:compress" }
  ],
  [
    { text: "🔒 Lock PDF",      callback_data: "action:lock" },
    { text: "🔓 Unlock PDF",    callback_data: "action:unlock" }
  ],
  [
    { text: "✏️ PDF Edit",      callback_data: "action:pdf_edit" }
  ],
  [
    { text: "🔍 ሰነድ ፈልግ",     callback_data: "action:search" }
  ]
];

async function handleStart(chatId, firstName) {
  session.clear(chatId);
  await sendInlineKeyboard(
    chatId,
    `እንኳን ደህና መጡ <b>${firstName || "ወዳጅ"}</b>! 👋\n\n` +
    `🗂 <b>All-In-One Documents Bot</b>\n\n` +
    `አገልግሎት ይምረጡ:`,
    MAIN_MENU
  );
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
async function handleMessage(message) {
  const chatId    = message.chat.id;
  const userId    = message.from?.id;
  const text      = message.text || "";
  const document  = message.document;
  const firstName = message.from?.first_name || "";

  if (text === "/start" || text === "/menu") return handleStart(chatId, firstName);

  if (text === "/help") {
    return sendMessage(chatId,
      "📋 <b>አጠቃቀም</b>\n\n" +
      "1️⃣ /start — ዋና ምናሌ\n" +
      "2️⃣ አገልግሎት ምረጥ\n" +
      "3️⃣ ፋይልህን ላክ\n" +
      "4️⃣ ክፍያ ፈጽም\n" +
      "5️⃣ ፋይሉ ወዲያውኑ ይላካሎ\n\n" +
      "❓ እርዳታ: /start"
    );
  }

  const state = session.get(chatId);

  // File received
  if (document) {
    if (!state || state.step === "idle") {
      await sendMessage(chatId, "እባክዎ መጀመሪያ አገልግሎት ይምረጡ 👇");
      return handleStart(chatId, firstName);
    }
    if (state.step === "awaiting_file") {
      if (state.action === "lock" || state.action === "unlock") {
        session.update(chatId, {
          step: "awaiting_password",
          pendingFileId:   document.file_id,
          pendingFileName: document.file_name
        });
        return sendMessage(chatId, "🔑 የይለፍ ቃሉን ይጻፉ:");
      }
      return handleConversionFile(chatId, userId, document, state.action);
    }
    return;
  }

  // Text received
  if (text && !text.startsWith("/")) {
    if (state?.step === "awaiting_password") {
      const fakeDoc = { file_id: state.pendingFileId, file_name: state.pendingFileName };
      session.update(chatId, { step: "processing" });
      return handlePasswordInput(chatId, userId, fakeDoc, text.trim(), state.action);
    }
    if (state?.step === "awaiting_annotation") {
      return handleAnnotationInput(chatId, userId, text.trim());
    }
    // URL → link handler
    if (isUrl(text.trim())) {
      return handleLink(chatId, userId, text.trim());
    }

    // Any other text → treat as search query
    return handleSearch(chatId, userId, text.trim());
  }
}

// ---------------------------------------------------------------------------
// Callback query handler
// ---------------------------------------------------------------------------
async function handleCallbackQuery(callbackQuery) {
  const chatId          = callbackQuery.message?.chat?.id;
  const userId          = callbackQuery.from?.id;
  const callbackQueryId = callbackQuery.id;
  const data            = callbackQuery.data || "";
  const firstName       = callbackQuery.from?.first_name || "";

  // action:<action>
  if (data.startsWith("action:")) {
    const action = data.split(":")[1];
    await answerCallback(callbackQueryId);

    if (action === "search") {
      session.set(chatId, { step: "awaiting_search", action: "search", customerRef: String(userId) });
      return sendMessage(chatId, "🔍 ምን ሰነድ ይፈልጋሉ? ስም ወይም ቁልፍ ቃል ይጻፉ:");
    }

    const config = ACTION_CONFIG[action];
    if (!config) return;

    session.set(chatId, { step: "awaiting_file", action, customerRef: String(userId) });
    const expects = config.expects === "pdf" ? "PDF (.pdf)" : "Word (.doc / .docx)";
    return sendMessage(chatId,
      `✅ <b>${config.label}</b> ተመርጧል\n\n📎 ${expects} ፋይልዎን ያስገቡ:`
    );
  }

  // dv:<documentId> — open/view document
  if (data.startsWith("dv:")) {
    const documentId = data.slice(3);
    return handleDocumentView(chatId, userId, callbackQueryId, documentId);
  }

  // sd:<documentId> — Save to Device tapped → payment popup or free deliver
  if (data.startsWith("sd:")) {
    const documentId = data.slice(3);
    return handleSaveToDevice(chatId, userId, callbackQueryId, documentId);
  }

  // p:<context>:<provider> — payment provider selected
  if (data.startsWith("p:")) {
    return handlePaymentSelection(chatId, userId, callbackQueryId, data);
  }

  await answerCallback(callbackQueryId);
}

// ---------------------------------------------------------------------------
// Main entry — called by webhook route
// ---------------------------------------------------------------------------
async function dispatch(update) {
  try {
    if (update.message)        await handleMessage(update.message);
    else if (update.callback_query) await handleCallbackQuery(update.callback_query);
  } catch (err) {
    console.error("Bot dispatch error:", err.message);
  }
}

module.exports = { dispatch };
