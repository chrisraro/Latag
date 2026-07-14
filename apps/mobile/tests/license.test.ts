import { makeTestDb } from "./helpers/testDb";
import { ensureEntitlements, consumeLog, logsRemaining, FREE_LOG_LIMIT } from "../lib/entitlements";
import { applyLicense, clearLicense, fetchLicense } from "../lib/license";

describe("applyLicense", () => {
  test("sets pro + receipt on the entitlements row, and consumeLog returns Infinity after", () => {
    const { db } = makeTestDb();
    ensureEntitlements(db);
    applyLicense(db, { receipt: "latag1.abc.def" });

    const e = ensureEntitlements(db);
    expect(e.pro).toBe(true);
    expect(e.licenseReceipt).toBe("latag1.abc.def");
    expect(consumeLog(db)).toBe(Infinity);
  });

  test("is idempotent when called twice with the same receipt", () => {
    const { db } = makeTestDb();
    ensureEntitlements(db);
    applyLicense(db, { receipt: "latag1.abc.def" });
    applyLicense(db, { receipt: "latag1.abc.def" });

    const e = ensureEntitlements(db);
    expect(e.pro).toBe(true);
    expect(e.licenseReceipt).toBe("latag1.abc.def");
  });

  test("works even if ensureEntitlements was never called first (applies its own insert)", () => {
    const { db } = makeTestDb();
    applyLicense(db, { receipt: "latag1.xyz.123" });

    const e = ensureEntitlements(db);
    expect(e.pro).toBe(true);
    expect(e.licenseReceipt).toBe("latag1.xyz.123");
  });
});

describe("clearLicense", () => {
  test("flips pro back to free and nulls the receipt, leaving logsUsed untouched", () => {
    const { db } = makeTestDb();
    ensureEntitlements(db);
    // Consume 3 logs as a free user first.
    consumeLog(db);
    consumeLog(db);
    consumeLog(db);

    applyLicense(db, { receipt: "latag1.abc.def" });
    clearLicense(db);

    const e = ensureEntitlements(db);
    expect(e.pro).toBe(false);
    expect(e.licenseReceipt).toBeNull();
    // The free counter resumes from the logsUsed count accrued before applyLicense.
    expect(logsRemaining(e)).toBe(FREE_LOG_LIMIT - 3);
    expect(logsRemaining(e)).toBe(17);
  });
});

describe("fetchLicense", () => {
  function mockFetch(status: number, body: unknown) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const impl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return {
        status,
        json: async () => body,
      } as Response;
    };
    return { impl, calls };
  }

  test("200 with active status and non-empty receipt -> pro", async () => {
    const { impl } = mockFetch(200, { license: { status: "active" }, receipt: "latag1.abc.def" });
    const result = await fetchLicense("token-123", impl as unknown as typeof fetch);
    expect(result).toEqual({ kind: "pro", receipt: "latag1.abc.def" });
  });

  test("200 with non-active status -> error (defensive, should never happen per API contract)", async () => {
    const { impl } = mockFetch(200, { license: { status: "revoked" }, receipt: "latag1.abc.def" });
    const result = await fetchLicense("token-123", impl as unknown as typeof fetch);
    expect(result).toEqual({ kind: "error" });
  });

  test("200 with missing receipt -> error", async () => {
    const { impl } = mockFetch(200, { license: { status: "active" } });
    const result = await fetchLicense("token-123", impl as unknown as typeof fetch);
    expect(result).toEqual({ kind: "error" });
  });

  test("200 with empty-string receipt -> error", async () => {
    const { impl } = mockFetch(200, { license: { status: "active" }, receipt: "" });
    const result = await fetchLicense("token-123", impl as unknown as typeof fetch);
    expect(result).toEqual({ kind: "error" });
  });

  test("200 with malformed body (no license object) -> error", async () => {
    const { impl } = mockFetch(200, { receipt: "latag1.abc.def" });
    const result = await fetchLicense("token-123", impl as unknown as typeof fetch);
    expect(result).toEqual({ kind: "error" });
  });

  test("404 -> none", async () => {
    const { impl } = mockFetch(404, {});
    const result = await fetchLicense("token-123", impl as unknown as typeof fetch);
    expect(result).toEqual({ kind: "none" });
  });

  test("500 -> error", async () => {
    const { impl } = mockFetch(500, { error: "boom" });
    const result = await fetchLicense("token-123", impl as unknown as typeof fetch);
    expect(result).toEqual({ kind: "error" });
  });

  test("fetchImpl throws -> error, never propagates", async () => {
    const impl = async () => {
      throw new Error("network down");
    };
    await expect(fetchLicense("token-123", impl as unknown as typeof fetch)).resolves.toEqual({ kind: "error" });
  });

  test("requests the correct URL with a Bearer Authorization header", async () => {
    const { impl, calls } = mockFetch(200, { license: { status: "active" }, receipt: "latag1.abc.def" });
    await fetchLicense("token-abc-123", impl as unknown as typeof fetch);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://latag.vercel.app/api/license");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-abc-123");
  });
});
