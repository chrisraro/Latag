-- Latag licensing schema (platform spec §5). All authored as repo migration; applied via management API.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  granted_at timestamptz not null default now(),
  payment_id uuid
);
create unique index licenses_one_active_per_sku on public.licenses(user_id, sku) where status = 'active';
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  provider_ref text,
  amount integer not null,
  currency text not null default 'PHP',
  status text not null check (status in ('pending','paid','failed','refunded')),
  created_at timestamptz not null default now()
);
create table public.pricing (
  sku text primary key,
  price integer not null,
  currency text not null default 'PHP',
  active boolean not null default true
);
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('feedback','suggestion','feature_request')),
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'new' check (status in ('new','reviewed','done')),
  created_at timestamptz not null default now()
);
create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  notes text
);

-- auto-create profile on signup
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: users read their own; public reads pricing/flags; ALL writes go through service role (bypasses RLS)
alter table public.profiles enable row level security;
alter table public.licenses enable row level security;
alter table public.payments enable row level security;
alter table public.pricing enable row level security;
alter table public.feedback enable row level security;
alter table public.feature_flags enable row level security;

create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "own licenses" on public.licenses for select using (auth.uid() = user_id);
create policy "own payments" on public.payments for select using (auth.uid() = user_id);
create policy "public pricing" on public.pricing for select using (active);
create policy "public flags" on public.feature_flags for select using (true);
create policy "own feedback read" on public.feedback for select using (auth.uid() = user_id);
create policy "own feedback insert" on public.feedback for insert with check (auth.uid() = user_id);

insert into public.pricing (sku, price, currency, active) values ('latag-pro-lifetime', 499, 'PHP', true);
