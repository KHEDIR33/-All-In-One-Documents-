-- All-In-One Documents
-- Migration 005: Document Search/Download payment-access linkage
-- Source of truth: ProjectContext.md
--
-- Links paid document downloads to the exact document instead of relying
-- on a processed file_id.

alter table public.payments
  add column if not exists document_id uuid
  references public.documents(id) on delete set null;

alter table public.access_grants
  add column if not exists document_id uuid
  references public.documents(id) on delete cascade;

create index if not exists payments_document_id_idx
  on public.payments(document_id);

create index if not exists access_grants_document_id_idx
  on public.access_grants(document_id);
