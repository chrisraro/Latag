/**
 * react-native-purchases (Wave 4 Task 2) landed in package.json so its real
 * types replace the hand-written stub, but RevenueCat configuration is still
 * pending with the owner: `EXPO_PUBLIC_REVENUECAT_API_KEY` is empty in every
 * environment until then. This file proves the app stays runtime-inert in
 * that state — every RC-gated function in lib/purchases.ts must short-circuit
 * on the empty key *before* ever touching the native module, so the module
 * being newly present in node_modules changes nothing observable yet.
 */

const RC_ENV_VAR = "EXPO_PUBLIC_REVENUECAT_API_KEY";

type PurchasesSpies = {
  configure: jest.Mock;
  logIn: jest.Mock;
  logOut: jest.Mock;
  getCustomerInfo: jest.Mock;
  getOfferings: jest.Mock;
  purchaseProduct: jest.Mock;
  restorePurchases: jest.Mock;
  addCustomerInfoUpdateListener: jest.Mock;
};

/**
 * Loads a fresh copy of lib/purchases.ts with EXPO_PUBLIC_REVENUECAT_API_KEY
 * forced empty, and "react-native-purchases" replaced by spies. If any
 * RC-gated function reaches into the native module despite the missing key,
 * the corresponding spy call count catches it.
 */
function loadPurchasesWithEmptyKey(): { purchases: typeof import("../lib/purchases"); spies: PurchasesSpies } {
  jest.resetModules();

  const spies: PurchasesSpies = {
    configure: jest.fn(),
    logIn: jest.fn(async () => {}),
    logOut: jest.fn(async () => {}),
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
    getOfferings: jest.fn(async () => ({ current: null })),
    purchaseProduct: jest.fn(async () => ({ customerInfo: { entitlements: { active: {} } } })),
    restorePurchases: jest.fn(async () => ({ entitlements: { active: {} } })),
    addCustomerInfoUpdateListener: jest.fn(),
  };

  jest.doMock("react-native-purchases", () => ({ default: spies }));

  const prevKey = process.env[RC_ENV_VAR];
  process.env[RC_ENV_VAR] = "";
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const purchases = require("../lib/purchases");
  if (prevKey === undefined) delete process.env[RC_ENV_VAR];
  else process.env[RC_ENV_VAR] = prevKey;

  return { purchases, spies };
}

afterEach(() => {
  jest.dontMock("react-native-purchases");
  jest.resetModules();
});

describe("purchases.ts is runtime-inert with no RevenueCat API key", () => {
  test("isRevenueCatConfigured() is false", () => {
    const { purchases } = loadPurchasesWithEmptyKey();
    expect(purchases.isRevenueCatConfigured()).toBe(false);
  });

  test("every RC-gated function resolves its not-configured value and never touches the native module", async () => {
    const { purchases, spies } = loadPurchasesWithEmptyKey();

    await expect(purchases.configureRevenueCat()).resolves.toBeUndefined();
    await expect(purchases.loginRevenueCat("user-1")).resolves.toBeUndefined();
    await expect(purchases.logoutRevenueCat()).resolves.toBeUndefined();
    await expect(purchases.checkProStatus()).resolves.toBeNull();
    await expect(purchases.getOfferings()).resolves.toBeNull();
    await expect(purchases.purchaseProduct("latag_pro_monthly")).resolves.toEqual({
      kind: "error",
      message: "RevenueCat not configured",
    });
    await expect(purchases.restorePurchases()).resolves.toEqual({
      kind: "error",
      message: "RevenueCat not configured",
    });
    // onEntitlementUpdate is synchronous and void — there's no resolved value
    // to assert, only whether it reaches the native module below.
    purchases.onEntitlementUpdate(() => {});
    await new Promise((resolve) => setImmediate(resolve));

    // The real proof: none of these guarded calls ever reached the (mocked)
    // native module — a removed guard would show up here even if the
    // function's resolved value happened to look the same.
    expect(spies.configure).not.toHaveBeenCalled();
    expect(spies.logIn).not.toHaveBeenCalled();
    expect(spies.logOut).not.toHaveBeenCalled();
    expect(spies.getCustomerInfo).not.toHaveBeenCalled();
    expect(spies.getOfferings).not.toHaveBeenCalled();
    expect(spies.purchaseProduct).not.toHaveBeenCalled();
    expect(spies.restorePurchases).not.toHaveBeenCalled();
    expect(spies.addCustomerInfoUpdateListener).not.toHaveBeenCalled();
  });

  // The assertion above (`spies.addCustomerInfoUpdateListener` not called)
  // cannot actually distinguish a present guard from an absent one: this
  // repo's Jest config has no `--experimental-vm-modules`, so the real
  // `await import("react-native-purchases")` inside onEntitlementUpdate's
  // async IIFE throws in Jest's Node VM unconditionally — caught by the
  // function's own try/catch — regardless of whether the guard exists.
  // (Verified directly: removing the guard still leaves that spy's call
  // count at 0, because the code never gets far enough to reach it either
  // way.) So unlike the seven functions above — where a missing guard is
  // caught by the *resolved value* changing from `null`/`undefined` to
  // `{ kind: "error" }` — onEntitlementUpdate needs a different check.
  //
  // What IS reliably observable: onEntitlementUpdate is a plain (non-async)
  // function, so babel's transform leaves its body inspectable via
  // `Function.prototype.toString()` instead of hiding it behind a
  // regenerator wrapper. The guard, if present, is literally its first
  // statement — the same structural property `tests/native-ui-gate.test.ts`
  // checks by reading source text for exactly this reason: some hazards
  // can't be reproduced by exercising the code in Jest at all.
  test("onEntitlementUpdate's not-configured guard is its first statement, same as its siblings", () => {
    const { purchases } = loadPurchasesWithEmptyKey();
    const src = purchases.onEntitlementUpdate.toString();
    expect(src).toMatch(/^function onEntitlementUpdate\([^)]*\)\s*\{\s*if\s*\(!RC_API_KEY\)\s*return;/);
  });
});
