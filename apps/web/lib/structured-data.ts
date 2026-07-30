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

/**
 * FAQPage structured data + the FAQ copy itself, kept in one place so the
 * JSON-LD search engines index and the prose humans read on `/faq` can never
 * drift apart — `app/faq/page.tsx` renders this exact array. The pricing
 * answer is built from `PRO_PRICE_PHP` / `PRO_TRIAL_DAYS` above (themselves
 * kept in lockstep with the licensing package and the RevenueCat webhook by
 * `tests/structured-data.test.ts`) rather than a second hardcoded copy of the
 * price, so a SKU change updates the FAQ instead of leaving it stale.
 */
export type FaqEntry = { question: string; answer: string };

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    question: "What is Latag?",
    answer:
      "Latag is an offline inventory and pricing app for secondhand (“ukay”) clothing resellers. It " +
      "tracks every item you own — tops, bottoms, dresses, footwear, bags, accessories — in one " +
      "searchable inventory, and lets Pro subscribers publish pieces to their own public shop page.",
  },
  {
    question: "Who is Latag for?",
    answer:
      "Resellers who source and resell secondhand clothing — the app ships with 469 Philippine ukay " +
      "brands built in, searchable offline, and prices everything in PHP.",
  },
  {
    question: "What does Latag cost?",
    answer:
      `Logging inventory is free, unlimited, forever — no item cap, no trial clock. Latag Pro, which ` +
      `unlocks your public shop page, is a subscription at ₱${PRO_PRICE_PHP[PRO_MONTHLY]}/month or ` +
      `₱${PRO_PRICE_PHP[PRO_YEARLY].toLocaleString("en-PH")}/year, with a ${PRO_TRIAL_DAYS}-day free trial. ` +
      `Pro is billed through Google Play (Latag is Android-only for now) and can be cancelled anytime from ` +
      `your Play Store subscription settings.`,
  },
  {
    question: "Does Latag work offline?",
    answer:
      "Yes — Latag works fully offline. Logging items, batches, costs and photos makes zero network calls; " +
      "flip on airplane mode and inventory still works. Publishing an item to your shop is the one feature " +
      "that needs a connection, because that's the moment something leaves your phone.",
  },
  {
    question: "What happens to my data if I lose, wipe or replace my phone?",
    answer:
      "Your inventory lives only on your device, so a lost or wiped phone can't be recovered by us — we " +
      "never had a copy. Two features soften that: Export backup (Settings) writes your sessions, items and " +
      "brands to a file you can carry to a new phone, and Restore from your shop (Shop tab) pulls your " +
      "published listings — brand, price, condition, code and photos — back from your shop after a wipe " +
      "or reinstall. Cost and profit are never recoverable that way, because they were never uploaded in the " +
      "first place.",
  },
  {
    question: "What's free and what's Pro?",
    answer:
      "Free: unlimited item logging, unlimited batches, photos and dashboards, one-tap IG Drop export, and " +
      "it all works offline. Pro adds your own public shop page, so buyers can browse your pieces and message " +
      "you with the item already identified.",
  },
];

/** FAQPage structured data for `/faq`, built from `FAQ_ENTRIES`. */
export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ENTRIES.map((e) => ({
      "@type": "Question",
      name: e.question,
      acceptedAnswer: { "@type": "Answer", text: e.answer },
    })),
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
