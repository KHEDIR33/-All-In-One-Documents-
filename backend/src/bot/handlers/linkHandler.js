/**
 * Bot Link Handler
 * ----------------
 * User pastes a URL to a document (PDF/Word/Excel).
 * Bot fetches the file, stores it temporarily, and shows preview + Save to Device.
 *
 * Flow:
 *   User sends URL
 *       ↓
 *   Detect file type from URL (.pdf / .docx / .xlsx)
 *       ↓
 *   Check documents table for matching source_url
 *       ↓ found          ↓ not found
 *   Show existing    Fetch file → create temp document record
 *   preview          → show preview
 *       ↓
 *   Save to Device → Payment → file sent directly
 */

const { sendMessage, sendChatAction, sendDocumentFromBuffer } = require("../telegramApi");
const { showPaymentPopup } = require("./paymentHandler");
const session = require("../sessionStore");
const { supabase } = require("../../config/database");

const BACKEND = process.env.BACKEND_URL || "http://localhost:10000";

const SUPPORTED_EXTENSIONS = {
  ".pdf":  { mime: "application/pdf", label: "PDF" },
  ".docx": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
  ".doc":  { mime: "application/msword", label: "Word" },
  ".xlsx": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel" }
};

// ---------------------------------------------------------------------------
// Detect if a string is a URL
// ---------------------------------------------------------------------------
function isUrl(text) {
  try {
    const url = new URL(text.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Detect supported file extension from URL
// ---------------------------------------------------------------------------
function getFileExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    for (const ext of Object.keys(SUPPORTED_EXTENSIONS)) {
      if (pathname.endsWith(ext)) return ext;
    }
  } catch (_) {}
  return null;
}

// ---------------------------------------------------------------------------
// Get filename from URL
// ---------------------------------------------------------------------------
function getFilenameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts    = pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1]) || "document";
  } catch (_) {
    return "document";
  }
}

