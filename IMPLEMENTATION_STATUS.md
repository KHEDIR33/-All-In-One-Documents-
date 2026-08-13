# Implementation Status

## Current working baseline

- Supabase PostgreSQL — active database.
- Supabase Storage — active temporary file storage (3-min TTL).
- Shared engine contract: `assertReadableFile`, `assertResult`.
- Shared file policy: `getDeleteAt()`.
- Cleanup worker: runs every 60s — covers `files` + `document_downloads`.
- OCR layer: Tesseract + Poppler + LibreOffice (eng+amh default).

## Engines (all wired into conversionRoutes.js)

| Endpoint | Engine | Status |
|---|---|---|
| POST /api/conversion/pdf-to-word | pdfToWord.engine.js | ✅ v4 + OCR |
| POST /api/conversion/word-to-pdf | wordToPdf.engine.js | ✅ v5 |
| POST /api/conversion/pdf-to-excel | pdfToExcel.engine.js + pdf_to_excel.py | ✅ v6 |
| POST /api/conversion/compress | compression.engine.js | ✅ v6 + output validation |
| POST /api/conversion/lock | lockUnlock.engine.js | ✅ v6 |
| POST /api/conversion/unlock | lockUnlock.engine.js | ✅ v6 |
| POST /api/conversion/pdf-edit | pdfEdit.engine.js | ✅ v6 MVP |

## Document Search & Discovery (v7)

| Endpoint | Status |
|---|---|
| GET /api/documents/search?q= | ✅ FTS + trigram fallback |
| GET /api/documents/:id | ✅ Preview + related/similar |
| POST /api/documents/:id/prepare-download | ✅ fetch source → Supabase temp |
| GET /api/documents/download/:sessionId | ✅ signed URL (2 min) |

## app.js route map

```
/api/conversion/*  → conversionRoutes.js  (7 engines)
/api/download/*    → downloadRoutes.js    (conversion result download)
/api/payments/*    → paymentRoutes.js     (payment + webhook)
/api/documents/*   → documentRoutes.js   (search + preview + download)
```

Note: duplicate wordToPdfRoutes removed from app.js.

## Tests

- `tests/pdf-to-word.test.js` ✅
- `tests/pdf-compression.test.js` ✅
- `tests/supabase.integration.test.js` ✅ (skips without credentials)
- `tests/upload-limit.test.js` ✅
- `tests/fixtures/` — normal + scanned PDFs (Amharic + English)

## Not yet production-complete

- Payment provider adapters: Chapa, Telebirr, SantimPay (stubs only).
- International adapters: Airtm, Paddle, PayPal (stubs only).
- Auth / customer identity.
- Usage recording wired into every request.
- Telegram Bot (webhook mode).
- Digital/cryptographic signing (pdfEdit MVP only).

## Rule

Do not push to GitHub/Render until the working ZIP has been reviewed and accepted.

---

## Version History

### v7 — Document Search & Discovery
- Added 004_document_search.sql.
- Added documentSearchService.js (FTS + trigram, top/related/similar).
- Added documentRepository.js (download session CRUD + TTL).
- Added documentController.js + documentRoutes.js.
- Updated cleanupService.js — covers document_downloads.
- Updated app.js — added /api/documents, removed duplicate wordToPdfRoutes.

### v6 (your build) — 4 Engines + OCR + Tests
- pdfToExcel engine upgraded to Python script (pdfplumber + Tesseract TSV).
- compression.engine.js — added output validation (outputAnalysis).
- ocrService.js — full Tesseract + Poppler + LibreOffice OCR pipeline.
- Tests added: pdf-to-word, pdf-compression, supabase integration, upload-limit.
- Test fixtures: normal + scanned PDFs (Amharic + English).

### v6 (base) — 4 New Engines
- pdfToExcel, compression, lockUnlock, pdfEdit engines + controllers.
- Updated Dockerfile (ghostscript, qpdf, pdftk-java, libreoffice-calc).

### v5 — Word → PDF Engine
### v4 — PDF → Word Engine + OCR detection

### v8 — Payment System
- Added provider adapters: chapaAdapter, santimPayAdapter, airtmAdapter, paddleAdapter, paypalAdapter.
- Added paymentRouter.js — local providers → Chapa (primary) → SantimPay (fallback); international → direct adapter.
- Updated paymentService.js — createPayment now initiates with provider + returns checkout_url.
- Updated paymentService.js — verifyAndGrantAccess (idempotent) replaces verifyPayment.
- Updated paymentController.js — POST /create, GET /:id/status, POST /webhook/:gateway.
- Updated paymentRoutes.js — all 3 endpoints registered.
- Updated .env.example — all payment provider keys documented.
- Webhook signature validation: Chapa (HMAC), SantimPay (HMAC), Airtm (HMAC), Paddle (ts:h1), PayPal (API verification).
- Local routing: user selects Telebirr/CBE/Dashen/Abyssinia → backend routes via Chapa/SantimPay invisibly.
- International: $1/7-day access via Airtm/Paddle/PayPal.
- Daily usage limit (10/24hr) enforced by existing usageService.js.

### v9 — Telegram Bot (webhook mode)
- Added bot/telegramApi.js — Telegram API helper (no extra library).
- Added bot/sessionStore.js — in-memory per-user state (30 min expiry).
- Added bot/dispatcher.js — main update router (message + callback_query).
- Added bot/handlers/conversionHandler.js — file upload → backend API → payment prompt.
- Added bot/handlers/paymentHandler.js — payment initiation + status check.
- Added bot/handlers/searchHandler.js — document search, preview, download.
- Added routes/botRoutes.js — POST /bot/webhook, GET /bot/setup.
- Updated app.js — /bot routes registered.
- Updated package.json — form-data dependency added.
- Updated .env.example — TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET.
- Webhook mode: same Render service handles website API + Telegram bot.
- Setup: after deploy call GET /bot/setup once to register webhook with Telegram.

### v9c — Bot Complete Fix
- Fixed callback_data 64-byte limit — IDs stored in session, not in callback_data.
- Fixed search→download flow: Search → Result → Open/View → Save to Device → Payment popup → File sent directly.
- Payment popup horizontal layout (ProjectContext fourth).
- Webhook auto-confirm — file delivered automatically after payment, no button needed.
- sendDocumentFromBuffer — file sent directly to Telegram (not a link).
- No duplicate API call — is_free cached in session after preview.
- Added /bot/payment-confirmed internal endpoint for auto-deliver.
- paymentController.js — notifies bot after webhook confirms payment.
- dispatcher.js — clean callback_data: action:*, dv:*, sd:*, p:*.
