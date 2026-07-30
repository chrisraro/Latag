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

/**
 * Wave 3 whole-wave review, I2 (IMPORTANT): the site told AI assistants and
 * buyers there is no iOS release (public/llms.txt, this component) while
 * simultaneously telling users to cancel a subscription "via your Apple ID"
 * and request refunds "through the App Store" (app/terms/page.tsx), and
 * privacy/data described payment as processed by "the App Store or Play
 * Store". Those three surfaces are fixed to be Android-truthful the same way
 * this component already is — this extends the same regression guard to
 * cover them.
 */
const PAYMENT_CLAIM_SURFACES = [
  "app/terms/page.tsx",
  "app/privacy/page.tsx",
  "app/data/page.tsx",
] as const;

describe("Payment-handler copy regression guard (terms/privacy/data)", () => {
  for (const surface of PAYMENT_CLAIM_SURFACES) {
    const source = readFileSync(join(__dirname, "..", surface), "utf8");

    test(`${surface} does not mention Apple or the App Store as a payment/cancellation/refund path`, () => {
      expect(source).not.toMatch(/apple/i);
      expect(source).not.toMatch(/app store/i);
    });

    test(`${surface} names Google Play as the payment handler`, () => {
      expect(source).toMatch(/google play/i);
    });
  }
});
