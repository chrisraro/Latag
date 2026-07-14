import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session-refresh proxy (Next.js 16 renamed `middleware.ts` -> `proxy.ts`;
 * see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 * — the `middleware` file convention is deprecated in this version).
 *
 * This mirrors the @supabase/ssr SSR guide's Next.js proxy pattern: read
 * cookies off the request, write refreshed cookies onto both the request
 * (so downstream Server Components see them) and the response (so the
 * browser does), and forward the cache-control headers the library passes
 * to setAll so auth responses are never cached by a CDN.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  // Do not run code between createServerClient and getClaims() — doing so
  // makes it easy to introduce a bug where users are randomly logged out.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: ["/account/:path*", "/admin/:path*", "/api/license"],
};
