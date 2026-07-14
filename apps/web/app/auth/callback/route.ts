import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Completes sign-in when the user clicks the emailed link (PKCE ?code=...).
 * Interim path while the free-tier default email template shows a link
 * instead of the 6-digit code; the code-entry UI on /account/sign-in keeps
 * working and becomes primary once custom SMTP unlocks template editing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/account", url.origin));
    }
  }

  return NextResponse.redirect(new URL("/account/sign-in", url.origin));
}
