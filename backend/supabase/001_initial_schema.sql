-- All-In-One Documents
-- Supabase PostgreSQL schema
-- Source of truth: ProjectContext.md

create extension if not exists pgcrypto;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  original_name text not null,
  output_name text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  service text not null,
  status text not null default 'uploaded',
  storage_bucket text,
  storage_path text,
  processed_at timestamptz,
  delete_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists files_delete_at_idx on public.files(delete_at);
create index if not exists files_service_status_idx on public.files(service, status);
create index if not exists files_storage_path_idx on public.files(storage_path);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  file_id uuid references public.files(id) on delete set null,
  provider text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null,
  status text not null default 'pending',
  provider_transaction_id text,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create index if not exists payments_file_id_idx on public.payments(file_id);
create index if not exists payments_provider_transaction_idx
  on public.payments(provider, provider_transaction_id);

insert into storage.buckets (id, name, public)
values ('processing-files', 'processing-files', false)
on conflict (id) do update set public = false;
