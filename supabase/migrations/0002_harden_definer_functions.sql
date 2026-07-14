-- Security-advisor remediation (lints 0028/0029): SECURITY DEFINER functions
-- must not be callable through the public PostgREST API. Revoking EXECUTE does
-- not affect trigger execution (triggers run as the function owner).

-- Ours (created in 0001):
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- rls_auto_enable() is a PLATFORM-provisioned event-trigger helper (documented
-- in supabase/platform-objects.md) that exists on the live project but is not
-- created by these migrations. Guarded so replays from an empty database work
-- (REVOKE has no IF EXISTS form).
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
  end if;
end $$;
