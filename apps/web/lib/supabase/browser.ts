import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components. Cookie access is handled
 * automatically via `document.cookie` by @supabase/ssr — no getAll/setAll
 * wiring needed here (per the installed package's createBrowserClient docs).
 */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
