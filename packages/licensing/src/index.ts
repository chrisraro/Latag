/** SKU identifiers for the Pro subscription plans. */
export const PRO_MONTHLY = "latag-pro-monthly" as const;
export const PRO_YEARLY = "latag-pro-yearly" as const;

/**
 * Comped Pro, issued by the admin console. Not purchasable — kept distinct
 * from the paid SKUs so free grants never pollute pricing or revenue figures.
 */
export const PRO_COMP = "latag-pro-comp" as const;

/**
 * The original one-off Pro SKU, sold before the subscription model. No longer
 * purchasable, but existing rows must keep unlocking Pro forever.
 */
export const PRO_LIFETIME = "latag-pro-lifetime" as const;

/** Purchasable Pro SKUs — drives pricing rows and store products. */
export const PRO_SKUS: [string, string] = [PRO_MONTHLY, PRO_YEARLY];

/**
 * Every SKU that unlocks Pro: what you can buy, plus comps and grandfathered
 * grants. License lookups and "is this user Pro?" checks MUST use this, not
 * `PRO_SKUS` — filtering on the purchasable list alone silently locks out
 * comped and legacy users.
 */
export const ENTITLING_SKUS: readonly string[] = [
  PRO_MONTHLY,
  PRO_YEARLY,
  PRO_COMP,
  PRO_LIFETIME,
];

/** Whether a license row's SKU grants Pro. */
export function isEntitlingSku(sku: string | null | undefined): boolean {
  return typeof sku === "string" && ENTITLING_SKUS.includes(sku);
}

export type Sku = typeof PRO_MONTHLY | typeof PRO_YEARLY;

/**
 * Store product identifiers use underscores (App Store / Play convention)
 * while our database SKUs use hyphens; Play additionally appends a base-plan
 * id as `<subscription-id>:<base-plan>`. RevenueCat echoes the *store* id in
 * webhook payloads, so it must be translated before it is stored or priced.
 *
 * Returns `null` when the id maps to no known SKU — callers must treat that as
 * "not a Pro product" rather than defaulting, since guessing a SKU mis-prices
 * the subscriber (a yearly plan booked as monthly).
 */
export function normalizeRcProductId(productId: string | null | undefined): string | null {
  if (typeof productId !== "string" || productId.length === 0) return null;
  const base = productId.split(":")[0].replace(/_/g, "-");
  return ENTITLING_SKUS.includes(base) ? base : null;
}
