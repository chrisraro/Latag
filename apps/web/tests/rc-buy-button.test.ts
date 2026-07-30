import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Wave 3, Task 6, item 4: RCBuyButton.tsx said "Apple & Google handle the
 * payment" directly above a Google-Play-only button — Latag has no App Store
 * listing (per its own comment block and structured-data.ts's
 * `operatingSystem: "Android"`). The copy must describe Android-only reality
 * without deleting the concept of a second store, so adding iOS later stays
 * a small edit.
 */

const SOURCE = readFileSync(join(__dirname, "..", "components", "RCBuyButton.tsx"), "utf8");

describe("RCBuyButton payment-handler copy regression guard", () => {
  test("does not claim Apple handles payment above a Google-Play-only button", () => {
    expect(SOURCE).not.toMatch(/Apple\s*&\s*Google handle the payment/i);
  });

  test("names Google Play as the actual payment handler", () => {
    expect(SOURCE).toMatch(/Google Play handles the payment/i);
  });

  test("only renders a Google Play link (no iOS/App Store link)", () => {
    expect(SOURCE).not.toMatch(/apps\.apple\.com/i);
    expect(SOURCE).toContain("play.google.com");
  });
});
