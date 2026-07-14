import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { issueReceipt } from "@/lib/licensing";

export const dynamic = "force-dynamic";

const PRO_SKU = "latag-pro-lifetime";

/**
 * GET /api/license — the mobile app's source of truth for its Pro unlock.
 *
 * Auth: a `Authorization: Bearer <supabase access token>` header (mobile,
 * no cookies available) takes precedence; falls back to the cookie session
 * (portal / manual debugging in a browser). Either path resolves to a user
 * id, which the license lookup is then scoped to using the ADMIN client —
 * the bearer path has no browser cookies for RLS to key off, so the
 * authenticated user id from `getUser` is the only scoping mechanism, and
 * it is applied identically on both paths for one code path, one behavior.
 */
export async function GET(request: NextRequest) {
  const admin = createAdminSupabase();

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  let userId: string | null = null;

  if (bearerToken) {
    const { data, error } = await admin.auth.getUser(bearerToken);
    if (!error && data.user) {
      userId = data.user.id;
    }
  } else {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: license, error: licenseError } = await admin
    .from("licenses")
    .select("sku,status,granted_at")
    .eq("user_id", userId)
    .eq("sku", PRO_SKU)
    .eq("status", "active")
    .maybeSingle();

  if (licenseError) {
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
  if (!license) {
    return NextResponse.json({ license: null }, { status: 404 });
  }

  const secret = process.env.LICENSE_SIGNING_SECRET;
  if (!secret) {
    // Never leak which env var is missing — generic 500 only.
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }

  const grantedAt = new Date(license.granted_at).toISOString();
  const receipt = issueReceipt({ userId, sku: license.sku, grantedAt }, secret);

  return NextResponse.json({
    license: { sku: license.sku, status: license.status, grantedAt },
    receipt,
  });
}
