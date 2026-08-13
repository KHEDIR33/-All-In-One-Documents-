# PDF → Word Engine

## Current pipeline

1. Receive PDF through `POST /api/conversion/pdf-to-word`.
2. Validate MIME type and PDF signature.
3. Analyze the PDF with Poppler (`pdfinfo` + `pdftotext`).
4. If selectable text exists, convert with headless LibreOffice.
5. Upload the generated DOCX to private Supabase Storage.
6. Save metadata in Supabase PostgreSQL.
7. Return metadata only; download remains protected by the shared access/payment layer.
8. Local processing files are removed immediately.
9. The Supabase temporary copy follows the project 3-minute expiration policy.

## Scanned PDFs

Scanned/image-only PDFs are detected and automatically routed through the active OCR processing layer. The OCR path renders PDF pages with Poppler, extracts text with Tesseract, builds a UTF-8 document, and converts it to DOCX with LibreOffice.

Default OCR languages are English + Amharic (`eng+amh`). The language set, DPI, and maximum processed pages can be configured with `OCR_LANGUAGES`, `OCR_DPI`, and `OCR_MAX_PAGES`.

OCR is a processing layer inside the PDF → Word workflow; it is not a future placeholder.

## Dependencies in Docker

- LibreOffice Writer/Core
- Poppler utilities (`pdfinfo`, `pdftotext`, `pdftoppm`)
- Tesseract OCR
- Tesseract English and Amharic language data


## Conversion path

Selectable-text PDFs are extracted with Poppler (`pdftotext`) and converted through the UTF-8 HTML → DOCX LibreOffice path. This avoids relying on LibreOffice's unreliable headless PDF/Draw → DOCX export. Scanned PDFs use the OCR path (Poppler → Tesseract → HTML → DOCX).
