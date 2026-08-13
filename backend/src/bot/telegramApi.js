/**
 * Telegram Bot API helper
 * Uses the Bot API directly — no extra library needed.
 */

const FormData = require("form-data");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_BASE   = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TG_FILE   = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

async function call(method, body = {}) {
  const res = await fetch(`${TG_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) console.error(`Telegram API error [${method}]:`, data.description);
  return data;
}

async function sendMessage(chatId, text, extra = {}) {
  return call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

async function sendInlineKeyboard(chatId, text, buttons) {
  return call("sendMessage", {
    chat_id: chatId, text, parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
}

async function editMessage(chatId, messageId, text, extra = {}) {
  return call("editMessageText", {
    chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", ...extra
  });
}

async function answerCallback(callbackQueryId, text = "") {
  return call("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

async function sendChatAction(chatId, action = "upload_document") {
  return call("sendChatAction", { chat_id: chatId, action });
}

/**
 * Send a file directly to the user from a URL (Telegram fetches it).
 */
async function sendDocumentFromUrl(chatId, fileUrl, caption = "", filename = "file") {
  return call("sendDocument", {
    chat_id: chatId,
    document: fileUrl,
    caption,
    parse_mode: "HTML"
  });
}

/**
 * Send a file directly to the user from a Buffer (multipart upload).
 * Used when we have the file in memory and want to push it to the user.
 */
async function sendDocumentFromBuffer(chatId, buffer, filename, caption = "") {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("document", buffer, { filename });

  const res = await fetch(`${TG_BASE}/sendDocument`, {
    method: "POST",
    body: form,
    headers: form.getHeaders()
  });
  const data = await res.json();
  if (!data.ok) console.error("sendDocumentFromBuffer error:", data.description);
  return data;
}

async function getTelegramFileUrl(fileId) {
  const res = await call("getFile", { file_id: fileId });
  if (!res.ok) throw new Error("Could not get file info from Telegram");
  return `${TG_FILE}/${res.result.file_path}`;
}

async function downloadTelegramFile(fileId) {
  const url = await getTelegramFileUrl(fileId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file from Telegram: ${res.status}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), url };
}

async function setWebhook(webhookUrl) {
  return call("setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true
  });
}

module.exports = {
  sendMessage, sendInlineKeyboard, editMessage,
  answerCallback, sendChatAction,
  sendDocumentFromUrl, sendDocumentFromBuffer,
  getTelegramFileUrl, downloadTelegramFile, setWebhook
};
