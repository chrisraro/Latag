import type { ProStatus } from "./purchases";
import type { FetchLicenseResult } from "./license";

/** What a licence refresh should do to the locally cached entitlement. */
export type LicenseAction =
  /** Cache Pro with this receipt. */
  | { kind: "apply"; receipt: string; expiresAt: string | null; message: string }
  /** Definitively not Pro — drop any cached licence. */
  | { kind: "clear"; message: string }
  /** Could not verify, but the user already has Pro — leave it alone. */
  | { kind: "keep"; message: string }
  /** Could not verify and there is nothing cached — report and change nothing. */
  | { kind: "unverified"; message: string };

export type LicenseInputs = {
  /** RevenueCat entitlement, or `null` when the SDK is not configured. */
  rc: ProStatus | null;
  /** Result of the `/api/license` call. Always required — see below. */
  server: FetchLicenseResult;
  /** Whether the device currently has Pro cached. */
  cachedPro: boolean;
};

/**
 * Decides the fate of the local Pro cache from both sources of truth.
 *
 * RevenueCat is authoritative for **subscriptions only**. It has no knowledge
 * of admin comps or grandfathered grants, which exist solely as rows in the
 * `licenses` table. A previous version short-circuited on RevenueCat's
 * "no subscription" and cleared the cache without ever calling the server,
 * which revoked Pro from every comped user. Hence both inputs are required
 * here: the type makes it impossible to decide on RevenueCat alone.
 *
 * Access is granted on either positive signal, and revoked only when both
 * sources agree there is nothing — an unverifiable check never costs a user
 * access they already have.
 */
export function resolveLicenseAction({ rc, server, cachedPro }: LicenseInputs): LicenseAction {
  // --- Positive signals -------------------------------------------------
  // A live subscription. Trusted immediately, since RevenueCat knows about a
  // fresh purchase before our webhook has had a chance to land.
  if (rc && (rc.kind === "active" || rc.kind === "trial")) {
    return {
      kind: "apply",
      receipt: "rc_entitlement",
      expiresAt: rc.expiresAt,
      message:
        rc.kind === "trial"
          ? "Pro trial active — enjoy!"
          : "Pro active — yours while subscribed",
    };
  }

  // A server-issued licence: a paid subscription already synced, an admin
  // comp, or a grandfathered grant. This is the branch that comped users
  // depend on, and it must be reachable even when RevenueCat says "none".
  if (server.kind === "pro") {
    return {
      kind: "apply",
      receipt: server.receipt,
      expiresAt: server.expiresAt,
      message: "Pro active — yours while subscribed",
    };
  }

  // --- Negative signals -------------------------------------------------
  // Both sources reachable and both say no. Only now is revoking justified.
  if (rc?.kind === "none" && server.kind === "none") {
    return { kind: "clear", message: "No Pro subscription on this account" };
  }

  // The server is definitive about comps and synced subscriptions, so an
  // empty result on a free account settles it even if RevenueCat was
  // unreachable — there is no access to lose.
  if (server.kind === "none" && !cachedPro) {
    return { kind: "clear", message: "No Pro subscription on this account" };
  }

  // --- Unverifiable -----------------------------------------------------
  if (cachedPro) {
    return {
      kind: "keep",
      message:
        "Couldn't verify Pro with the server — your existing licence is preserved. If you just subscribed, it may take a few minutes to sync.",
    };
  }

  return {
    kind: "unverified",
    message: "Couldn't check licence — check your connection and try again",
  };
}
