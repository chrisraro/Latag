-- Finish what 0006 started.
--
-- 0006 moved the PUBLIC shop_items policy behind a SECURITY DEFINER function,
-- but the storefront still 401'd with "permission denied for table shops".
-- Reason: shop_items also carries `"own shop items all" ... FOR ALL`, and a
-- FOR ALL policy is evaluated for SELECT too. Permissive policies are OR'd, so
-- Postgres still had to evaluate that predicate — and it reads public.shops
-- directly, which anon can no longer do after 0005's column-grant switch.
--
-- Same remedy: the ownership test moves into a definer function. anon can call
-- it (it returns false for them), the owner still gets full access, and nobody
-- needs table-level SELECT on shops.

create or replace function public.shop_is_mine(p_shop_id uuid)
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
      and s.user_id = auth.uid()
  );
$$;

grant execute on function public.shop_is_mine(uuid) to anon, authenticated;

drop policy if exists "own shop items all" on public.shop_items;

create policy "own shop items all" on public.shop_items
  for all
  using (public.shop_is_mine(shop_id))
  with check (public.shop_is_mine(shop_id));
