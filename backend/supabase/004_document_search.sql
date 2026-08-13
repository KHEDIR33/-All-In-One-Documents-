-- All-In-One Documents
-- Migration 004: Document Search & Discovery Index
-- Source of truth: ProjectContext.md / Second

create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------
-- documents — search index (metadata only, no permanent file storage)
-- -----------------------------------------------------------------------
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  language        text not null default 'am',   -- 'am' | 'en' | 'mixed'
  category        text,
  file_type       text not null default 'pdf',
  file_size_bytes bigint,
  page_count      integer,
  publisher       text,
  source_url      text,                          -- internal only, never exposed
  year            integer,
  edition         text,
  search_keywords text[],
  is_free         boolean not null default false,
  price_etb       numeric(10,2),
  search_vector   tsvector,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists documents_search_vector_idx
  on public.documents using gin(search_vector);
create index if not exists documents_language_idx
  on public.documents(language);
create index if not exists documents_category_idx
  on public.documents(category);
create index if not exists documents_file_type_idx
  on public.documents(file_type);
create index if not exists documents_is_active_idx
  on public.documents(is_active);
create index if not exists documents_title_trgm_idx
  on public.documents using gin(title gin_trgm_ops);

-- Auto-update search_vector
create or replace function public.documents_search_vector_update()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(new.search_keywords, ' '), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.publisher, '')), 'C');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists documents_search_vector_trigger on public.documents;
create trigger documents_search_vector_trigger
  before insert or update on public.documents
  for each row execute function public.documents_search_vector_update();

-- -----------------------------------------------------------------------
-- document_downloads — temporary download sessions (3-min TTL)
-- -----------------------------------------------------------------------
create table if not exists public.document_downloads (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents(id) on delete cascade,
  storage_path   text,
  storage_bucket text,
  status         text not null default 'pending',  -- pending | ready | expired
  customer_ref   text,
  delete_at      timestamptz not null,
  created_at     timestamptz not null default now()
);

create index if not exists doc_downloads_document_idx
  on public.document_downloads(document_id);
create index if not exists doc_downloads_delete_at_idx
  on public.document_downloads(delete_at);
create index if not exists doc_downloads_customer_idx
  on public.document_downloads(customer_ref);
