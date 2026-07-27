import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("../db/client", () => {
  const { makeTestDb } = require("./helpers/testDb");
  return { db: makeTestDb().db };
});
// Synchronous stand-in: re-runs the query every render (fresh data, no liveness needed).
jest.mock("drizzle-orm/expo-sqlite", () => ({ useLiveQuery: (q: any) => ({ data: q.all() }) }));

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { id: "i1" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, replace: jest.fn(), back: mockBack, dismiss: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require("react");
    useEffect(() => cb(), [cb]);
  },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../lib/toast", () => ({ showError: jest.fn(), showSuccess: jest.fn() }));
jest.mock("../lib/media", () => ({ deleteFiles: jest.fn(async () => {}) }));
jest.mock("../lib/albums", () => ({ savePhotosToAlbum: jest.fn(async () => ({ ok: true, count: 1, album: "Latag" })) }));
jest.mock("../lib/ig-share", () => ({ shareToInstagram: jest.fn(async () => ({ step: "saved-opened" })) }));
// The network seam only. The pure link builders keep their real shape — the
// screen renders their output verbatim, so faking them would test nothing.
jest.mock("../lib/shop-api", () => ({
  shopUrl: (h: string) => `https://latag.vercel.app/shop/${h}`,
  shopItemUrl: (h: string, c: string | null) =>
    c ? `https://latag.vercel.app/shop/${h}/${c.toUpperCase()}` : `https://latag.vercel.app/shop/${h}`,
  getMyShop: jest.fn(),
  cachedShop: jest.fn(async () => null),
  cacheShop: jest.fn(async () => {}),
}));

import * as Clipboard from "expo-clipboard";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { entitlements, items, photos, publishQueue, sessions, type Item } from "../db/schema";
import { cachedShop, getMyShop, type ShopProfile } from "../lib/shop-api";
import { showSuccess } from "../lib/toast";
import ItemDetail from "../app/item/[id]/index";

const mockedGetMyShop = getMyShop as jest.MockedFunction<typeof getMyShop>;
const mockedCachedShop = cachedShop as jest.MockedFunction<typeof cachedShop>;

const PROFILE: ShopProfile = {
  handle: "naga-thrift",
  displayName: "Naga Thrift",
  bio: null,
  contactMessenger: "nagathrift",
  contactInstagram: null,
  contactEmail: null,
  showSold: false,
};

let tree: ReactTestRenderer | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  db.delete(publishQueue).run();
  db.delete(photos).run();
  db.delete(items).run();
  db.delete(sessions).run();
  db.delete(entitlements).run();
  db.insert(sessions).values({ id: "s1", name: "Naga Run", type: "bulto", totalBaleCost: 1000, createdAt: new Date() }).run();
  mockParams = { id: "i1" };
  mockedGetMyShop.mockResolvedValue({ ok: true, data: null });
  mockedCachedShop.mockResolvedValue(null);
});

afterEach(() => {
  act(() => { tree?.unmount(); });
  tree = null;
});

function setup(opts: { pro: boolean; shop: boolean; item?: Partial<typeof items.$inferInsert> }): void {
  db.insert(entitlements).values({ id: 1, pro: opts.pro, logsUsed: 0 }).run();
  if (opts.shop) mockedGetMyShop.mockResolvedValue({ ok: true, data: PROFILE });
  db.insert(items).values({
    id: "i1", sessionId: "s1", brand: "Carhartt", name: "Detroit Jacket", department: "tops",
    category: "Jacket", condition: "9/10", individualCost: 120, targetSellPrice: 850,
    status: "available", createdAt: new Date("2026-07-01T00:00:00Z"), ...opts.item,
  }).run();
}

function item(): Item {
  return db.select().from(items).where(eq(items.id, "i1")).all()[0];
}

async function render(): Promise<ReactTestRenderer> {
  await act(async () => { tree = renderer.create(<ItemDetail />); });
  return tree!;
}

function collectTexts(node: any, out: string[] = []): string[] {
  for (const child of node.children ?? []) {
    if (typeof child === "string") out.push(child);
    else collectTexts(child, out);
  }
  return out;
}

/** Flattens every text node in render order. */
function texts(t: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (node == null) return;
    if (typeof node === "string") { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk((node as { children?: unknown }).children);
  };
  walk(t.toJSON());
  return out;
}

function pressableByText(t: ReactTestRenderer, label: string) {
  const hits = t.root.findAll((n) => typeof n.props?.onPress === "function" && collectTexts(n).includes(label));
  expect(hits.length).toBeGreaterThan(0);
  return hits[hits.length - 1];
}

async function press(t: ReactTestRenderer, label: string) {
  const target = pressableByText(t, label);
  await act(async () => { target.props.onPress(); });
}

