import { describe, expect, test } from "vitest";
import {
  PRO_SKUS,
  ENTITLING_SKUS,
  PRO_COMP,
  PRO_LIFETIME,
  isEntitlingSku,
  normalizeRcProductId,
} from "@latag/licensing";

/**
 * The SKU policy is the shared source of truth for "does this row grant Pro?".
 * Two distinct questions live here and must not be conflated:
 *   - PRO_SKUS      → what a customer can *buy* (drives pricing + RC products)
 *   - ENTITLING_SKUS → what *unlocks Pro* (buyable SKUs + comps + grandfathered)
 */
describe("entitling SKUs", () => {
  test("every purchasable Pro SKU entitles", () => {
    for (const sku of PRO_SKUS) {
      expect(isEntitlingSku(sku)).toBe(true);
    }
  });

  test("the grandfathered lifetime SKU still entitles", () => {
    // A real row in production: granted 2026-07-27 by the admin console
    // before subscriptions existed. It must never silently stop working.
    expect(PRO_LIFETIME).toBe("latag-pro-lifetime");
    expect(isEntitlingSku(PRO_LIFETIME)).toBe(true);
  });

  test("the admin comp SKU entitles", () => {
    expect(isEntitlingSku(PRO_COMP)).toBe(true);
  });

  test("comps and legacy grants are NOT purchasable products", () => {
    // Keeps free comps out of pricing pages and revenue reporting.
    expect(PRO_SKUS).not.toContain(PRO_COMP);
    expect(PRO_SKUS).not.toContain(PRO_LIFETIME);
  });

  test("unrelated SKUs do not entitle", () => {
    expect(isEntitlingSku("latag-pro-bogus")).toBe(false);
    expect(isEntitlingSku("")).toBe(false);
    expect(isEntitlingSku(undefined)).toBe(false);
    expect(isEntitlingSku(null)).toBe(false);
  });

  test("ENTITLING_SKUS is exactly the buyable SKUs plus comp and lifetime", () => {
    expect([...ENTITLING_SKUS].sort()).toEqual(
      [...PRO_SKUS, PRO_COMP, PRO_LIFETIME].sort(),
    );
  });
});

/**
 * Store product identifiers use underscores (App Store / Play convention);
 * our database SKUs use hyphens. RevenueCat echoes the *store* id back to us
 * in webhooks, so it must be translated before it is written or priced.
 */
describe("normalizeRcProductId", () => {
  test("maps underscore store ids to hyphenated SKUs", () => {
    expect(normalizeRcProductId("latag_pro_monthly")).toBe("latag-pro-monthly");
    expect(normalizeRcProductId("latag_pro_yearly")).toBe("latag-pro-yearly");
  });

  test("passes through ids that are already hyphenated SKUs", () => {
    expect(normalizeRcProductId("latag-pro-monthly")).toBe("latag-pro-monthly");
    expect(normalizeRcProductId("latag-pro-yearly")).toBe("latag-pro-yearly");
  });

  test("strips Play Store base-plan suffixes", () => {
    // Android sends "<subscription-id>:<base-plan-id>" on some events.
    expect(normalizeRcProductId("latag_pro_yearly:p1y")).toBe("latag-pro-yearly");
  });

  test("returns null for anything it cannot map to a known SKU", () => {
    // Never guess — a wrong guess silently mis-prices a subscriber.
    expect(normalizeRcProductId("some_other_product")).toBeNull();
    expect(normalizeRcProductId(undefined)).toBeNull();
    expect(normalizeRcProductId("")).toBeNull();
  });
});
