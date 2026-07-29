import { resolveLicenseAction, type LicenseAction } from "./license-policy";
import type { ProStatus } from "./purchases";
import type { FetchLicenseResult } from "./license";

/**
 * Everything `syncLicense` touches, injected so the decision path is testable
 * without Supabase, the network, or a native RevenueCat module.
 */
export type LicenseSyncDeps = {
  getSession: () => Promise<{ accessToken: string; userId: string } | null>;
  /** RevenueCat entitlement, or `null` when the SDK is not configured. */
  getRcStatus: () => Promise<ProStatus | null>;
  fetchServerLicense: (accessToken: string) => Promise<FetchLicenseResult>;
  readCachedPro: () => boolean;
  applyPro: (receipt: string, expiresAt: string | null) => void;
  clearPro: () => void;
};

/**
 * Reconciles the locally cached Pro entitlement with the server, silently.
 *
 * Runs on launch and on every foreground. Without it, a licence granted from
 * the admin console never reaches the device on its own: the only other
 * refresh points are sign-in, the auth deep link, and the manual "Refresh
 * license" button in Settings, so a comped user sits on "Free" indefinitely.
 *
 * Deliberately silent — no toasts. The user did not ask for this check, so it
 * must never interrupt them; the Settings button remains the place where a
 * licence check reports back.
 *
 * Never throws and never rejects: it is fired and forgotten from the root
 * layout, where an unhandled rejection would surface as a red box. Any
 * failure leaves the cache exactly as it was and returns `null`.
 *
 * @returns the action taken, or `null` if the sync was skipped or failed.
 */
export async function syncLicense(deps: LicenseSyncDeps): Promise<LicenseAction | null> {
  try {
    const session = await deps.getSession();
    // Signed out: nothing to reconcile, and no request to make on their behalf.
    if (!session) return null;

    // A missing or broken RevenueCat module must not stop the server check —
    // the server is the only source that knows about comps and legacy grants.
    let rc: ProStatus | null = null;
    try {
      rc = await deps.getRcStatus();
    } catch {
      rc = { kind: "error" };
    }

    const server = await deps.fetchServerLicense(session.accessToken);
    const action = resolveLicenseAction({ rc, server, cachedPro: deps.readCachedPro() });

    if (action.kind === "apply") {
      deps.applyPro(action.receipt, action.expiresAt);
    } else if (action.kind === "clear") {
      deps.clearPro();
    }

    return action;
  } catch {
    // Offline, auth client error, DB unavailable — leave the cache untouched.
    return null;
  }
}
