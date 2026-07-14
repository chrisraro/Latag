import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Server Actions and Route
 * Handlers. `cookies()` is async in Next 16 and must be awaited.
 *
 * `setAll` is wrapped in try/catch: Server Components cannot set cookies, so
 * writes made from there are ignored — the proxy (`proxy.ts`) is what
 * actually refreshes and persists the session on every request. See the
 * installed @supabase/ssr README / docs/design.md for this pattern.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookies can't be set here.
            // Safe to ignore because the proxy refreshes the session on
            // every request.
          }
        },
      },
    }
  );
}
