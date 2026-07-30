import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { PRO_MONTHLY, PRO_YEARLY, PRO_SKUS } from "@latag/licensing";
import { JsonLd } from "../components/JsonLd";
import {
  PRO_PRICE_PHP,
  organizationJsonLd,
  shopItemJsonLd,
  shopItemListJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "../lib/structured-data";

/**
 * Wave 3 Task 4 — structured data. `grep`-ing for "ld+json" across apps/web
 * returned nothing before this change. Each test below actually parses the
 * emitted `<script type="application/ld+json">` payload as JSON and checks
 * `@type` / required fields — a test that only greps for the string would
 * pass even if the JSON were malformed or the wrong shape.
 */

type ReactElementLike = { type: unknown; props: Record<string, unknown> } | null | undefined;

/** Walks a plain React-element tree (no react-dom) looking for `<JsonLd>` elements. */
function findJsonLdData(node: unknown): object[] {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") {
    return [];
  }
  if (Array.isArray(node)) return node.flatMap(findJsonLdData);
  const el = node as ReactElementLike;
  if (!el || typeof el !== "object") return [];
  const found: object[] = [];
  if (el.type === JsonLd) {
    found.push(el.props.data as object);
  }
  if (el.props && "children" in el.props) {
    found.push(...findJsonLdData(el.props.children));
  }
  return found;
}

// --- Pure JSON-LD builders -------------------------------------------------

describe("organizationJsonLd / websiteJsonLd", () => {
  test("Organization is valid, parseable JSON-LD with required fields", () => {
    const data = organizationJsonLd();
    const parsed = JSON.parse(JSON.stringify(data));
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@type"]).toBe("Organization");
    expect(typeof parsed.name).toBe("string");
    expect(parsed.url).toBe("https://latag.vercel.app");
  });

  test("WebSite is valid, parseable JSON-LD with required fields", () => {
    const data = websiteJsonLd();
    const parsed = JSON.parse(JSON.stringify(data));
    expect(parsed["@type"]).toBe("WebSite");
    expect(parsed.url).toBe("https://latag.vercel.app");
  });
});

describe("softwareApplicationJsonLd", () => {
  const data = softwareApplicationJsonLd() as {
    "@type": string;
    applicationCategory: string;
    operatingSystem: string;
    offers: { price: string; priceCurrency: string }[];
  };

  test("is valid, parseable JSON-LD", () => {
    expect(() => JSON.parse(JSON.stringify(data))).not.toThrow();
    expect(data["@type"]).toBe("SoftwareApplication");
  });

  test('applicationCategory is "BusinessApplication"', () => {
    expect(data.applicationCategory).toBe("BusinessApplication");
  });

  test("operatingSystem names Android only — iOS status is unresolved, never assert it", () => {
    expect(data.operatingSystem).toBe("Android");
    expect(JSON.stringify(data)).not.toMatch(/ios/i);
  });

  test("offers mirror the two REAL purchasable Pro SKUs, priced in PHP", () => {
    expect(data.offers).toHaveLength(2);
    for (const offer of data.offers) {
      expect(offer.priceCurrency).toBe("PHP");
    }
    const prices = data.offers.map((o) => o.price).sort();
    expect(prices).toEqual(["1799", "199"]);
  });

  test("PRO_PRICE_PHP keys are exactly the licensing package's purchasable SKUs", () => {
    expect(Object.keys(PRO_PRICE_PHP).sort()).toEqual([...PRO_SKUS].sort());
  });

  test("Monthly is ₱199 and Yearly is ₱1,799 — matching components/Pricing.tsx", () => {
    expect(PRO_PRICE_PHP[PRO_MONTHLY]).toBe(199);
    expect(PRO_PRICE_PHP[PRO_YEARLY]).toBe(1799);
  });

  /**
   * Cross-checks against the ACTUAL webhook source (not a copy of its
   * numbers) so a price edit in app/api/webhooks/revenuecat/route.ts that
   * isn't mirrored here fails this test rather than silently shipping a
   * landing page that disagrees with what RevenueCat actually bills.
   */
  test("prices match the real SKU_PRICES table in the RevenueCat webhook route", () => {
    const webhookSource = readFileSync(
      join(__dirname, "..", "app", "api", "webhooks", "revenuecat", "route.ts"),
      "utf8"
    );
    const monthlyMatch = webhookSource.match(/\[PRO_MONTHLY\]:\s*(\d+)/);
    const yearlyMatch = webhookSource.match(/\[PRO_YEARLY\]:\s*(\d+)/);
    expect(monthlyMatch, "SKU_PRICES[PRO_MONTHLY] not found in webhook route").not.toBeNull();
    expect(yearlyMatch, "SKU_PRICES[PRO_YEARLY] not found in webhook route").not.toBeNull();
    expect(PRO_PRICE_PHP[PRO_MONTHLY]).toBe(Number(monthlyMatch![1]));
    expect(PRO_PRICE_PHP[PRO_YEARLY]).toBe(Number(yearlyMatch![1]));
  });

  test("prices match the literal pesos shown in components/Pricing.tsx", () => {
    const pricingSource = readFileSync(join(__dirname, "..", "components", "Pricing.tsx"), "utf8");
    expect(pricingSource).toMatch(/₱199/);
    expect(pricingSource).toMatch(/₱1,799/);
  });

  test("mentions the 14-day free trial, matching components/Pricing.tsx", () => {
    const pricingSource = readFileSync(join(__dirname, "..", "components", "Pricing.tsx"), "utf8");
    expect(pricingSource).toMatch(/14-day free trial/i);
    expect(JSON.stringify(data)).toMatch(/14-day free trial/i);
  });
});

