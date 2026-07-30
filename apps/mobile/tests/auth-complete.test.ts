import { completeSignIn } from "../lib/auth-complete";
import { supabase } from "../lib/supabase";
import { fetchLicense } from "../lib/license";
import { resolveLicenseAction } from "../lib/license-policy";
import { showSuccess, showError } from "../lib/toast";
import { restorePublishedItems } from "../lib/shop-restore";
import type { RestoreOutcome } from "../lib/shop-restore";

// ---------------------------------------------------------------------------
// Module boundaries. `completeSignIn` is a pure orchestrator over these
// seams — every test here fixes the license side of the flow (session found,
// server says "none", policy says "clear") and varies only the
// `RestoreOutcome` returned by `restorePublishedItems`, which is the thing
// this suite exists to cover.
// ---------------------------------------------------------------------------

jest.mock("../lib/supabase", () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

jest.mock("../db/client", () => {
  const { makeTestDb } = require("./helpers/testDb");
  return { db: makeTestDb().db };
});

jest.mock("../lib/license", () => ({
  fetchLicense: jest.fn(),
  applyLicense: jest.fn(),
  clearLicense: jest.fn(),
}));

jest.mock("../lib/entitlements", () => ({
  ensureEntitlements: jest.fn(() => ({ id: 1, pro: false, licenseReceipt: null })),
}));

jest.mock("../lib/purchases", () => ({
  isRevenueCatConfigured: jest.fn(() => false),
  loginRevenueCat: jest.fn(async () => {}),
  checkProStatus: jest.fn(async () => null),
}));

jest.mock("../lib/license-policy", () => ({
  resolveLicenseAction: jest.fn(),
}));

jest.mock("../lib/toast", () => ({
  showSuccess: jest.fn(),
  showError: jest.fn(),
}));

jest.mock("../lib/shop-restore", () => ({
  restorePublishedItems: jest.fn(),
}));

const mockedSupabase = supabase as unknown as { auth: { getSession: jest.Mock } };
const mockedFetchLicense = fetchLicense as jest.Mock;
const mockedResolveLicenseAction = resolveLicenseAction as jest.Mock;
const mockedRestorePublishedItems = restorePublishedItems as jest.Mock;
const mockedShowSuccess = showSuccess as jest.Mock;
const mockedShowError = showError as jest.Mock;

function signedIn() {
  mockedSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: "user-1" }, access_token: "tok-1" } },
    error: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  signedIn();
  // Fixed, uninteresting license outcome for every test in this file — the
  // license branch has its own coverage in license-policy.test.ts. Here it
  // just needs to be deterministic so the restore-branch assertions aren't
  // muddied by an unrelated toast.
  mockedFetchLicense.mockResolvedValue({ kind: "none" });
  mockedResolveLicenseAction.mockReturnValue({
    kind: "clear",
    message: "No Pro subscription on this account",
  });
});

describe("completeSignIn — restore outcome handling", () => {
  // Binding constraint #1: a successful restore of zero items is not news to
  // the user (empty shop, no shop, or already-restored) and must stay silent.
  test("a successful restore of zero items stays silent: no showError, no restore toast", async () => {
    mockedRestorePublishedItems.mockResolvedValue({
      ok: true,
      restored: 0,
      skipped: 0,
    } satisfies RestoreOutcome);

    const result = await completeSignIn();

    expect(result).toBe(true);
    expect(mockedShowError).not.toHaveBeenCalled();
    // The license-flow toast still fires — only the *restore* toast must be
    // absent. Filtering by content, rather than asserting a call count of 1,
    // keeps this robust to unrelated toasts elsewhere in the flow.
    const restoreToasts = mockedShowSuccess.mock.calls.filter(
      ([msg]) => typeof msg === "string" && msg.includes("Restored"),
    );
    expect(restoreToasts).toHaveLength(0);
  });

  // Binding constraint #2: a genuine failure must surface via showError, and
  // must never prevent sign-in from succeeding or throw out of completeSignIn.
  test("a genuine restore failure calls showError, and sign-in still succeeds", async () => {
    mockedRestorePublishedItems.mockResolvedValue({
      ok: false,
      reason: "items-fetch-failed",
      message: "Couldn't fetch your shop listings — try again",
    } satisfies RestoreOutcome);

    const result = await completeSignIn();

    expect(result).toBe(true);
    expect(mockedShowError).toHaveBeenCalledWith("Couldn't fetch your shop listings — try again");
  });

  // A successful restore that actually recovered listings is news, and must
  // name the count so the user knows what to check.
  test("a successful restore with items raises a success toast naming the count", async () => {
    mockedRestorePublishedItems.mockResolvedValue({
      ok: true,
      restored: 2,
      skipped: 0,
    } satisfies RestoreOutcome);

    const result = await completeSignIn();

    expect(result).toBe(true);
    expect(mockedShowError).not.toHaveBeenCalled();
    expect(mockedShowSuccess).toHaveBeenCalledWith(
      "Restored 2 published listings — check your Shop tab",
    );
  });

  test("never throws even if restorePublishedItems rejects", async () => {
    mockedRestorePublishedItems.mockRejectedValue(new Error("unexpected"));

    await expect(completeSignIn()).resolves.toBe(true);
    expect(mockedShowError).not.toHaveBeenCalled();
  });
});
