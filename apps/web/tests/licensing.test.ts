import { describe, expect, test } from "vitest";
import { issueReceipt, verifyReceipt } from "../lib/licensing";

const SECRET = "test-secret";
const INPUT = { userId: "11111111-1111-1111-1111-111111111111", sku: "latag-pro-lifetime", grantedAt: "2026-07-14T00:00:00.000Z" };

// Cross-implementation golden vector: mobile Phase C re-implements verifyReceipt
// and must reproduce these EXACT wire bytes. If this test breaks, the receipt
// format changed and the mobile verifier must change with it.
const GOLDEN_RECEIPT =
  "latag1.eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJza3UiOiJsYXRhZy1wcm8tbGlmZXRpbWUiLCJncmFudGVkQXQiOiIyMDI2LTA3LTE0VDAwOjAwOjAwLjAwMFoifQ.USEjec7HJMx-HseI1RoagWOFJ2GMkGuIpzjENbZALME";

describe("licensing receipts", () => {
  test("matches the golden wire-format vector (cross-app contract)", () => {
    const r = issueReceipt(INPUT, SECRET);
    expect(r).toBe(GOLDEN_RECEIPT);
    // base64url strictly: no padding, no '+' or '/'
    expect(r).not.toMatch(/[=+/]/);
    expect(verifyReceipt(GOLDEN_RECEIPT, SECRET)).toEqual({ valid: true, ...INPUT });
  });
  test("round-trips a valid receipt", () => {
    const r = issueReceipt(INPUT, SECRET);
    expect(r.startsWith("latag1.")).toBe(true);
    expect(verifyReceipt(r, SECRET)).toEqual({ valid: true, ...INPUT });
  });
  test("rejects tampered payload", () => {
    const r = issueReceipt(INPUT, SECRET);
    const [v, p, s] = r.split(".");
    const forged = Buffer.from(JSON.stringify({ ...INPUT, sku: "everything-free" })).toString("base64url");
    expect(verifyReceipt([v, forged, s].join("."), SECRET)).toEqual({ valid: false });
  });
  test("rejects wrong secret, wrong version, garbage", () => {
    const r = issueReceipt(INPUT, SECRET);
    expect(verifyReceipt(r, "other-secret")).toEqual({ valid: false });
    expect(verifyReceipt(r.replace("latag1.", "latag2."), SECRET)).toEqual({ valid: false });
    expect(verifyReceipt("not-a-receipt", SECRET)).toEqual({ valid: false });
    expect(verifyReceipt("", SECRET)).toEqual({ valid: false });
  });
});
