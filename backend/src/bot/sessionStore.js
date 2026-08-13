/**
 * Bot Session Store
 * -----------------
 * Lightweight in-memory store for per-user conversation state.
 * Sessions expire after 30 minutes of inactivity.
 *
 * State shape:
 * {
 *   step:          "idle" | "awaiting_file" | "awaiting_password" |
 *                  "awaiting_annotation" | "awaiting_search" |
 *                  "awaiting_payment" | "awaiting_payment_confirmation"
 *   action:        "pdf_to_word" | "word_to_pdf" | "pdf_to_excel" |
 *                  "compress" | "lock" | "unlock" | "pdf_edit" | "search"
 *   fileId:        string | null   — processed conversion file id
 *   documentId:    string | null   — document search result id
 *   documentIsFree: boolean        — cached from preview to avoid 2nd API call
 *   paymentId:     string | null   — active payment id
 *   pendingFileId:   string | null — Telegram file_id waiting for password/annotation
 *   pendingFileName: string | null
 *   customerRef:   string          — Telegram user_id as string
 * }
 */

const EXPIRY_MS = 30 * 60 * 1000;
const sessions  = new Map();

function get(chatId) {
  const entry = sessions.get(String(chatId));
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > EXPIRY_MS) {
    sessions.delete(String(chatId));
    return null;
  }
  return entry.data;
}

function set(chatId, data) {
  sessions.set(String(chatId), { data, updatedAt: Date.now() });
}

function clear(chatId) {
  sessions.delete(String(chatId));
}

function update(chatId, patch) {
  const current = get(chatId) || {};
  set(chatId, { ...current, ...patch });
}

module.exports = { get, set, clear, update };
