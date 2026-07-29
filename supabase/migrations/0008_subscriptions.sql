-- Latag subscription model: monthly ₱199 / yearly ₱1,799 with 14-day free trial.
-- Written 2026-07-30 but never applied to this project; re-applied idempotently
-- on 2026-07-30 so it is safe regardless of prior partial application.

-- Subscription period tracking. Its absence made /api/license select a column
-- that did not exist, which returned 500 to every mobile licence refresh.
alter table public.licenses add column if not exists expires_at timestamptz;

-- Allow the subscription lifecycle statuses the RevenueCat webhook writes.
alter table public.licenses drop constraint if exists licenses_status_check;
alter table public.licenses add constraint licenses_status_check
  check (status in ('active','revoked','expired','past_due'));

-- Retire the old one-off SKU as a *product*. Existing licence rows carrying it
-- keep working -- they are grandfathered by ENTITLING_SKUS in @latag/licensing.
update public.pricing set active = false where sku = 'latag-pro-lifetime';

-- Purchasable subscription SKUs.
insert into public.pricing (sku, price, currency, active)
values ('latag-pro-monthly', 199, 'PHP', true)
on conflict (sku) do nothing;

insert into public.pricing (sku, price, currency, active)
values ('latag-pro-yearly', 1799, 'PHP', true)
on conflict (sku) do nothing;
