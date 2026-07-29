/**
 * RevenueCat SDK wrapper for in-app subscriptions on iOS & Android.
 *
 * ## Setup
 * 1. `npx expo install react-native-purchases`
 * 2. Set `EXPO_PUBLIC_REVENUECAT_API_KEY` in apps/mobile/.env
 * 3. Call `configureRevenueCat()` once on app start (already done in _layout.tsx)
 * 4. Call `loginRevenueCat(userId)` after Supabase sign-in (already done in auth-complete.ts)
 *
 * Product identifiers (match App Store Connect / Google Play Console):
 *   - `latag_pro_monthly`   → ₱199/month, 14-day free trial
 *   - `latag_pro_yearly`    → ₱1,799/year, 14-day free trial
 * Entitlement: `pro`
 *
 * ⚠️ Make sure the RC API key in .env matches your *iOS/Android* key
 *    (from RC Dashboard → Project Settings → API Keys), NOT the web public key.
 *
 * @see https://www.revenuecat.com/docs
 */

import type { CustomerInfo, PurchasesOfferings, PurchasesStoreProduct } from "react-native-purchases";

const RC_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? "";

// ─── Config ───────────────────────────────────────────────────────────

/** Whether the RevenueCat SDK has been configured (has an API key). */
export function isRevenueCatConfigured(): boolean {
  return RC_API_KEY.length > 0;
}

/**
 * Configure the RevenueCat SDK. Call once at app start.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function configureRevenueCat(): Promise<void> {
  if (!RC_API_KEY) return;
  try {
    const Purchases = await import("react-native-purchases");
    Purchases.default.configure({ apiKey: RC_API_KEY });
  } catch {
    // react-native-purchases not installed or native module missing.
  }
}

// ─── User identity ────────────────────────────────────────────────────

/** Link the current Supabase user to RevenueCat for entitlement tracking. */
export async function loginRevenueCat(appUserId: string): Promise<void> {
  if (!RC_API_KEY || !appUserId) return;
  try {
    const Purchases = await import("react-native-purchases");
    await Purchases.default.logIn(appUserId);
  } catch {
    // Offline or SDK unavailable
  }
}

/** Clear RevenueCat identity on sign-out. */
export async function logoutRevenueCat(): Promise<void> {
  if (!RC_API_KEY) return;
  try {
    const Purchases = await import("react-native-purchases");
    await Purchases.default.logOut();
  } catch {
    // No-op
  }
}

// ─── Entitlement checking ─────────────────────────────────────────────

export type ProStatus =
  | { kind: "active"; willRenew: boolean; expiresAt: string | null }
  | { kind: "trial"; expiresAt: string | null }
  | { kind: "none" }
  | { kind: "error" };

/**
 * Check the current Pro entitlement status from the RevenueCat SDK cache.
 * Returns `null` if RevenueCat is not configured.
 */
export async function checkProStatus(): Promise<ProStatus | null> {
  if (!RC_API_KEY) return null;
  try {
    const Purchases = await import("react-native-purchases");
    const { customerInfo } = await Purchases.default.getCustomerInfo();
    return parseProStatus(customerInfo);
  } catch {
    return { kind: "error" };
  }
}

/** Parse a CustomerInfo object into ProStatus. */
export function parseProStatus(customerInfo: CustomerInfo): ProStatus {
  const pro = customerInfo.entitlements.active["pro"];
  if (!pro) return { kind: "none" };
  if (pro.periodType === "TRIAL") {
    return { kind: "trial", expiresAt: pro.expirationDate ?? null };
  }
  return {
    kind: "active",
    willRenew: pro.willRenew ?? false,
    expiresAt: pro.expirationDate ?? null,
  };
}

/** Human-readable label for subscription period. */
export function periodLabel(pro: ProStatus & { kind: "active" | "trial" }): string {
  if (pro.kind === "trial") {
    return pro.expiresAt
      ? `Trial ends ${new Date(pro.expiresAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`
      : "Trial active";
  }
  return pro.willRenew ? "Renews monthly" : "Cancels after period";
}

// ─── Offerings (remote paywall config) ─────────────────────────────────

