# Supabase setup

1. Create a free Supabase project.
2. In Supabase SQL Editor, run `backend/supabase/001_initial_schema.sql`.
3. Copy Project URL and Service Role Key into Render environment variables.
4. Keep the `processing-files` bucket private.
5. Never expose `SUPABASE_SERVICE_ROLE_KEY` to Framer or the browser.
6. Install backend dependencies with `npm install`.
7. Start with `npm start`.

Current implementation:
- Supabase PostgreSQL stores processing metadata and payment records.
- Supabase Storage stores only temporary processed files.
- Processed files expire after 3 minutes.
- Download URLs are short-lived signed URLs.
- PDF → Word uses LibreOffice on the Render backend.

Important:
- Payment verification is intentionally not bypassed; the download controller contains the production integration point.
- Render must have LibreOffice installed (Docker is recommended for the conversion engine).

## Integration test

From `backend/`, with a real Supabase project configured:

```bash
npm install
npm run test:supabase
```

The test verifies the real path:

`PostgreSQL metadata → Storage upload → signed download URL → file download → cleanup`

If the Supabase environment variables are not configured, the test intentionally reports `SKIPPED` rather than pretending the integration passed.
