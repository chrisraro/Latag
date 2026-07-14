import { expect, test } from "vitest";
import { isAdminEmail } from "../lib/admin-gate";

test("matches case-insensitively with whitespace and multiple entries", () => {
  expect(isAdminEmail("Owner@Example.com", " owner@example.com , second@x.ph ")).toBe(true);
  expect(isAdminEmail("second@x.ph", "owner@example.com,second@x.ph")).toBe(true);
});
test("denies non-members, empty env, null email", () => {
  expect(isAdminEmail("evil@x.ph", "owner@example.com")).toBe(false);
  expect(isAdminEmail("owner@example.com", "")).toBe(false);
  expect(isAdminEmail("owner@example.com", undefined)).toBe(false);
  expect(isAdminEmail(null, "owner@example.com")).toBe(false);
});
