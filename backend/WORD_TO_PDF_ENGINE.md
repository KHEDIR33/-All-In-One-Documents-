# Word → PDF Engine

## Pipeline

1. Accept DOC/DOCX.
2. Validate extension, MIME type, and non-empty input.
3. Run LibreOffice headless with an isolated user profile.
4. Validate the generated PDF exists and is non-empty.
5. Upload the PDF to private Supabase Storage.
6. Store metadata in Supabase PostgreSQL.
7. Return metadata only; saving/download remains behind the shared access/payment layer.
8. Delete local processing files immediately.
9. Apply the project 3-minute temporary-file lifecycle.

## API

`POST /api/conversion/word-to-pdf`

Multipart field: `file`

Supported: `.doc`, `.docx`

Maximum upload size: 50 MB.