export type RCProduct = {
  sku: string;
  identifier: string;
  title: string;
  price: number;
  priceString: string;
  currencyCode: string;
  introPrice: { price: number; priceString: string; period: string; periodUnit: string } | null;
};

/**
 * Fetch offerings from RevenueCat.  The RC dashboard lets you remotely
 * configure which products show and their presentation order.
 * Returns the first offering's products (our "Default" offering).
 */
export async function getOfferings(): Promise<RCProduct[] | null> {
  if (!RC_API_KEY) return null;
  try {
    const Purchases = await import("react-native-purchases");
    const offerings: PurchasesOfferings = await Purchases.default.getOfferings();
    const current = offerings.current;
    if (!current?.availablePackages?.length) return null;

    return current.availablePackages.map((pkg) => {
      const prod = pkg.product;
      return {
        sku: prod.identifier,
        identifier: prod.identifier,
        title: prod.title,
        price: prod.price,
        priceString: prod.priceString,
        currencyCode: prod.currencyCode,
        introPrice: prod.introPrice
          ? {
              price: prod.introPrice.price,
              priceString: prod.introPrice.priceString,
              period: prod.introPrice.subscriptionPeriod,
              periodUnit: prod.introPrice.periodUnit,
            }
          : null,
      };
    });
  } catch {
    return null;
  }
}

// ─── Purchasing ───────────────────────────────────────────────────────

export type PurchaseResult =
  | { kind: "success"; customerInfo: CustomerInfo }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

/**
 * Purchase a product by its identifier (e.g. `latag_pro_monthly`).
 * The native App Store / Play Store UI handles the payment sheet,
 * biometrics, and free trial agreement.
 */
export async function purchaseProduct(identifier: string): Promise<PurchaseResult> {
  if (!RC_API_KEY) return { kind: "error", message: "RevenueCat not configured" };
  try {
    const Purchases = await import("react-native-purchases");
    const { customerInfo } = await Purchases.default.purchaseProduct(identifier);
    return { kind: "success", customerInfo };
  } catch (err: unknown) {
    const rc = err as { code?: number; message?: string; userCancelled?: boolean };
    if (rc.userCancelled || rc.code === 1 /* RC_CANCELLED */) {
      return { kind: "cancelled" };
    }
    return { kind: "error", message: rc.message ?? "Purchase failed" };
  }
}

// ─── Restoration ──────────────────────────────────────────────────────

export type RestoreResult =
  | { kind: "restored"; customerInfo: CustomerInfo }
  | { kind: "nothing" }
  | { kind: "error"; message: string };

/**
 * Restore previous purchases (App Store / Play Store).
 * RC looks up the user's transaction history and returns a CustomerInfo
 * with any entitlements that are still valid.
 */
export async function restorePurchases(): Promise<RestoreResult> {
  if (!RC_API_KEY) return { kind: "error", message: "RevenueCat not configured" };
  try {
    const Purchases = await import("react-native-purchases");
    const { customerInfo } = await Purchases.default.restorePurchases();
    const hasPro = customerInfo.entitlements.active["pro"];
    if (hasPro) {
      return { kind: "restored", customerInfo };
    }
    return { kind: "nothing" };
  } catch (err: unknown) {
    return { kind: "error", message: (err as Error).message ?? "Restore failed" };
  }
}

// ─── Entitlement change listener ──────────────────────────────────────

type EntitlementCallback = (proStatus: ProStatus) => void;

let _entitlementCallback: EntitlementCallback | null = null;
let _listenerAttached = false;

/**
 * Register a callback that fires whenever the entitlements change
 * (e.g. purchase succeeded, subscription expired, restored).
 * Call once from _layout.tsx or a root component.
 */
export function onEntitlementUpdate(callback: EntitlementCallback): void {
  _entitlementCallback = callback;
  if (_listenerAttached) return;
  _listenerAttached = true;

  // We attach the listener lazily on next import.
  (async () => {
    try {
      const Purchases = await import("react-native-purchases");
      Purchases.default.addCustomerInfoUpdateListener((info: CustomerInfo) => {
        const status = parseProStatus(info);
        _entitlementCallback?.(status);
      });
    } catch {
      // No-op
    }
  })();
}
