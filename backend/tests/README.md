# PDF → Word Engine Tests

Run from `backend/`:

```bash
npm test
```

The suite covers:
- selectable English PDF → DOCX
- selectable Amharic PDF → DOCX
- scanned English PDF → Tesseract OCR → DOCX
- scanned Amharic PDF → Tesseract OCR (`eng+amh`) → DOCX

The test also verifies that the analyzer routes scanned PDFs to OCR and that every conversion returns a non-empty DOCX.
