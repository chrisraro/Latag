import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Claim-regression guard: Pro is a recurring subscription (₱199/month or
 * ₱1,799/year, 14-day free trial, billed by the App Store / Play Store via
 * RevenueCat — see packages/licensing/src/index.ts and
 * apps/web/app/api/webhooks/revenuecat/route.ts). It is NOT a one-time
 * purchase. That contradiction shipped once already (a "one-time unlock" claim
 * sitting directly above the subscription pricing widget, and a Terms of Use
 * that promised a "14 days of purchase" refund window that does not exist).
 * Apple and Google both require auto-renewal terms to be disclosed for
 * subscription apps, so a stale "one-time" claim is a store-policy problem as
 * well as a consumer-protection one.
 *
 * This test reads the actual page/component sources (not a hardcoded copy of
 * their text) so it cannot go stale — it fails the moment any of these files
 * reintroduces language describing Pro as a one-time purchase.
 */

const ROOT = path.resolve(__dirname, "..");

// Every marketing or legal surface that talks about Pro pricing/billing.
const SURFACES = [
  "app/page.tsx",
  "app/pro/page.tsx",
  "app/account/page.tsx",
  "app/terms/page.tsx",
  "app/privacy/page.tsx",
  "app/data/page.tsx",
  "components/Pricing.tsx",
  "components/RCBuyButton.tsx",
] as const;

const FORBIDDEN_PATTERNS: RegExp[] = [
  /one-time/i,
  /one time/i,
  /pay once/i,
  /no subscription/i,
];

function read(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("Pro billing claim regression guard", () => {
  for (const surface of SURFACES) {
    test(`${surface} does not describe Pro as a one-time purchase`, () => {
      const source = read(surface);
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(
          pattern.test(source),
          `${surface} matched forbidden pattern ${pattern} — Pro is a recurring subscription, not a one-time purchase`,
        ).toBe(false);
      }
    });
  }
});

/**
 * Version-claim regression guard: the landing page once asserted "version
 * 1.2.0" while apps/mobile/app.json pinned runtimeVersion to 1.1.0 (the
 * installed binary) — 1.2.0 was the next not-yet-built native version, so the
 * claim was unsupportable the moment it shipped and would keep going stale
 * with every native bump. The same sentence also implied Latag is
 * subscriber-only ("shipping to subscribers now"), but the app is free with a
 * paid storefront. Neither claim belongs on the landing page.
 */
describe("Version/availability claim regression guard", () => {
  test("app/page.tsx does not assert a specific app version number", () => {
    const source = read("app/page.tsx");
    expect(/\bv?\d+\.\d+\.\d+\b/.test(source)).toBe(false);
  });

  test("app/page.tsx does not imply the app is available only to subscribers", () => {
    const source = read("app/page.tsx");
    expect(/shipping to subscribers/i.test(source)).toBe(false);
  });
});
