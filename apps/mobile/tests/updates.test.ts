import { runUpdateCheck, versionLabel } from "../lib/updates";

const ok = { isAvailable: true };
const none = { isAvailable: false };

describe("runUpdateCheck", () => {
  test("dev builds skip entirely", async () => {
    const check = jest.fn();
    expect(await runUpdateCheck({ isDev: true, check, fetch: jest.fn() })).toBe("dev-skip");
    expect(check).not.toHaveBeenCalled();
  });
  test("no update available -> up-to-date, no fetch", async () => {
    const fetch = jest.fn();
    expect(await runUpdateCheck({ isDev: false, check: async () => none, fetch })).toBe("up-to-date");
    expect(fetch).not.toHaveBeenCalled();
  });
  test("update available and fetched -> ready", async () => {
    expect(await runUpdateCheck({ isDev: false, check: async () => ok, fetch: async () => ({ isNew: true }) })).toBe("ready");
  });
  test("available but fetch returns stale -> ready (already-downloaded update still pending restart)", async () => {
    expect(await runUpdateCheck({ isDev: false, check: async () => ok, fetch: async () => ({ isNew: false }) })).toBe("ready");
  });
  test("check throws (offline) -> error, never rejects", async () => {
    expect(await runUpdateCheck({ isDev: false, check: async () => { throw new Error("net"); }, fetch: jest.fn() })).toBe("error");
  });
  test("fetch throws -> error", async () => {
    expect(await runUpdateCheck({ isDev: false, check: async () => ok, fetch: async () => { throw new Error("net"); } })).toBe("error");
  });
});

describe("versionLabel", () => {
  test("version with update id -> 'v1.0.0 · a1b2c3d4'", () => {
    expect(versionLabel("1.0.0", "a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe("v1.0.0 · a1b2c3d4");
  });
  test("embedded build (no update id) -> 'v1.0.0 · embedded'", () => {
    expect(versionLabel("1.0.0", null)).toBe("v1.0.0 · embedded");
  });
});
