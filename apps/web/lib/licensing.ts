import { createHmac, timingSafeEqual } from "node:crypto";

const VERSION = "latag1";

export type ReceiptClaims = { userId: string; sku: string; grantedAt: string };

// The HMAC covers the RAW base64url payload segment (version-prefixed), never
// decoded-then-re-encoded bytes. A second implementation (mobile) must likewise
// verify against the literal middle segment — re-serializing the JSON claims
// would break parity on key order and encoding.
function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${VERSION}.${payload}`).digest("base64url");
}

/** Deep module: the receipt format (version.payload.signature) is the whole contract. */
export function issueReceipt(claims: ReceiptClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${VERSION}.${payload}.${sign(payload, secret)}`;
}

export function verifyReceipt(receipt: string, secret: string): ({ valid: true } & ReceiptClaims) | { valid: false } {
  const parts = receipt.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return { valid: false };
  const [, payload, sig] = parts;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false };
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims.userId !== "string" || typeof claims.sku !== "string" || typeof claims.grantedAt !== "string") return { valid: false };
    return { valid: true, userId: claims.userId, sku: claims.sku, grantedAt: claims.grantedAt };
  } catch {
    return { valid: false };
  }
}

// ---------------------------------------------------------------------------
// Entitlement resolution
// ---------------------------------------------------------------------------

export type LicenseRow = {
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
 *
 * Shared by every surface that answers "is this user Pro?" from a set of
 * `licenses` rows — `/api/license` (the mobile app's source of truth) and
 * `/account` (the web portal). Both must resolve the same way: fetch every
 * entitling row for the user (never `.maybeSingle()`, which errors the moment
 * a user holds more than one row) and reduce it through this function.
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
