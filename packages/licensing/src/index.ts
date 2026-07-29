/** SKU identifiers for the Pro subscription plans. */
export const PRO_MONTHLY = "latag-pro-monthly" as const;
export const PRO_YEARLY = "latag-pro-yearly" as const;

/** All Pro SKUs — use this for `.in("sku", PRO_SKUS)` queries. */
export const PRO_SKUS: [string, string] = [PRO_MONTHLY, PRO_YEARLY];

export type Sku = typeof PRO_MONTHLY | typeof PRO_YEARLY;
