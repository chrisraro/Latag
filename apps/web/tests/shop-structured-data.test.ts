import { describe, expect, test, vi, beforeEach } from "vitest";
import { JsonLd } from "../components/JsonLd";

/**
 * Wave 3 Task 4 — the storefront pages must actually render the ItemList /
 * Product JSON-LD this task adds, not just define builder functions nobody
 * calls. These tests import the real page modules (as account-page.test.ts
 * and license-route.test.ts already do) and mock only the Supabase-backed
 * query layer, then walk the returned React-element tree for `<JsonLd>`.
 *
 * The mock reads mutable outer variables at call time (the same shape
 * account-page.test.ts uses for its Supabase mocks) rather than
 * `vi.fn().mockResolvedValue(...)`, so it stays correct regardless of when
 * the mock factory itself runs relative to each test's setup.
 */

type ReactElementLike = { type: unknown; props: Record<string, unknown> } | null | undefined;

function findJsonLdData(node: unknown): object[] {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") {
    return [];
  }
  if (Array.isArray(node)) return node.flatMap(findJsonLdData);
  const el = node as ReactElementLike;
  if (!el || typeof el !== "object") return [];
  const found: object[] = [];
  if (el.type === JsonLd) found.push(el.props.data as object);
  if (el.props && "children" in el.props) found.push(...findJsonLdData(el.props.children));
  return found;
}

const shop = {
  id: "shop-1",
  handle: "thriftlord",
  display_name: "Thrift Lord",
  bio: "Curated pieces, weekly drops.",
  contact_messenger: "thriftlord",
  contact_instagram: null,
  contact_email: null,
};

type MockShopItem = {
  code: string;
  brand: string;
  name: string | null;
  department: string;
  category: string;
  condition: string;
  specs: never[];
  price: number;
  status: "available" | "sold";
  photo_urls: string[];
  updated_at: string;
};

const availableItem: MockShopItem = {
  code: "LT-AAAAA",
  brand: "Carhartt",
  name: "Detroit Jacket",
  department: "tops",
  category: "Jacket",
  condition: "9/10",
  specs: [],
  price: 850,
  status: "available",
  photo_urls: ["https://cdn.example.com/a.jpg"],
  updated_at: "2026-07-01T00:00:00Z",
};

const soldItem: MockShopItem = {
  ...availableItem,
  code: "LT-BBBBB",
  brand: "Levi's",
  name: null,
  status: "sold",
};

let shopWithItems: { shop: typeof shop; items: MockShopItem[] } | null = null;
let singleShop: typeof shop | null = null;
let singleItem: MockShopItem | null = null;

vi.mock("../lib/shop-queries", () => ({
  getShopWithItems: async (_handle: string) => shopWithItems,
  getShop: async (_handle: string) => singleShop,
  getShopItem: async (_shopId: string, _code: string) => singleItem,
}));

beforeEach(() => {
  shopWithItems = null;
  singleShop = null;
  singleItem = null;
});

describe("app/shop/[handle]/page.tsx renders ItemList JSON-LD", () => {
  test("one ListItem per storefront item", async () => {
    shopWithItems = { shop, items: [availableItem, soldItem] };
    const { default: ShopPage } = await import("../app/shop/[handle]/page");
    const tree = await ShopPage({ params: Promise.resolve({ handle: "thriftlord" }) });
    const jsonLdPayloads = findJsonLdData(tree);
    expect(jsonLdPayloads).toHaveLength(1);
    const parsed = JSON.parse(JSON.stringify(jsonLdPayloads[0])) as {
      "@type": string;
      itemListElement: unknown[];
    };
    expect(parsed["@type"]).toBe("ItemList");
    expect(parsed.itemListElement).toHaveLength(2);
  });
});

describe("app/shop/[handle]/[item]/page.tsx renders Product JSON-LD", () => {
  test("an available item's Offer reports InStock and the real price", async () => {
    singleShop = shop;
    singleItem = availableItem;
    const { default: ItemPage } = await import("../app/shop/[handle]/[item]/page");
    const tree = await ItemPage({ params: Promise.resolve({ handle: "thriftlord", item: "LT-AAAAA" }) });
    const jsonLdPayloads = findJsonLdData(tree);
    expect(jsonLdPayloads).toHaveLength(1);
    const parsed = JSON.parse(JSON.stringify(jsonLdPayloads[0])) as {
      "@type": string;
      offers: { availability: string; price: string; priceCurrency: string };
    };
    expect(parsed["@type"]).toBe("Product");
    expect(parsed.offers.priceCurrency).toBe("PHP");
    expect(parsed.offers.price).toBe("850");
    expect(parsed.offers.availability).toBe("https://schema.org/InStock");
  });

  test("a sold item's Offer reports SoldOut, derived from the item's real status", async () => {
    singleShop = shop;
    singleItem = soldItem;
    const { default: ItemPage } = await import("../app/shop/[handle]/[item]/page");
    const tree = await ItemPage({ params: Promise.resolve({ handle: "thriftlord", item: "LT-BBBBB" }) });
    const jsonLdPayloads = findJsonLdData(tree);
    const parsed = jsonLdPayloads[0] as { offers: { availability: string } };
    expect(parsed.offers.availability).toBe("https://schema.org/SoldOut");
  });
});
