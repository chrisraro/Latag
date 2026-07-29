import { supabase } from "./supabase";
import { db } from "../db/client";
import { items } from "../db/schema";
import { fetchLicense, applyLicense, clearLicense } from "./license";
import { ensureEntitlements } from "./entitlements";
import { loginRevenueCat, checkProStatus, isRevenueCatConfigured } from "./purchases";
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

    // --- RevenueCat integration ---
    if (isRevenueCatConfigured()) {
      await loginRevenueCat(session.user.id);
    }

    // --- License check ---
    if (isRevenueCatConfigured()) {
      const rcPro = await checkProStatus();
      if (rcPro && (rcPro.kind === "active" || rcPro.kind === "trial")) {
        applyLicense(db, {
          receipt: "rc_entitlement",
          expiresAt: rcPro.expiresAt,
        });
        const label =
          rcPro.kind === "trial"
            ? "Pro trial activated — enjoy!"
            : "Pro active — yours while subscribed";
        showSuccess(label);
      } else if (rcPro && rcPro.kind === "none") {
        clearLicense(db);
        showSuccess("Signed in — no Pro subscription on this account yet");
      } else {
        // RC SDK unavailable — fall through to HTTP
        await fallbackLicenseFetch(session.access_token);
      }
    } else {
      // RevenueCat not configured — use HTTP license API
      await fallbackLicenseFetch(session.access_token);
    }

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

/** Fallback license check via the HTTP /api/license endpoint. */
async function fallbackLicenseFetch(accessToken: string): Promise<void> {
  const res = await fetchLicense(accessToken);
  if (res.kind === "pro") {
    applyLicense(db, { receipt: res.receipt, expiresAt: res.expiresAt });
    showSuccess("Pro active — yours while subscribed");
  } else if (res.kind === "none") {
    // Don't wipe a cached Pro license — the user may have a RevenueCat
    // subscription that hasn't synced to the licenses table yet.
    const existing = ensureEntitlements(db);
    if (existing.pro) {
      showSuccess("Signed in — couldn't verify Pro with the server, but your existing license is preserved.");
    } else {
      clearLicense(db);
      showSuccess("Signed in — no Pro subscription on this account yet");
    }
  } else {
    showSuccess("Signed in — couldn't check license (offline?). Refresh from Settings when online.");
  }
}