describe("shopItemListJsonLd", () => {
  const shop = { handle: "thriftlord", display_name: "Thrift Lord" };
  const items = [
    { code: "LT-AAAAA", brand: "Carhartt", name: "Detroit Jacket" },
    { code: "LT-BBBBB", brand: "Levi's", name: null },
  ] as never[];

  test("is valid, parseable ItemList JSON-LD with one ListItem per item, in order", () => {
    const data = shopItemListJsonLd(shop, items);
    const parsed = JSON.parse(JSON.stringify(data)) as {
      "@type": string;
      itemListElement: { "@type": string; position: number; url: string }[];
    };
    expect(parsed["@type"]).toBe("ItemList");
    expect(parsed.itemListElement).toHaveLength(2);
    expect(parsed.itemListElement[0]["@type"]).toBe("ListItem");
    expect(parsed.itemListElement[0].position).toBe(1);
    expect(parsed.itemListElement[0].url).toContain("/shop/thriftlord/LT-AAAAA");
    expect(parsed.itemListElement[1].position).toBe(2);
  });
});

describe("shopItemJsonLd", () => {
  const shop = { handle: "thriftlord" };

  test("an available item reports InStock availability", () => {
    const item = {
      code: "LT-AAAAA",
      brand: "Carhartt",
      name: "Detroit Jacket",
      department: "tops",
      price: 850,
      status: "available",
      photo_urls: ["https://cdn.example.com/a.jpg"],
      updated_at: "2026-07-01T00:00:00Z",
    } as never;
    const data = shopItemJsonLd(shop, item) as {
      "@type": string;
      offers: { "@type": string; price: string; priceCurrency: string; availability: string };
    };
    const parsed = JSON.parse(JSON.stringify(data));
    expect(parsed["@type"]).toBe("Product");
    expect(parsed.offers["@type"]).toBe("Offer");
    expect(parsed.offers.priceCurrency).toBe("PHP");
    expect(parsed.offers.price).toBe("850");
    expect(parsed.offers.availability).toBe("https://schema.org/InStock");
  });

  test("a sold item reports SoldOut availability, not InStock", () => {
    const item = {
      code: "LT-BBBBB",
      brand: "Levi's",
      name: null,
      department: "bottoms",
      price: 500,
      status: "sold",
      photo_urls: [],
      updated_at: "2026-07-01T00:00:00Z",
    } as never;
    const data = shopItemJsonLd(shop, item) as { offers: { availability: string } };
    expect(data.offers.availability).toBe("https://schema.org/SoldOut");
    expect(data.offers.availability).not.toBe("https://schema.org/InStock");
  });

  test("status is read from the item's real ShopItemStatus type, not invented", () => {
    // "available" | "sold" is the full union — see lib/supabase/types.ts.
    const typesSource = readFileSync(join(__dirname, "..", "lib", "supabase", "types.ts"), "utf8");
    expect(typesSource).toMatch(/ShopItemStatus\s*=\s*"available"\s*\|\s*"sold"/);
  });
});

// --- Wiring: the actual pages render these builders as <script type="application/ld+json"> ---

vi.mock("next/font/google", () => ({ Archivo: () => ({ variable: "font-archivo" }) }));

describe("app/layout.tsx renders Organization + WebSite JSON-LD", () => {
  test("emits both, each valid JSON with the expected @type", async () => {
    const { default: RootLayout } = await import("../app/layout");
    const tree = RootLayout({ children: "children" } as never);
    const jsonLdPayloads = findJsonLdData(tree);
    const types = jsonLdPayloads.map((d) => (d as { "@type": string })["@type"]).sort();
    expect(types).toEqual(["Organization", "WebSite"]);
    for (const payload of jsonLdPayloads) {
      expect(() => JSON.parse(JSON.stringify(payload))).not.toThrow();
    }
  });
});

describe("app/page.tsx renders SoftwareApplication JSON-LD", () => {
  test("emits a valid SoftwareApplication payload", async () => {
    const { default: Home } = await import("../app/page");
    const tree = Home();
    const jsonLdPayloads = findJsonLdData(tree);
    expect(jsonLdPayloads).toHaveLength(1);
    const parsed = JSON.parse(JSON.stringify(jsonLdPayloads[0])) as { "@type": string };
    expect(parsed["@type"]).toBe("SoftwareApplication");
  });
});

describe("JsonLd component", () => {
  test("serialises via JSON.stringify (not hand-concatenation) and escapes '<' for safe embedding", () => {
    const dangerous = { "@type": "Thing", name: "</script><script>alert(1)</script>" };
    const el = JsonLd({ data: dangerous }) as unknown as {
      props: { dangerouslySetInnerHTML: { __html: string } };
    };
    const html = el.props.dangerouslySetInnerHTML.__html;
    expect(html).not.toContain("</script>");
    expect(html).toContain("\\u003c/script>");
    // And it must still be the exact same data once unescaped + parsed.
    expect(JSON.parse(html.replace(/\\u003c/g, "<"))).toEqual(dangerous);
  });
});
