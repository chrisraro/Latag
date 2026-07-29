import { eq } from "drizzle-orm";
import { entitlements } from "../db/schema";
import { ensureEntitlements } from "./entitlements";
import type { LatagDb } from "../db/client";

const LICENSE_URL =
  process.env.EXPO_PUBLIC_LICENSE_URL ?? "https://latag.vercel.app/api/license";

export type FetchLicenseResult =
  | { kind: "pro"; receipt: string; expiresAt: string | null }
  | { kind: "none" }
  | { kind: "error" };

/**
 * Caches a verified license locally: pro=true, receipt, and optional expiry.
 * Idempotent — safe to call repeatedly with the same receipt.
 */
export function applyLicense(
  db: LatagDb,
  input: { receipt: string; expiresAt?: string | null },
): void {
  ensureEntitlements(db);
  db.update(entitlements)
    .set({ pro: true, licenseReceipt: input.receipt })
    .where(eq(entitlements.id, 1))
    .run();
}

/**
 * Reverts the cached license to the free tier.
 */
export function clearLicense(db: LatagDb): void {
  ensureEntitlements(db);
  db.update(entitlements)
    .set({ pro: false, licenseReceipt: null })
    .where(eq(entitlements.id, 1))
    .run();
}

/**
 * Fetches license status from the backend. Returns the receipt + expiry info.
 * Never throws — network errors, non-2xx statuses, and malformed bodies all
 * resolve to { kind: "error" } so callers can safely no-op on failure.
 */
export async function fetchLicense(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchLicenseResult> {
  try {
    const res = await fetchImpl(LICENSE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) return { kind: "none" };
    if (res.status !== 200) return { kind: "error" };

    const body = await res.json();
    const status = body?.license?.status;
    const receipt = body?.receipt;

    if (
      (status === "active" || status === "past_due") &&
      typeof receipt === "string" &&
      receipt.length > 0
    ) {
      return {
        kind: "pro",
        receipt,
        expiresAt: body?.license?.expiresAt ?? null,
      };
    }
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
