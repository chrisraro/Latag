-- Security-advisor remediation (lints 0028/0029): SECURITY DEFINER functions
-- must not be callable through the public PostgREST API. Both are trigger/
-- platform helpers, never meant as RPC endpoints. Revoking EXECUTE does not
-- affect trigger execution (triggers run as the function owner).
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
