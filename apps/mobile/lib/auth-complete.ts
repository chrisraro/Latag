import { supabase } from "./supabase";
import { db } from "../db/client";
import { items } from "../db/schema";
import { fetchLicense, applyLicense, clearLicense } from "./license";
import { ensureEntitlements } from "./entitlements";
import { loginRevenueCat, checkProStatus, isRevenueCatConfigured } from "./purchases";
import type { ProStatus } from "./purchases";
import { resolveLicenseAction } from "./license-policy";
import { showSuccess } from "./toast";
import { restorePublishedItems } from "./shop-restore";

type BackableRouter = { back: () => void };

/**
 * Shared post-auth step: reads the freshly-established Supabase session,
 * checks subscription status via RevenueCat SDK (primary) or HTTP API
 * (fallback), and caches the result locally.
 *
 * The flow:
 * 1. Log the Supabase user into RevenueCat (links identities)
 * 2. Check RC entitlement → if "pro" active, cache locally
 * 3. If RC not available → fall back to HTTP /api/license
 *
 * Never throws: any failure is swallowed so a flaky/offline connection
 * can never crash the app.
 */
export async function completeSignIn(router?: BackableRouter): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return false;

    // --- License check ---
    // Both sources are consulted every time. RevenueCat covers subscriptions;
    // the server covers admin comps and grandfathered grants, which
    // RevenueCat cannot see. Deciding on RevenueCat alone signed comped users
    // straight out of Pro.
    let rc: ProStatus | null = null;
    if (isRevenueCatConfigured()) {
      await loginRevenueCat(session.user.id);
      rc = await checkProStatus();
    }
    const server = await fetchLicense(session.access_token);
    const cached = ensureEntitlements(db);

    const action = resolveLicenseAction({ rc, server, cachedPro: Boolean(cached.pro) });
    if (action.kind === "apply") {
      applyLicense(db, { receipt: action.receipt, expiresAt: action.expiresAt });
    } else if (action.kind === "clear") {
      clearLicense(db);
    }
    showSuccess(action.kind === "clear" ? `Signed in — ${action.message.toLowerCase()}` : action.message);

    router?.back();

    // --- Shop restore (data loss recovery) ---
    // If local DB is empty but Supabase has published items, the user
    // likely cleared data or reinstalled. Pull published listings back.
    try {
      const localCount = db.select().from(items).all().length;
      if (localCount === 0) {
        const restored = await restorePublishedItems(db);
        if (restored.restored > 0) {
          showSuccess(`Restored ${restored.restored} published listing${restored.restored === 1 ? "" : "s"} — check your Shop tab`);
        }
      }
    } catch {
      // Best-effort — never crash the sign-in flow
    }

    return true;
  } catch {
    return false;
  }
}
