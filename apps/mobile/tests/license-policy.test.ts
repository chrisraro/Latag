import { resolveLicenseAction } from "../lib/license-policy";
import type { ProStatus } from "../lib/purchases";
import type { FetchLicenseResult } from "../lib/license";

const RC_ACTIVE: ProStatus = { kind: "active", willRenew: true, expiresAt: "2027-01-01T00:00:00Z" };
const RC_TRIAL: ProStatus = { kind: "trial", expiresAt: "2026-08-13T00:00:00Z" };
const RC_NONE: ProStatus = { kind: "none" };
const RC_ERROR: ProStatus = { kind: "error" };

const SERVER_PRO: FetchLicenseResult = { kind: "pro", receipt: "latag1.sig", expiresAt: null };
const SERVER_NONE: FetchLicenseResult = { kind: "none" };
const SERVER_ERROR: FetchLicenseResult = { kind: "error" };

/**
 * Decides what a licence refresh should do to the local cache.
 *
 * The rule that matters: RevenueCat is authoritative for *subscriptions* only.
 * It knows nothing about admin comps or grandfathered grants, which live in
 * the licences table. So "RevenueCat says no" is never, on its own, grounds
 * to revoke Pro — the server must be consulted first.
 */
describe("resolveLicenseAction", () => {
  describe("positive signals unlock Pro", () => {
    test("an active RevenueCat subscription unlocks Pro", () => {
      const action = resolveLicenseAction({ rc: RC_ACTIVE, server: SERVER_NONE, cachedPro: false });
      expect(action.kind).toBe("apply");
      if (action.kind !== "apply") throw new Error("unreachable");
      expect(action.expiresAt).toBe("2027-01-01T00:00:00Z");
    });

    test("a RevenueCat trial unlocks Pro", () => {
      const action = resolveLicenseAction({ rc: RC_TRIAL, server: SERVER_NONE, cachedPro: false });
      expect(action.kind).toBe("apply");
    });

    /**
     * THE REGRESSION. A user comped through the admin console has no
     * RevenueCat subscription at all. Treating that as "no Pro" revoked
     * access that the server had already granted.
     */
    test("a server-granted licence unlocks Pro even when RevenueCat reports no subscription", () => {
      const action = resolveLicenseAction({ rc: RC_NONE, server: SERVER_PRO, cachedPro: false });
      expect(action.kind).toBe("apply");
      if (action.kind !== "apply") throw new Error("unreachable");
      expect(action.receipt).toBe("latag1.sig");
    });

    test("a server-granted licence unlocks Pro when RevenueCat is unavailable", () => {
      const action = resolveLicenseAction({ rc: RC_ERROR, server: SERVER_PRO, cachedPro: false });
      expect(action.kind).toBe("apply");
    });

    test("a server-granted licence unlocks Pro when RevenueCat is not configured", () => {
      const action = resolveLicenseAction({ rc: null, server: SERVER_PRO, cachedPro: false });
      expect(action.kind).toBe("apply");
    });

    test("a live RevenueCat subscription wins over a server that has not synced yet", () => {
      // Webhook lag right after purchase: RC already knows, the table does not.
      const action = resolveLicenseAction({ rc: RC_ACTIVE, server: SERVER_NONE, cachedPro: false });
      expect(action.kind).toBe("apply");
    });
  });

  describe("revoking requires both sources to agree", () => {
    test("no subscription and no server licence clears a stale cached Pro", () => {
      const action = resolveLicenseAction({ rc: RC_NONE, server: SERVER_NONE, cachedPro: true });
      expect(action.kind).toBe("clear");
    });

    test("no subscription and no server licence stays free for a free user", () => {
      const action = resolveLicenseAction({ rc: RC_NONE, server: SERVER_NONE, cachedPro: false });
      expect(action.kind).toBe("clear");
    });

    test("RevenueCat alone can never revoke — the server must be consulted", () => {
      // Server unreachable: we have exactly one definitive negative, which is
      // not enough to take away access the user may legitimately hold.
      const action = resolveLicenseAction({ rc: RC_NONE, server: SERVER_ERROR, cachedPro: true });
      expect(action.kind).not.toBe("clear");
    });
  });

  describe("unverifiable checks preserve what the user already has", () => {
    test("both sources unreachable keeps a cached Pro licence", () => {
      const action = resolveLicenseAction({ rc: RC_ERROR, server: SERVER_ERROR, cachedPro: true });
      expect(action.kind).toBe("keep");
    });

    test("an unreachable RevenueCat plus an empty server keeps a cached Pro licence", () => {
      // Cannot distinguish "genuinely cancelled" from "webhook has not landed".
      const action = resolveLicenseAction({ rc: RC_ERROR, server: SERVER_NONE, cachedPro: true });
      expect(action.kind).toBe("keep");
    });

    test("an unreachable check on a free account clears rather than inventing Pro", () => {
      const action = resolveLicenseAction({ rc: RC_ERROR, server: SERVER_NONE, cachedPro: false });
      expect(action.kind).toBe("clear");
    });

    test("a server error on a free account reports failure without granting Pro", () => {
      const action = resolveLicenseAction({ rc: RC_ERROR, server: SERVER_ERROR, cachedPro: false });
      expect(action.kind).toBe("unverified");
    });
  });

  describe("every outcome carries a message for the user", () => {
    const cases: { rc: ProStatus | null; server: FetchLicenseResult; cachedPro: boolean }[] = [
      { rc: RC_ACTIVE, server: SERVER_NONE, cachedPro: false },
      { rc: RC_NONE, server: SERVER_PRO, cachedPro: false },
      { rc: RC_NONE, server: SERVER_NONE, cachedPro: true },
      { rc: RC_ERROR, server: SERVER_ERROR, cachedPro: true },
      { rc: RC_ERROR, server: SERVER_ERROR, cachedPro: false },
      { rc: null, server: SERVER_PRO, cachedPro: false },
    ];

    test.each(cases)("resolves %#", (input) => {
      const action = resolveLicenseAction(input);
      expect(typeof action.message).toBe("string");
      expect(action.message.length).toBeGreaterThan(0);
    });
  });
});
