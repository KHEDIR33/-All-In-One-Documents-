-- Shared payment + access layer. Provider verification must happen in a trusted adapter/webhook.

alter table public.payments
  add column if not exists payment_key uuid unique default gen_random_uuid(),
  add column if not exists service text,
  add column if not exists access_type text not null default 'service',
  add column if not exists customer_ref text,
  add column if not exists access_expires_at timestamptz;

create unique index if not exists payments_provider_tx_unique
  on public.payments(provider, provider_transaction_id)
  where provider_transaction_id is not null;

create table if not exists public.access_grants (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  file_id uuid references public.files(id) on delete cascade,
  customer_ref text,
  access_type text not null,
  service text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists access_grants_file_idx on public.access_grants(file_id);
create index if not exists access_grants_customer_idx on public.access_grants(customer_ref);
create index if not exists access_grants_expiry_idx on public.access_grants(expires_at);
