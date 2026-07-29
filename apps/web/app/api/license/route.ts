import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { issueReceipt } from "@/lib/licensing";
import { ENTITLING_SKUS } from "@latag/licensing";

export const dynamic = "force-dynamic";

type LicenseRow = {
  id: string;
  sku: string;
  status: string;
  granted_at: string;
  expires_at: string | null;
};

/**
 * Picks the license that actually unlocks Pro from every entitling row a user
 * holds. A user can hold more than one legitimately — an admin comp alongside
 * a paid subscription — so this must never assume a single row.
 *
 * Rows that have already lapsed are dropped first, so an expired subscription
 * can never mask a still-valid comp. Of what remains, a never-expiring grant
 * (comp / grandfathered lifetime) outranks a dated one, then the furthest
 * expiry, then `active` over `past_due`.
 */
export function pickEntitlingLicense(rows: LicenseRow[], now: number): LicenseRow | null {
  const live = rows.filter((r) => !r.expires_at || Date.parse(r.expires_at) >= now);
  if (live.length === 0) return null;

  return live.reduce((best, row) => {
    if (!best.expires_at) return best;
    if (!row.expires_at) return row;
    const diff = Date.parse(row.expires_at) - Date.parse(best.expires_at);
    if (diff !== 0) return diff > 0 ? row : best;
    return best.status === "active" ? best : row;
  });
}

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

  // Scoped to every SKU that grants Pro — not just the purchasable ones.
  // Filtering on purchasable SKUs alone locked out comped and grandfathered
  // users, whose rows carry a SKU that is no longer for sale.
  const { data: rows, error: licenseError } = await admin
    .from("licenses")
    .select("id,sku,status,granted_at,expires_at")
    .eq("user_id", userId)
    .in("sku", ENTITLING_SKUS)
    .in("status", ["active", "past_due"]);

  if (licenseError) {
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }

  const now = Date.now();
  const all = (rows ?? []) as LicenseRow[];
  const license = pickEntitlingLicense(all, now);

  if (!license) {
    // Reap any rows that lapsed while still marked active (fire-and-forget).
    for (const stale of all) {
      if (stale.status === "active" && stale.expires_at && Date.parse(stale.expires_at) < now) {
        void admin.from("licenses").update({ status: "expired" }).eq("id", stale.id);
      }
    }
    return NextResponse.json({ license: null }, { status: 404 });
  }

  const secret = process.env.LICENSE_SIGNING_SECRET;
  if (!secret) {
    // Never leak which env var is missing — generic 500 only.
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }

  const grantedAt = new Date(license.granted_at).toISOString();
  const expiresAt = license.expires_at ? new Date(license.expires_at).toISOString() : null;
  const receipt = issueReceipt({ userId, sku: license.sku, grantedAt }, secret);

  return NextResponse.json({
    license: {
      sku: license.sku,
      status: license.status,
      grantedAt,
      expiresAt,
    },
    receipt,
  });
}