function toggle(t: ReactTestRenderer) {
  // One switch on the screen, rendered as a composite plus its host views.
  const hits = t.root.findAll((n) => n.props?.accessibilityRole === "switch");
  expect(hits.length).toBeGreaterThan(0);
  return hits[hits.length - 1];
}

// ---------------------------------------------------------------------------

describe("Publish toggle — gated", () => {
  test("a free seller sees the row switched off with the way to earn it", async () => {
    setup({ pro: false, shop: false });
    const t = await render();
    const all = texts(t);
    expect(all).toContain("Published to shop");
    expect(all).toContain("Set up your shop to publish");
    expect(toggle(t).props.accessibilityState).toMatchObject({ checked: false });
  });

  test("tapping it sends the seller to the Shop tab instead of dead-ending", async () => {
    setup({ pro: false, shop: false });
    const t = await render();
    await press(t, "Published to shop");
    expect(mockNavigate).toHaveBeenCalledWith("/shop");
    expect(item().publishedAt).toBeNull();
    expect(db.select().from(publishQueue).all()).toHaveLength(0);
  });

  test("Pro without a shop yet is routed the same way — nothing publishes into nowhere", async () => {
    setup({ pro: true, shop: false });
    const t = await render();
    expect(texts(t)).toContain("Set up your shop to publish");
    await press(t, "Published to shop");
    expect(mockNavigate).toHaveBeenCalledWith("/shop");
    expect(item().publishedAt).toBeNull();
  });
});

describe("Publish toggle — Pro with a shop", () => {
  test("switching on mints a code, queues the upsert and says what happens next", async () => {
    setup({ pro: true, shop: true });
    const t = await render();
    await press(t, "Published to shop");

    const row = item();
    expect(row.publishedAt).toBeInstanceOf(Date);
    expect(row.shopCode).toMatch(/^LT-[A-Z2-9]{5}$/);
    const queue = db.select().from(publishQueue).all();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ itemId: "i1", op: "upsert" });
    expect(showSuccess).toHaveBeenCalledWith("Publishing — your shop updates shortly");
  });

  test("republishing reuses the code buyers already hold", async () => {
    setup({ pro: true, shop: true, item: { shopCode: "LT-7K2Q9", publishedAt: null } });
    const t = await render();
    await press(t, "Published to shop");
    expect(item().shopCode).toBe("LT-7K2Q9");
    expect(item().publishedAt).toBeInstanceOf(Date);
  });

  test("switching off queues the removal but keeps the code forever", async () => {
    setup({ pro: true, shop: true, item: { shopCode: "LT-7K2Q9", publishedAt: new Date("2026-07-02T00:00:00Z") } });
    const t = await render();
    expect(toggle(t).props.accessibilityState).toMatchObject({ checked: true });
    await press(t, "Published to shop");

    const row = item();
    expect(row.publishedAt).toBeNull();
    expect(row.shopCode).toBe("LT-7K2Q9");
    const queue = db.select().from(publishQueue).all();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ itemId: "i1", op: "delete" });
    expect(showSuccess).toHaveBeenCalledWith("Removed from shop");
  });

  test("a published item shows its code and copies its own public link", async () => {
    setup({ pro: true, shop: true, item: { shopCode: "LT-7K2Q9", publishedAt: new Date("2026-07-02T00:00:00Z") } });
    const t = await render();
    expect(texts(t)).toContain("LT-7K2Q9");
    await press(t, "Copy item link");
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("https://latag.vercel.app/shop/naga-thrift/LT-7K2Q9");
    expect(showSuccess).toHaveBeenCalledWith("Item link copied");
  });

  test("an unpublished item offers no code and no link to copy", async () => {
    setup({ pro: true, shop: true });
    const t = await render();
    expect(texts(t)).not.toContain("Copy item link");
  });

  test("an offline seller can still unpublish — the toggle answers to the item, not the network", async () => {
    setup({ pro: true, shop: false, item: { shopCode: "LT-7K2Q9", publishedAt: new Date("2026-07-02T00:00:00Z") } });
    mockedGetMyShop.mockResolvedValue({ ok: false, reason: "network", message: "offline" });
    const t = await render();
    await press(t, "Published to shop");
    expect(item().publishedAt).toBeNull();
    expect(db.select().from(publishQueue).all()[0]).toMatchObject({ op: "delete" });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("the last shop seen on this phone is enough to publish while offline", async () => {
    setup({ pro: true, shop: false });
    mockedGetMyShop.mockResolvedValue({ ok: false, reason: "network", message: "offline" });
    mockedCachedShop.mockResolvedValue(PROFILE);
    const t = await render();
    await press(t, "Published to shop");
    expect(item().publishedAt).toBeInstanceOf(Date);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