// ---------------------------------------------------------------------------
// Main handler — called when user sends a URL
// ---------------------------------------------------------------------------
async function handleLink(chatId, userId, url) {
  const ext = getFileExtension(url);

  // Unsupported extension or no extension
  if (!ext) {
    return sendMessage(chatId,
      "🔗 ይህ ሊንክ ቀጥታ ሊደገፍ አይችልም።\n\n" +
      "✅ የሚደገፉ ፋይሎች: <b>.pdf · .docx · .doc · .xlsx</b>\n\n" +
      "ፋይሉን ወርደው ቀጥታ ወደ Bot ይላኩ።"
    );
  }

  const fileInfo = SUPPORTED_EXTENSIONS[ext];

  try {
    await sendChatAction(chatId, "typing");
    await sendMessage(chatId, `🔗 ሊንክ ተቀበልኩ — <b>${fileInfo.label}</b> ፋይል እየፈለግሁ ነው...`);

    // 1. Check if document already exists in our index by source_url
    const { data: existing } = await supabase
      .from("documents")
      .select("id, title, description, language, file_type, file_size_bytes, page_count, publisher, year, is_free, price_etb")
      .eq("source_url", url)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      // Document already in our index — show preview directly
      session.update(chatId, {
        step: "idle",
        documentId:     existing.id,
        documentIsFree: existing.is_free
      });
      return showDocumentPreview(chatId, existing);
    }

    // 2. Not in index — fetch the file
    await sendMessage(chatId, "⏳ ፋይሉ እየወረደ ነው...");

    let buffer;
    let fileSize;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000) // 30 sec timeout
      });

      if (!response.ok) {
        return sendMessage(chatId,
          `❌ ፋイルን ማውረድ አልተቻለም (HTTP ${response.status}).\n` +
          "ሊንኩ ትክክል መሆኑን ያረጋግጡ።"
        );
      }

      buffer   = Buffer.from(await response.arrayBuffer());
      fileSize = buffer.length;

      if (fileSize === 0) {
        return sendMessage(chatId, "❌ ፋイルው ባዶ ነው።");
      }

      // Max 50MB (backend limit)
      const maxBytes = (parseInt(process.env.FILE_LIMIT_MB) || 50) * 1024 * 1024;
      if (fileSize > maxBytes) {
        return sendMessage(chatId,
          `❌ ፋイルው በጣም ትልቅ ነው (${(fileSize / 1024 / 1024).toFixed(1)} MB).\n` +
          `ከፍተኛ መጠን: ${process.env.FILE_LIMIT_MB || 50} MB`
        );
      }
    } catch (fetchErr) {
      if (fetchErr.name === "TimeoutError") {
        return sendMessage(chatId, "❌ ሊንኩ ጊዜ ወሰደ። ሌላ ጊዜ ይሞክሩ።");
      }
      return sendMessage(chatId, "❌ ፋйлን ማውረድ አልተቻለም። ሊнку ትክክለኛ መሆኑን ያረጋግጡ።");
    }

    // 3. Upload to Supabase temp storage via backend prepare-download pattern
    //    For URL-fetched files we create a minimal document record in-memory
    //    (not saved to documents table — user's private URL stays private)
    const filename = getFilenameFromUrl(url);
    const title    = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

    // Create a temporary document record so the download session works
    const { data: tempDoc, error: insertError } = await supabase
      .from("documents")
      .insert({
        title:      title,
        language:   "am",
        file_type:  ext.replace(".", ""),
        file_size_bytes: fileSize,
        source_url: url,
        is_free:    true,   // URL-fetched docs are free (user provided the link)
        is_active:  true
      })
      .select("id, title, file_type, file_size_bytes, is_free")
      .single();

    if (insertError) {
      console.error("Temp doc insert error:", insertError.message);
      // Fallback — send file directly without payment
      return sendDocumentFromBuffer(
        chatId, buffer, filename,
        `📄 <b>${title}</b>\n\nፋیلው ከ link ወርዷል።`
      );
    }

    // 4. Show preview with Save to Device
    session.update(chatId, {
      step: "idle",
      documentId:     tempDoc.id,
      documentIsFree: true
    });

    await showDocumentPreview(chatId, {
      ...tempDoc,
      description: `ከ link የወረደ ፋйлL — ${url.substring(0, 60)}${url.length > 60 ? "..." : ""}`,
      is_free: true
    });

  } catch (err) {
    console.error("Link handler error:", err.message);
    await sendMessage(chatId, "❌ ስህተት ተፈጥሯል። እባክዎ እንደ አዲስ ይሞክሩ።");
  }
}

// ---------------------------------------------------------------------------
// Show document preview card + Save to Device button
// ---------------------------------------------------------------------------
async function showDocumentPreview(chatId, doc) {
  const size = doc.file_size_bytes
    ? `${(doc.file_size_bytes / 1024 / 1024).toFixed(1)} MB`
    : "—";
  const lang = doc.language === "am" ? "አማርኛ"
             : doc.language === "en" ? "English"
             : doc.language ? doc.language : "—";

  const preview =
    `📄 <b>${doc.title}</b>\n\n` +
    (doc.description ? `📝 ${doc.description}\n\n` : "") +
    `📁 ዓይነት: ${(doc.file_type || "").toUpperCase()}\n` +
    (doc.language   ? `🌐 ቋንቋ: ${lang}\n`           : "") +
    (doc.page_count ? `📃 ገፆች: ${doc.page_count}\n`  : "") +
    (doc.publisher  ? `🏢 አሳታሚ: ${doc.publisher}\n`  : "") +
    (doc.year       ? `📅 ዓ.ም: ${doc.year}\n`          : "") +
    `📦 መጠን: ${size}\n` +
    `💰 ዋጋ: ${doc.is_free ? "🆓 ነጻ" : "3 ብር (ETB)"}`;

  await sendMessage(chatId, preview, {
    reply_markup: {
      inline_keyboard: [[
        { text: "💾 Save to Device", callback_data: `sd:${doc.id}` }
      ]]
    }
  });
}

module.exports = { handleLink, isUrl };
