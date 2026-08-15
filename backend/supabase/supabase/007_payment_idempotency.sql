alter table public.payments
  add column if not exists idempotency_key text;

create unique index if not exists payments_idempotency_key_unique
  on public.payments(idempotency_key)
  where idempotency_key is not null;
