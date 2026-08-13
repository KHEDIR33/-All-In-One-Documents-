-- International access usage protection: maximum 10 services in any rolling 24-hour window.
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  customer_ref text not null,
  service text not null,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_customer_time_idx
  on public.usage_events(customer_ref, created_at desc);
