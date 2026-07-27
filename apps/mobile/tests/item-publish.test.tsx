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
// The upload/upsert/delete trio MUST be mocked here, not omitted: the publish
// toggle calls kickSync, whose drain reaches straight into these. Leaving them
// undefined made the drain throw, get swallowed as a failed attempt, and the
// tests pass while never exercising the sync the toggle exists to trigger.
jest.mock("../lib/shop-api", () => ({
  shopUrl: (h: string) => `https://latag.vercel.app/shop/${h}`,
  shopItemUrl: (h: string, c: string | null) =>
    c ? `https://latag.vercel.app/shop/${h}/${c.toUpperCase()}` : `https://latag.vercel.app/shop/${h}`,
  getMyShop: jest.fn(),
  cachedShop: jest.fn(async () => null),
  cacheShop: jest.fn(async () => {}),
  uploadItemPhotos: jest.fn(async () => ({ ok: true, data: [] as string[] })),
  upsertShopItem: jest.fn(async () => ({ ok: true, data: null })),
  deleteShopItem: jest.fn(async () => ({ ok: true, data: null })),
}));

import * as Clipboard from "expo-clipboard";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { entitlements, items, photos, publishQueue, sessions, type Item } from "../db/schema";
import { cachedShop, getMyShop, upsertShopItem, deleteShopItem, type ShopProfile } from "../lib/shop-api";
import { showSuccess } from "../lib/toast";
import { markSold } from "../lib/repo";
import ItemDetail from "../app/item/[id]/index";

const mockedGetMyShop = getMyShop as jest.MockedFunction<typeof getMyShop>;
const mockedCachedShop = cachedShop as jest.MockedFunction<typeof cachedShop>;
const mockedUpsert = upsertShopItem as jest.MockedFunction<typeof upsertShopItem>;
const mockedDeleteShopItem = deleteShopItem as jest.MockedFunction<typeof deleteShopItem>;

/** kickSync defers onto a microtask; let it run and settle. */
const flushSync = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

const PROFILE: ShopProfile = {
  handle: "naga-thrift",
  displayName: "Naga Thrift",
  bio: null,
  contactMessenger: "nagathrift",
  contactInstagram: null,
  contactEmail: null,
  showSold: false,
  isPublished: true,
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
  // clearAllMocks wipes calls but KEEPS implementations, so a test that stubs
  // a network failure would leak it into every test after it. Re-arm here.
  mockedUpsert.mockResolvedValue({ ok: true, data: null });
  mockedDeleteShopItem.mockResolvedValue({ ok: true, data: null });
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
    // The row is enqueued AND drained immediately (C1) — a row still sitting
    // here would mean the shop stays stale until the app is backgrounded.
    expect(mockedUpsert).toHaveBeenCalledTimes(1);
    expect(db.select().from(publishQueue).all()).toHaveLength(0);
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
    // "Removed from shop" must be true when it is shown, not eventually true.
    expect(mockedDeleteShopItem).toHaveBeenCalledWith("i1");
    expect(db.select().from(publishQueue).all()).toHaveLength(0);
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
    mockedDeleteShopItem.mockResolvedValue({ ok: false, reason: "network", message: "offline" });
    const t = await render();
    await press(t, "Published to shop");
    await flushSync();
    expect(item().publishedAt).toBeNull();
    // Offline: the removal survives in the queue so a later drain still runs it.
    expect(db.select().from(publishQueue).all()[0]).toMatchObject({ op: "delete", attempts: 1 });
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
  test("publishing actually syncs: the queue drains and the listing is pushed (C1)", async () => {
    setup({ pro: true, shop: true });
    const t = await render();
    await press(t, "Published to shop");
    await flushSync();
    expect(mockedUpsert).toHaveBeenCalledTimes(1);
    expect(mockedUpsert.mock.calls[0][0]).toMatchObject({ itemLocalId: "i1", status: "available", price: 850 });
    // Drained rows leave the queue; a lingering row means the shop is stale.
    expect(db.select().from(publishQueue).all()).toHaveLength(0);
  });

  test("unpublishing actually removes the live listing, not just the local flag (C1)", async () => {
    setup({ pro: true, shop: true, item: { shopCode: "LT-7K2Q9", publishedAt: new Date("2026-07-02T00:00:00Z") } });
    const t = await render();
    await press(t, "Published to shop");
    await flushSync();
    expect(mockedDeleteShopItem).toHaveBeenCalledWith("i1");
    expect(db.select().from(publishQueue).all()).toHaveLength(0);
  });

  test("a published item marked sold pushes status sold rather than vanishing silently", async () => {
    setup({ pro: true, shop: true, item: { shopCode: "LT-7K2Q9", publishedAt: new Date("2026-07-02T00:00:00Z") } });
    markSold(db, "i1", 700);
    await flushSync();
    expect(mockedUpsert).toHaveBeenCalled();
    expect(mockedUpsert.mock.calls.at(-1)![0]).toMatchObject({ itemLocalId: "i1", status: "sold" });
    expect(db.select().from(publishQueue).all()).toHaveLength(0);
  });
});

describe("The batch line", () => {
  test("an item logged inside a batch names it", async () => {
    setup({ pro: false, shop: false });
    const t = await render();
    expect(texts(t)).toContain("Batch");
    expect(texts(t)).toContain("Naga Run");
  });

  test("a loose item says No batch and edits through the batch-less composer", async () => {
    setup({ pro: false, shop: false, item: { sessionId: null } });
    const t = await render();
    expect(texts(t)).toContain("No batch");
    // No navigation affordance: the batch line is a plain row either way.
    expect(() => pressableByText(t, "No batch")).toThrow();
    await press(t, "Edit");
    expect(mockPush).toHaveBeenCalledWith("/item/new?item=i1");
  });

  test("a batched item still edits inside its batch", async () => {
    setup({ pro: false, shop: false });
    const t = await render();
    await press(t, "Edit");
    expect(mockPush).toHaveBeenCalledWith("/session/s1/add?item=i1");
  });
});
