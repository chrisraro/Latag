import { PRO_MONTHLY, PRO_YEARLY } from "@latag/licensing";
import { SITE_URL, itemUrl, shopUrl } from "./inquiry";
import { departmentLabel, itemPhotoUrls, itemTitle, type ShopHeader, type ShopItem } from "./shop-format";

/**
 * Peso prices for the two purchasable Pro SKUs, exactly mirroring `SKU_PRICES`
 * in `app/api/webhooks/revenuecat/route.ts` and the figures
 * `components/Pricing.tsx` shows buyers. Structured data is a public claim
 * search engines index, so this is not re-derived or guessed — it is kept in
 * lockstep by `tests/structured-data.test.ts`, which reads all three sources
 * and fails the build the moment any one of them drifts from the others.
 */
export const PRO_PRICE_PHP: Record<string, number> = {
  [PRO_MONTHLY]: 199,
  [PRO_YEARLY]: 1799,
};

export const PRO_TRIAL_DAYS = 14;

/** Organization structured data for the root layout — one per site. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Latag",
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
  };
}

/** WebSite structured data for the root layout — one per site. */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Latag",
    url: SITE_URL,
  };
}

/**
 * SoftwareApplication structured data for the landing page.
 *
 * `operatingSystem` names Android only — Latag ships on Google Play and iOS
 * availability is unresolved (Wave 1 removed the iOS affordance), so
 * asserting iOS here would be an unsupportable public claim.
 */
export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Latag",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Android",
    url: SITE_URL,
    offers: [
      {
        "@type": "Offer",
        name: "Latag Pro — Monthly",
        price: String(PRO_PRICE_PHP[PRO_MONTHLY]),
        priceCurrency: "PHP",
        category: "subscription",
        description: `${PRO_TRIAL_DAYS}-day free trial, then ₱${PRO_PRICE_PHP[PRO_MONTHLY]}/month. Cancel anytime.`,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: String(PRO_PRICE_PHP[PRO_MONTHLY]),
          priceCurrency: "PHP",
          billingDuration: "P1M",
        },
      },
      {
        "@type": "Offer",
        name: "Latag Pro — Yearly",
        price: String(PRO_PRICE_PHP[PRO_YEARLY]),
        priceCurrency: "PHP",
        category: "subscription",
        description: `${PRO_TRIAL_DAYS}-day free trial, then ₱${PRO_PRICE_PHP[PRO_YEARLY]}/year. Cancel anytime.`,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: String(PRO_PRICE_PHP[PRO_YEARLY]),
          priceCurrency: "PHP",
          billingDuration: "P1Y",
        },
      },
    ],
  };
}

/** ItemList structured data for a storefront's item grid. */
export function shopItemListJsonLd(
  shop: Pick<ShopHeader, "handle" | "display_name">,
  items: ShopItem[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${shop.display_name} — Latag shop`,
    url: shopUrl(shop.handle),
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: itemUrl(shop.handle, item.code),
      name: itemTitle(item),
    })),
  };
}

/** schema.org ItemAvailability for a storefront item's real status. */
function availabilityFor(status: ShopItem["status"]): string {
  return status === "sold" ? "https://schema.org/SoldOut" : "https://schema.org/InStock";
}

/** Product + Offer structured data for a single storefront item page. */
export function shopItemJsonLd(shop: Pick<ShopHeader, "handle">, item: ShopItem) {
  const url = itemUrl(shop.handle, item.code);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: itemTitle(item),
    sku: item.code,
    category: departmentLabel(item.department),
    ...(itemPhotoUrls(item).length > 0 ? { image: itemPhotoUrls(item) } : {}),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "PHP",
      price: String(item.price),
      availability: availabilityFor(item.status),
      itemCondition: "https://schema.org/UsedCondition",
    },
  };
}
