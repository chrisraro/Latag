-- Restore public reads of shop_items after 0005, without re-exposing shops.user_id.
--
-- 0005 revoked anon's table-level SELECT on public.shops and replaced it with
-- column grants, to stop `?select=user_id` returning the owner's auth PK.
-- That broke the storefront: the shop_items SELECT policy checks visibility
-- with `exists (select 1 from public.shops ...)`, and a policy predicate runs
-- as the CALLING role — so anon suddenly needed a privilege it no longer had.
-- Observed live: /rest/v1/shop_items?select=... -> 401 42501 "permission denied",
-- hinting at public.shops. Every published storefront's item grid was empty.
--
-- Fix: move the visibility test into a SECURITY DEFINER function. It reads
-- shops as its owner, so the policy no longer requires the caller to hold any
-- privilege on that table, and user_id stays unreadable by anon.
--
-- The function is deliberately narrow: it answers one boolean about one shop
-- and never returns a row, so it cannot become a data-exfiltration path.

create or replace function public.shop_item_visible(p_shop_id uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shops s
    where s.id = p_shop_id
      and s.is_published
      and (p_status = 'available' or s.show_sold)
  );
$$;

-- The policy is evaluated for anon and authenticated callers, so both need to
-- be able to call it. It exposes nothing beyond the boolean the policy needs.
grant execute on function public.shop_item_visible(uuid, text) to anon, authenticated;

drop policy if exists "public shop items" on public.shop_items;

create policy "public shop items" on public.shop_items
  for select
  using (public.shop_item_visible(shop_id, status));
