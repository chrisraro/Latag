-- Latag subscription model: monthly ₱199 with 14-day free trial.
-- Applied via management API.

-- Add expires_at to licenses for subscription period tracking.
alter table public.licenses add column expires_at timestamptz;

-- Allow more statuses for subscription lifecycle.
alter table public.licenses drop constraint licenses_status_check;
alter table public.licenses add constraint licenses_status_check
  check (status in ('active','revoked','expired','past_due'));

-- Deactivate the old lifetime SKU (will keep row for history).
update public.pricing set active = false where sku = 'latag-pro-lifetime';

-- Add subscription SKUs.
insert into public.pricing (sku, price, currency, active)
values ('latag-pro-monthly', 199, 'PHP', true);
insert into public.pricing (sku, price, currency, active)
values ('latag-pro-yearly', 1799, 'PHP', true);
