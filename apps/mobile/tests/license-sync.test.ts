import { syncLicense, type LicenseSyncDeps } from "../lib/license-sync";
import type { ProStatus } from "../lib/purchases";
import type { FetchLicenseResult } from "../lib/license";

const SERVER_PRO: FetchLicenseResult = { kind: "pro", receipt: "latag1.sig", expiresAt: null };
const SERVER_NONE: FetchLicenseResult = { kind: "none" };
const SERVER_ERROR: FetchLicenseResult = { kind: "error" };
const RC_NONE: ProStatus = { kind: "none" };

function makeDeps(over: Partial<LicenseSyncDeps> = {}) {
  const applyPro = jest.fn();
  const clearPro = jest.fn();
  const deps: LicenseSyncDeps = {
    getSession: jest.fn(async () => ({ accessToken: "tok", userId: "u1" })),
    getRcStatus: jest.fn(async () => null),
    fetchServerLicense: jest.fn(async () => SERVER_NONE),
    readCachedPro: jest.fn(() => false),
    applyPro,
    clearPro,
    ...over,
  };
  return { deps, applyPro, clearPro };
}

/**
 * Background licence sync, run on launch and on every foreground.
 *
 * This is what makes an admin console grant actually arrive: without it a
 * comped user keeps seeing "Free" until they happen to open Settings and tap
 * "Refresh license", because the only other refresh points are sign-in and
 * the auth deep link.
 */
describe("syncLicense", () => {
  test("a server-granted licence is cached for a signed-in user", async () => {
    const { deps, applyPro } = makeDeps({ fetchServerLicense: jest.fn(async () => SERVER_PRO) });

    const action = await syncLicense(deps);

    expect(action?.kind).toBe("apply");
    expect(applyPro).toHaveBeenCalledWith("latag1.sig", null);
  });

  test("does nothing at all when nobody is signed in", async () => {
    const { deps, applyPro, clearPro } = makeDeps({ getSession: jest.fn(async () => null) });

    const action = await syncLicense(deps);

    expect(action).toBeNull();
    expect(applyPro).not.toHaveBeenCalled();
    expect(clearPro).not.toHaveBeenCalled();
    // Never call the network on behalf of a signed-out user.
    expect(deps.fetchServerLicense).not.toHaveBeenCalled();
  });

  test("a revoked grant clears Pro once both sources agree", async () => {
    const { deps, clearPro } = makeDeps({
      getRcStatus: jest.fn(async () => RC_NONE),
      fetchServerLicense: jest.fn(async () => SERVER_NONE),
      readCachedPro: jest.fn(() => true),
    });

    const action = await syncLicense(deps);

    expect(action?.kind).toBe("clear");
    expect(clearPro).toHaveBeenCalled();
  });

  test("an unreachable server never revokes a cached licence", async () => {
    const { deps, clearPro } = makeDeps({
      fetchServerLicense: jest.fn(async () => SERVER_ERROR),
      readCachedPro: jest.fn(() => true),
    });

    const action = await syncLicense(deps);

    expect(action?.kind).toBe("keep");
    expect(clearPro).not.toHaveBeenCalled();
  });

  test("a already-Pro user is not re-applied redundantly on every foreground", async () => {
    // Cheap idempotence: applying the same receipt repeatedly is harmless, but
    // the sync should still report what it decided so callers can react.
    const { deps, applyPro } = makeDeps({
      fetchServerLicense: jest.fn(async () => SERVER_PRO),
      readCachedPro: jest.fn(() => true),
    });

    const action = await syncLicense(deps);

    expect(action?.kind).toBe("apply");
    expect(applyPro).toHaveBeenCalledTimes(1);
  });

  /**
   * Runs on every foreground, so a throw here would surface as an unhandled
   * rejection in the root layout. It must swallow everything.
   */
  test("never throws when the session lookup fails", async () => {
    const { deps } = makeDeps({
      getSession: jest.fn(async () => {
        throw new Error("offline");
      }),
    });

    await expect(syncLicense(deps)).resolves.toBeNull();
  });

  test("never throws when the licence fetch fails", async () => {
    const { deps, clearPro } = makeDeps({
      fetchServerLicense: jest.fn(async () => {
        throw new Error("network down");
      }),
      readCachedPro: jest.fn(() => true),
    });

    await expect(syncLicense(deps)).resolves.toBeNull();
    expect(clearPro).not.toHaveBeenCalled();
  });

  test("never throws when RevenueCat blows up, and still consults the server", async () => {
    const { deps, applyPro } = makeDeps({
      getRcStatus: jest.fn(async () => {
        throw new Error("native module missing");
      }),
      fetchServerLicense: jest.fn(async () => SERVER_PRO),
    });

    const action = await syncLicense(deps);

    expect(action?.kind).toBe("apply");
    expect(applyPro).toHaveBeenCalled();
  });
});
