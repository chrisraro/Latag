import { describe, expect, test } from "vitest";
import { activeProUserIds } from "@/lib/pro-users";

/**
 * Drives the PRO / Free badge in the admin console. Getting this wrong is not
 * cosmetic: an admin looking at a comped user who reads "Free" will grant Pro
 * a second time, or assume the grant silently failed.
 */
describe("activeProUserIds", () => {
  test("counts an active subscription", () => {
    const ids = activeProUserIds([{ user_id: "u1", sku: "latag-pro-monthly", status: "active" }]);
    expect(ids.has("u1")).toBe(true);
  });

  test("counts a grandfathered lifetime grant", () => {
    const ids = activeProUserIds([{ user_id: "u1", sku: "latag-pro-lifetime", status: "active" }]);
    expect(ids.has("u1")).toBe(true);
  });

  test("counts an admin comp", () => {
    const ids = activeProUserIds([{ user_id: "u1", sku: "latag-pro-comp", status: "active" }]);
    expect(ids.has("u1")).toBe(true);
  });

  test("counts past_due as still Pro during the grace period", () => {
    const ids = activeProUserIds([{ user_id: "u1", sku: "latag-pro-monthly", status: "past_due" }]);
    expect(ids.has("u1")).toBe(true);
  });

  test("ignores revoked and expired rows", () => {
    const ids = activeProUserIds([
      { user_id: "u1", sku: "latag-pro-monthly", status: "revoked" },
      { user_id: "u2", sku: "latag-pro-comp", status: "expired" },
    ]);
    expect(ids.has("u1")).toBe(false);
    expect(ids.has("u2")).toBe(false);
  });

  test("ignores rows whose SKU does not grant Pro", () => {
    const ids = activeProUserIds([{ user_id: "u1", sku: "latag-something-else", status: "active" }]);
    expect(ids.has("u1")).toBe(false);
  });

  test("a revoked row does not cancel out a separate active grant", () => {
    const ids = activeProUserIds([
      { user_id: "u1", sku: "latag-pro-monthly", status: "revoked" },
      { user_id: "u1", sku: "latag-pro-comp", status: "active" },
    ]);
    expect(ids.has("u1")).toBe(true);
  });

  test("handles an empty table", () => {
    expect(activeProUserIds([]).size).toBe(0);
  });
});
