const crypto = require("crypto");
const fs = require("fs/promises");
const { searchDocuments, getDocumentPreview, getRelatedDocuments } = require("../services/search/documentSearchService");
const { createDownloadSession, markDownloadReady, getDownloadSession, deleteDownloadSession } = require("../services/search/documentRepository");
const { hasFileAccess } = require("../services/access/accessService");
const { uploadTemporaryFile, createDownloadUrl, BUCKET } = require("../services/storage/supabaseStorage");
const { supabase } = require("../config/database");

// GET /api/documents/search?q=&language=&category=&file_type=
async function search(req, res, next) {
  try {
    const { q, language, category, file_type } = req.query;
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Search query is required" });
    }
    const results = await searchDocuments(q, { language, category, file_type });
    return res.json({ success: true, ...results });
  } catch (error) { next(error); }
}

// GET /api/documents/:id
async function preview(req, res, next) {
  try {
    const document = await getDocumentPreview(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    const { related_documents, similar_documents } = await getRelatedDocuments(document);
    return res.json({ success: true, document, related_documents, similar_documents });
  } catch (error) { next(error); }
}

// POST /api/documents/:id/prepare-download
async function prepareDownload(req, res, next) {
  let tempPath;
  let sessionId;
  try {
    const documentId = req.params.id;
    const customerRef = req.get("x-customer-ref") || null;

    const document = await getDocumentPreview(documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    if (!document.is_free) {
      const allowed = await hasFileAccess({ documentId, service: "document_download", customerRef });
      if (!allowed) {
        return res.status(403).json({ success: false, code: "PAYMENT_REQUIRED", message: "Payment is required to download this document" });
      }
    }

    const session = await createDownloadSession({ documentId, customerRef });
    sessionId = session.id;

    // Fetch source_url (internal only — never sent to client)
    const { data: docWithSource } = await supabase
      .from("documents").select("source_url, file_type").eq("id", documentId).single();

    if (!docWithSource?.source_url) {
      return res.status(503).json({ success: false, message: "Source file is not available at this time" });
    }

    const ext = docWithSource.file_type || "pdf";
    tempPath = `/tmp/aio-doc-${crypto.randomUUID()}.${ext}`;
    const sourceResponse = await fetch(docWithSource.source_url);
    if (!sourceResponse.ok) throw new Error(`Failed to fetch source: HTTP ${sourceResponse.status}`);
    await fs.writeFile(tempPath, Buffer.from(await sourceResponse.arrayBuffer()));

    const storagePath = `documents/temp/${sessionId}/${crypto.randomUUID()}.${ext}`;
    const mimeMap = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    };
    await uploadTemporaryFile(tempPath, storagePath, mimeMap[ext] || "application/octet-stream");

    const ready = await markDownloadReady(sessionId, { storagePath, storageBucket: BUCKET });

    return res.status(201).json({
      success: true,
      message: "Document is ready for download",
      session: { id: ready.id, expires_at: ready.delete_at }
    });
  } catch (error) {
    if (sessionId) await deleteDownloadSession(sessionId).catch(() => {});
    next(error);
  } finally {
    if (tempPath) await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

// GET /api/documents/download/:sessionId
async function downloadBySession(req, res, next) {
  try {
    const session = await getDownloadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Download session not found or expired" });
    }
    if (session.status !== "ready" || !session.storage_path) {
      return res.status(409).json({ success: false, message: "Download is not ready yet" });
    }
    if (new Date(session.delete_at).getTime() <= Date.now()) {
      return res.status(410).json({ success: false, message: "Download session has expired — please search again" });
    }
    const signedUrl = await createDownloadUrl(session.storage_path, 120);
    return res.json({ success: true, download_url: signedUrl, expires_in_seconds: 120 });
  } catch (error) { next(error); }
}

module.exports = { search, preview, prepareDownload, downloadBySession };
