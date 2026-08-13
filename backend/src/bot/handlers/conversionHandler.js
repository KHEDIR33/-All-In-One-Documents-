/**
 * Bot Conversion Handler
 * ----------------------
 * Sends uploaded files to the backend API engines.
 * Uses showPaymentPopup (from paymentHandler) for consistent payment UI.
 *
 * PDF Edit flow:
 *   1. User selects ✏️ PDF Edit
 *   2. User sends PDF file → bot stores file_id in session
 *   3. Bot asks for annotation text
 *   4. User types text → bot processes and shows payment popup
 */

const FormData = require("form-data");
const { sendMessage, sendChatAction, downloadTelegramFile } = require("../telegramApi");
const { showPaymentPopup } = require("./paymentHandler");
const session = require("../sessionStore");

const BACKEND = process.env.BACKEND_URL || "http://localhost:10000";

const ACTION_CONFIG = {
  pdf_to_word:  { endpoint: "/api/conversion/pdf-to-word",  expects: "pdf",  label: "PDF → Word" },
  word_to_pdf:  { endpoint: "/api/conversion/word-to-pdf",  expects: "word", label: "Word → PDF" },
  pdf_to_excel: { endpoint: "/api/conversion/pdf-to-excel", expects: "pdf",  label: "PDF → Excel" },
  compress:     { endpoint: "/api/conversion/compress",      expects: "pdf",  label: "PDF Compression" },
  lock:         { endpoint: "/api/conversion/lock",          expects: "pdf",  label: "PDF Lock",   needsPassword:   true },
  unlock:       { endpoint: "/api/conversion/unlock",        expects: "pdf",  label: "PDF Unlock", needsPassword:   true },
  pdf_edit:     { endpoint: "/api/conversion/pdf-edit",      expects: "pdf",  label: "PDF Edit",   needsAnnotation: true }
};

async function postToBackend(endpoint, form) {
  const res  = await fetch(`${BACKEND}${endpoint}`, {
    method: "POST", body: form, headers: form.getHeaders()
  });
  const data = await res.json();
  return { res, data };
}

// ---------------------------------------------------------------------------
// 1. File received — main conversion flow
// ---------------------------------------------------------------------------
async function handleConversionFile(chatId, userId, document, action) {
  const config = ACTION_CONFIG[action];
  if (!config) return;

  // PDF Edit — store file, ask for annotation text
  if (config.needsAnnotation) {
    session.update(chatId, {
      step: "awaiting_annotation",
      pendingFileId:   document.file_id,
      pendingFileName: document.file_name || "file.pdf",
      action
    });
    return sendMessage(chatId,
      "✏️ <b>PDF Edit</b>\n\n" +
      "PDF ፋይሉ ተቀበልኩ።\n\n" +
      "📝 ማከል የሚፈልጉትን ጽሑፍ ይጻፉ:\n" +
      "<i>(ለምሳሌ: ተፈርሟል | Approved | ሚስጥራዊ)</i>"
    );
  }

  try {
    await sendChatAction(chatId);
    await sendMessage(chatId, `⏳ <b>${config.label}</b> — በሂደት ላይ ነው፣ ይጠብቁ...`);

    const { buffer } = await downloadTelegramFile(document.file_id);
    const fileName   = document.file_name || `file.${config.expects === "pdf" ? "pdf" : "docx"}`;

    const form = new FormData();
    form.append("file", buffer, { filename: fileName });

    const { res, data } = await postToBackend(config.endpoint, form);

    if (!res.ok || !data.success) {
      if (data.code === "OCR_REQUIRED") {
        return sendMessage(chatId,
          "📷 ይህ PDF ስካን የተደረገ ነው።\n" +
          "OCR processing ያስፈልጋል — ትንሽ ጊዜ ሊወስድ ይችላል።"
        );
      }
      return sendMessage(chatId, `❌ ስህተት: ${data.message || "ልወስደው አልቻልኩም"}`);
    }

    await showPaymentPopup(chatId, {
      fileId:  data.file?.id,
      service: action,
      label:   config.label
    });
  } catch (err) {
    console.error("Conversion handler error:", err.message);
    await sendMessage(chatId, "❌ ስህተት ተፈጥሯል። እባክዎ እንደ አዲስ ይሞክሩ።");
    session.clear(chatId);
  }
}

// ---------------------------------------------------------------------------
// 2. Annotation text received (PDF Edit)
// ---------------------------------------------------------------------------
async function handleAnnotationInput(chatId, userId, text) {
  const state = session.get(chatId);
  if (!state || state.step !== "awaiting_annotation") return;

  try {
    await sendChatAction(chatId);
    await sendMessage(chatId, "⏳ <b>PDF Edit</b> — ጽሑፍ እየጨመርን ነው...");

    const { buffer } = await downloadTelegramFile(state.pendingFileId);

    const annotations = JSON.stringify([{
      page: 0, x: 50, y: 50,
      text: text.trim(),
      fontSize: 14
    }]);

    const form = new FormData();
    form.append("file", buffer, { filename: state.pendingFileName || "file.pdf" });
    form.append("annotations", annotations);

    const { res, data } = await postToBackend("/api/conversion/pdf-edit", form);

    if (!res.ok || !data.success) {
      await sendMessage(chatId, `❌ ስህተት: ${data.message || "ልወስደው አልቻልኩም"}`);
      session.clear(chatId);
      return;
    }

    await showPaymentPopup(chatId, {
      fileId:  data.file?.id,
      service: "pdf_edit",
      label:   "PDF Edit"
    });
  } catch (err) {
    console.error("Annotation error:", err.message);
    await sendMessage(chatId, "❌ ስህተት ተፈጥሯል። እባክዎ እንደ አዲስ ይሞክሩ።");
    session.clear(chatId);
  }
}

// ---------------------------------------------------------------------------
// 3. Password input (Lock / Unlock)
// ---------------------------------------------------------------------------
async function handlePasswordInput(chatId, userId, document, password, action) {
  const config = ACTION_CONFIG[action];
  if (!config) return;

  try {
    await sendChatAction(chatId);
    await sendMessage(chatId, `⏳ <b>${config.label}</b> — በሂደት ላይ...`);

    const { buffer } = await downloadTelegramFile(document.file_id);
    const fileName   = document.file_name || "file.pdf";

    const form = new FormData();
    form.append("file",     buffer,   { filename: fileName });
    form.append("password", password);

    const { res, data } = await postToBackend(config.endpoint, form);

    if (!res.ok || !data.success) {
      if (data.code === "WRONG_PASSWORD") {
        return sendMessage(chatId, "❌ የተሳሳተ የይለፍ ቃል። እንደ አዲስ ይሞክሩ።");
      }
      return sendMessage(chatId, `❌ ስህተት: ${data.message}`);
    }

    await showPaymentPopup(chatId, {
      fileId:  data.file?.id,
      service: action,
      label:   config.label
    });
  } catch (err) {
    console.error("Password handler error:", err.message);
    await sendMessage(chatId, "❌ ስህተት ተፈጥሯል። እባክዎ እንደ አዲስ ይሞክሩ።");
    session.clear(chatId);
  }
}

module.exports = {
  handleConversionFile,
  handleAnnotationInput,
  handlePasswordInput,
  ACTION_CONFIG
};
