-- Latag storefront schema (Phase F2; spec §3). Additive-only migration authored
-- in the repo and applied via the management API, matching 0001/0002.
--
-- PRIVACY BOUNDARY (spec §1, §3): shop_items carries ONLY buyer-relevant fields.
-- There is deliberately NO column for cost, profit, margin, supplier location, or
-- batch. Cost/profit/location/batch stay on the device permanently. Do not add
-- such a column here — the absence of the column IS the enforcement.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  handle citext not null unique check (handle ~ '^[a-z0-9-]{3,20}$'),
  display_name text not null,
  bio text,
  contact_messenger text,
  contact_instagram text,
  contact_email text,
  show_sold boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No cost / profit / location / batch columns. By design. See header.
create table public.shop_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  code text not null,
  item_local_id text not null,
  brand text not null,
  name text,
  department text not null,
  category text not null,
  condition text not null,
  specs jsonb not null default '{}'::jsonb,
  price integer not null,
  status text not null default 'available' check (status in ('available','sold')),
  photo_urls text[] not null default '{}',
  sort_order integer not null default 0,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, item_local_id),
  unique (shop_id, code)
);

create index shop_items_shop_status_idx on public.shop_items (shop_id, status);

-- ---------------------------------------------------------------------------
-- RLS: default deny, then the narrowest possible grants.
-- Public (anon) reads published stock only; every write is owner-scoped, so the
-- mobile app writes directly with no API layer in between.
-- ---------------------------------------------------------------------------

alter table public.shops enable row level security;
alter table public.shop_items enable row level security;

create policy "public shops" on public.shops for select using (is_published);
create policy "own shop all" on public.shops for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "public shop items" on public.shop_items for select using (exists (select 1 from public.shops s where s.id = shop_id and s.is_published and (shop_items.status = 'available' or s.show_sold)));
create policy "own shop items all" on public.shop_items for all using (exists (select 1 from public.shops s where s.id = shop_id and s.user_id = auth.uid())) with check (exists (select 1 from public.shops s where s.id = shop_id and s.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: bucket `shop-photos`, public read, writes scoped to {user_id}/…
-- Buckets cannot be created with plain DDL, hence the insert.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('shop-photos','shop-photos', true) on conflict (id) do nothing;

create policy "shop photos public read" on storage.objects for select using (bucket_id = 'shop-photos');
create policy "shop photos owner insert" on storage.objects for insert with check (bucket_id = 'shop-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "shop photos owner update" on storage.objects for update using (bucket_id = 'shop-photos' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'shop-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "shop photos owner delete" on storage.objects for delete using (bucket_id = 'shop-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- updated_at maintenance. SECURITY DEFINER + hardened per 0002: revoking EXECUTE
-- keeps it off the PostgREST surface and does not affect trigger execution
-- (triggers run as the function owner).
-- ---------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end; $$;

revoke execute on function public.touch_updated_at() from anon, authenticated, public;

create trigger shops_touch_updated_at before update on public.shops
  for each row execute function public.touch_updated_at();
create trigger shop_items_touch_updated_at before update on public.shop_items
  for each row execute function public.touch_updated_at();
