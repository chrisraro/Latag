-- Narrow what an anonymous buyer can read from public.shops.
--
-- THE HOLE
-- 0003 created `shops` (so Supabase's default privileges handed `anon` a
-- table-wide SELECT) and added `create policy "public shops" ... using
-- (is_published)`. RLS decides WHICH ROWS; grants decide WHICH COLUMNS, and
-- nothing decided the latter. So an unauthenticated
-- `GET /rest/v1/shops?select=*` returned `user_id` — the owner's auth.users
-- primary key — for every published shop. Not directly exploitable (that id is
-- a bearer of nothing on its own) but it is a stable cross-surface identifier
-- for a real person, published to anyone who asks, for no reason.
--
-- THE APPROACH: column grants, not a shops_public view
--   * RLS stays the single source of row visibility. A view would have to
--     restate `is_published` in its WHERE clause, and a view without
--     `security_invoker = on` runs as its owner and bypasses `shops` RLS
--     altogether — two ways to end up with row rules in two places.
--   * apps/web/lib/shop-queries.ts does not change shape: it still selects an
--     explicit column list `from("shops")`. No view name, no second row type,
--     no PostgREST embedding rewrite.
--   * `select=*` as anon now fails loudly with `permission denied for table
--     shops` instead of quietly widening the next time someone adds a column.
--     A privacy boundary should break the build, not leak.
--
-- SCOPE: `anon` only. `authenticated` is deliberately untouched —
-- apps/mobile/lib/shop-api.ts `checkHandleAvailable` reads `user_id` off a
-- possibly-foreign shop row to answer "is this handle already mine?", and the
-- mobile writer needs every column. Narrowing `authenticated` would 403 the
-- handle picker.
--
-- Replay-safe: revoke/grant are idempotent, so re-running is a no-op.
--
-- APPLY: not applied by this commit. Run it through the management API /
-- `supabase db push`, the same route as 0001-0004. Until it is applied the web
-- code below still works — it only ever asked for granted columns.
--
-- VERIFY (as the anon role):
--   set local role anon;
--   select * from public.shops;             -- ERROR: permission denied
--   select handle from public.shops;        -- published shops only, no user_id
--   reset role;

revoke select on public.shops from anon;

-- Buyer-facing columns, plus the two booleans the RLS policies on `shops` and
-- `shop_items` evaluate, plus `updated_at` for sitemap lastModified.
-- Withheld on purpose: user_id, created_at.
grant select (
  id,
  handle,
  display_name,
  bio,
  contact_messenger,
  contact_instagram,
  contact_email,
  show_sold,
  is_published,
  updated_at
) on public.shops to anon;
