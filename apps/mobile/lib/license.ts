import { eq } from "drizzle-orm";
import { entitlements } from "../db/schema";
import { ensureEntitlements } from "./entitlements";

const LICENSE_URL = "https://latag.vercel.app/api/license";

// db is any sync drizzle sqlite database that includes the entitlements table.
type AnyDb = any;

export type FetchLicenseResult =
  | { kind: "pro"; receipt: string }
  | { kind: "none" }
  | { kind: "error" };

/**
 * Caches a verified license locally: pro=true + the opaque receipt.
 * Idempotent — safe to call repeatedly with the same receipt.
 */
export function applyLicense(db: AnyDb, input: { receipt: string }): void {
  ensureEntitlements(db);
  db.update(entitlements)
    .set({ pro: true, licenseReceipt: input.receipt })
    .where(eq(entitlements.id, 1))
    .run();
}

/**
 * Reverts the cached license to the free tier. logsUsed is left untouched
 * so the free counter resumes from wherever it was before Pro.
 */
export function clearLicense(db: AnyDb): void {
  ensureEntitlements(db);
  db.update(entitlements)
    .set({ pro: false, licenseReceipt: null })
    .where(eq(entitlements.id, 1))
    .run();
}

/**
 * Fetches license status from the backend. Never throws — network errors,
 * non-2xx statuses (other than 404), and malformed 200 bodies all resolve
 * to { kind: "error" } so callers can safely no-op on failure (offline-first:
 * cached Pro survives forever; only a definitive 404 clears it).
 */
export async function fetchLicense(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
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

    if (status === "active" && typeof receipt === "string" && receipt.length > 0) {
      return { kind: "pro", receipt };
    }
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
