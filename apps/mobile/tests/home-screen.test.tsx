import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { RefreshControl } from "react-native";

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
const mockRouter = { push: mockPush, replace: jest.fn(), back: jest.fn(), dismiss: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  // Screens refresh on focus; in tests one mount is one focus.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require("react");
    useEffect(() => cb(), [cb]);
  },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../lib/toast", () => ({ showError: jest.fn(), showSuccess: jest.fn() }));
jest.mock("../lib/repo", () => ({
  startScheduledSession: jest.fn(() => ({ session: { id: "sch1" }, notificationIds: ["n1", "n2"] })),
}));
jest.mock("../lib/notifications", () => ({ cancelReminders: jest.fn(async () => {}) }));
// The network seam only. The pure helpers keep their real behaviour.
jest.mock("../lib/shop-api", () => ({
  SHOP_URL_PREFIX: "latag.vercel.app/shop/",
  shopUrl: (h: string) => `https://latag.vercel.app/shop/${h}`,
  shopUrlLabel: (h: string) => `latag.vercel.app/shop/${h}`,
  getMyShop: jest.fn(),
  cachedShop: jest.fn(async () => null),
  cacheShop: jest.fn(async () => {}),
}));

import * as Clipboard from "expo-clipboard";
import { db } from "../db/client";
import { entitlements, items, photos, publishQueue, sessions } from "../db/schema";
import { cachedShop, getMyShop, type ShopProfile } from "../lib/shop-api";
import { startScheduledSession } from "../lib/repo";
import { cancelReminders } from "../lib/notifications";
import { showSuccess } from "../lib/toast";
import HomeScreen from "../app/(tabs)/home";

const mockedGetMyShop = getMyShop as jest.MockedFunction<typeof getMyShop>;
const mockedCachedShop = cachedShop as jest.MockedFunction<typeof cachedShop>;

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const PROFILE: ShopProfile = {
  handle: "naga-thrift",
  displayName: "Naga Thrift",
  bio: null,
  contactMessenger: null,
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
  mockedGetMyShop.mockResolvedValue({ ok: true, data: null });
  mockedCachedShop.mockResolvedValue(null);
});

afterEach(() => {
  // Inside act: unmount runs effect cleanups (the countdown interval).
  act(() => { tree?.unmount(); });
  tree = null;
});

function setPro(pro: boolean): void {
  db.insert(entitlements).values({ id: 1, pro }).run();
}

function insertItem(over: Partial<typeof items.$inferInsert> = {}): void {
  db.insert(items).values({
    id: "i1", sessionId: "s1", brand: "Carhartt", name: null, department: "tops",
    category: "Jacket", condition: "9/10", individualCost: 0, targetSellPrice: 850,
    status: "available", createdAt: new Date("2026-07-01T00:00:00Z"), ...over,
  }).run();
}

function insertScheduled(over: Partial<typeof sessions.$inferInsert> = {}): void {
  db.insert(sessions).values({
    id: "sch1", name: "Baguio Weekend", type: "bulto", totalBaleCost: 0,
    scheduledAt: new Date(Date.now() + 120 * MIN + 5000), reminderOffsets: "[30]",
    createdAt: new Date(), ...over,
  }).run();
}

async function render(): Promise<ReactTestRenderer> {
  await act(async () => { tree = renderer.create(<HomeScreen />); });
  return tree!;
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

function collectTexts(node: any, out: string[] = []): string[] {
  for (const child of node.children ?? []) {
    if (typeof child === "string") out.push(child);
    else collectTexts(child, out);
  }
  return out;
}

/** Innermost pressable whose rendered text includes `label`. */
function pressableByText(t: ReactTestRenderer, label: string) {
  const hits = t.root.findAll(
    (n) => typeof n.props?.onPress === "function" && collectTexts(n).includes(label),
  );
  expect(hits.length).toBeGreaterThan(0);
  return hits[hits.length - 1];
}

async function press(t: ReactTestRenderer, label: string) {
  const target = pressableByText(t, label);
  await act(async () => { target.props.onPress(); });
}

async function pressLabelled(t: ReactTestRenderer, label: string) {
  const hits = t.root.findAll((n) => typeof n.props?.onPress === "function" && n.props?.accessibilityLabel === label);
  expect(hits.length).toBeGreaterThan(0);
  await act(async () => { hits[hits.length - 1].props.onPress(); });
}

/** Every accessibility label on the tree, in render order. A label is repeated
 *  once per wrapper (composite + host), so consecutive repeats collapse. */
function labels(t: ReactTestRenderer): string[] {
  const raw = t.root
    .findAll((n) => typeof n.props?.accessibilityLabel === "string")
    .map((n) => n.props.accessibilityLabel as string);
  return raw.filter((l, i) => l !== raw[i - 1]);
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

describe("Home — snapshot", () => {
  test("the four figures come from the seeded inventory", async () => {
    setPro(false);
    insertItem({ id: "a1", targetSellPrice: 700 });
    insertItem({ id: "a2", targetSellPrice: 500 });
    insertItem({ id: "s2", status: "sold", targetSellPrice: 900, soldPrice: 900, individualCost: 250, soldAt: new Date(Date.now() - 2 * DAY) });
    const t = await render();
    const all = labels(t);
    expect(all).toContain("Stock value: ₱1,200");
    expect(all).toContain("Items available: 2");
    expect(all).toContain("Sold this week: 1");
    expect(all).toContain("Profit this month: ₱650");
  });

  test("an empty inventory reads as zeroes, never a blank card", async () => {
    setPro(false);
    const t = await render();
    const all = labels(t);
    expect(all).toContain("Stock value: ₱0");
    expect(all).toContain("Items available: 0");
    expect(all).toContain("Sold this week: 0");
    expect(all).toContain("Profit this month: ₱0");
  });

  test("the gear opens Settings from the header", async () => {
    setPro(false);
    const t = await render();
    expect(texts(t)).toContain("Latag");
    await pressLabelled(t, "Settings");
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });
});

// ---------------------------------------------------------------------------
// Next bale run
// ---------------------------------------------------------------------------

describe("Home — next bale run", () => {
  test("nothing scheduled renders no block at all", async () => {
    setPro(false);
    const t = await render();
    expect(texts(t)).not.toContain("Next bale run");
    expect(texts(t)).not.toContain("Start now");
  });

  test("the soonest future run shows with a countdown, stamp and pin", async () => {
    setPro(false);
    insertScheduled({ id: "sch-later", name: "Later Run", scheduledAt: new Date(Date.now() + 5 * DAY) });
    insertScheduled({ id: "sch-soon", name: "Sooner Run", scheduledAt: new Date(Date.now() + 30 * MIN + 5000), locationName: "SM Naga" });
    const t = await render();
    const all = texts(t);
    expect(all).toContain("Next bale run");
    expect(all).toContain("Sooner Run");
    expect(all).not.toContain("Later Run"); // one run, not a list
    expect(all).toContain("in 30m");
    expect(all).toContain("SM Naga");
    expect(all.some((x) => x.includes(" · ") && (x.includes("AM") || x.includes("PM")))).toBe(true);
  });

  test("a run already in the past is not the next one", async () => {
    setPro(false);
    insertScheduled({ id: "sch-past", name: "Missed Run", scheduledAt: new Date(Date.now() - 30 * MIN) });
    const t = await render();
    expect(texts(t)).not.toContain("Next bale run");
  });

  test("Start now converts the batch, cancels reminders, toasts and opens it", async () => {
    setPro(false);
    insertScheduled({ id: "sch1" });
    const t = await render();
    await press(t, "Start now");
    expect(startScheduledSession).toHaveBeenCalledWith(expect.anything(), "sch1");
    expect(cancelReminders).toHaveBeenCalledWith(["n1", "n2"]);
    expect(showSuccess).toHaveBeenCalledWith("Batch started");
    expect(mockPush).toHaveBeenCalledWith("/session/sch1");
  });
});

// ---------------------------------------------------------------------------
// Shop status
// ---------------------------------------------------------------------------

describe("Home — shop status", () => {
  test("a Free account sees the pitch instead of shop stats, and never hits the network", async () => {
    setPro(false);
    insertItem({ id: "i1", publishedAt: new Date(), shopCode: "LT-7K2Q9" });
    const t = await render();
    const all = texts(t);
    expect(all).toContain("Your own shop page");
    expect(all).toContain("Unlock with Pro");
    expect(all).not.toContain("1 published");
    expect(mockedGetMyShop).not.toHaveBeenCalled();
  });

  test("Unlock with Pro opens the Pro sheet rather than dead-ending", async () => {
    setPro(false);
    const t = await render();
    expect(texts(t)).not.toContain("This one needs Latag Pro");
    await press(t, "Unlock with Pro");
    expect(texts(t)).toContain("This one needs Latag Pro");
  });

  test("Pro with a live shop shows the link, the count and a copy action", async () => {
    setPro(true);
    mockedGetMyShop.mockResolvedValue({ ok: true, data: PROFILE });
    insertItem({ id: "i1", publishedAt: new Date(), shopCode: "LT-7K2Q9" });
    insertItem({ id: "i2", publishedAt: new Date(), shopCode: "LT-A2B3C" });
    const t = await render();
    const all = texts(t);
    expect(all).toContain("Naga Thrift");
    expect(all).toContain("latag.vercel.app/shop/naga-thrift");
    expect(all).toContain("2 published");
    await press(t, "Copy link");
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("https://latag.vercel.app/shop/naga-thrift");
  });

  test("a switched-off shop says so instead of offering a link that 404s", async () => {
    setPro(true);
    mockedGetMyShop.mockResolvedValue({ ok: true, data: { ...PROFILE, isPublished: false } });
    const t = await render();
    const all = texts(t);
    expect(all).toContain("Your shop is switched off");
    expect(all).not.toContain("latag.vercel.app/shop/naga-thrift");
    expect(all).not.toContain("Copy link");
  });

  test("a queue with work in it says so honestly", async () => {
    setPro(true);
    mockedGetMyShop.mockResolvedValue({ ok: true, data: PROFILE });
    insertItem({ id: "i1", publishedAt: new Date(), shopCode: "LT-7K2Q9" });
    db.insert(publishQueue).values({ id: "q1", itemId: "i1", op: "upsert", attempts: 0, createdAt: new Date() }).run();
    db.insert(publishQueue).values({ id: "q2", itemId: "i1", op: "delete", attempts: 0, createdAt: new Date() }).run();
    const t = await render();
    expect(texts(t)).toContain("2 changes pending");
  });

  test("Pro without a shop yet is pointed at setup", async () => {
    setPro(true);
    const t = await render();
    expect(texts(t)).toContain("Set up my shop");
    await press(t, "Set up my shop");
    expect(mockPush).toHaveBeenCalledWith("/shop/setup");
  });
});

// ---------------------------------------------------------------------------
// Recent items + quick actions
// ---------------------------------------------------------------------------

describe("Home — recent items", () => {
  test("the strip is newest-first and opens the item it shows", async () => {
    setPro(false);
    insertItem({ id: "old", brand: "Carhartt", createdAt: new Date("2026-01-01T00:00:00Z") });
    insertItem({ id: "new", brand: "Levis", createdAt: new Date("2026-07-01T00:00:00Z") });
    const t = await render();
    const strip = labels(t).filter((l) => l === "Carhartt" || l === "Levis");
    expect(strip).toEqual(["Levis", "Carhartt"]);
    await pressLabelled(t, "Levis");
    expect(mockPush).toHaveBeenCalledWith("/item/new");
  });

  test("an empty inventory hides the strip entirely", async () => {
    setPro(false);
    const t = await render();
    expect(texts(t)).not.toContain("Recent items");
  });
});

// ---------------------------------------------------------------------------
// Pull to refresh
// ---------------------------------------------------------------------------

describe("Home — pull to refresh", () => {
  /** Flushes both the fake timer queue and the microtask queue it feeds. */
  async function settleAll(): Promise<void> {
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  test("the refresh control mirrors the real refreshing state, not a hardcoded false", async () => {
    jest.useFakeTimers();
    try {
      setPro(false);
      const t = await render();
      const control = () => t.root.findByType(RefreshControl);
      expect(control().props.refreshing).toBe(false);

      act(() => { control().props.onRefresh(); });
      expect(control().props.refreshing).toBe(true);

      await settleAll();
      expect(control().props.refreshing).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a refresh whose shop lookup rejects still lowers the flag instead of leaving the spinner stuck", async () => {
    jest.useFakeTimers();
    try {
      setPro(true);
      mockedGetMyShop.mockResolvedValueOnce({ ok: true, data: null });
      const t = await render();
      mockedGetMyShop.mockRejectedValueOnce(new Error("offline"));
      const control = () => t.root.findByType(RefreshControl);

      act(() => { control().props.onRefresh(); });
      expect(control().props.refreshing).toBe(true);

      await settleAll();
      expect(control().props.refreshing).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("Home — quick actions", () => {
  test("New batch opens the composer", async () => {
    setPro(false);
    const t = await render();
    await press(t, "New batch");
    expect(mockPush).toHaveBeenCalledWith("/session/new");
  });

  test("Export a drop opens the newest batch's export sheet", async () => {
    setPro(false);
    const t = await render();
    await press(t, "Export a drop");
    expect(mockPush).toHaveBeenCalledWith("/session/s1/export");
  });

  test("Open shop lands on the shop tab", async () => {
    setPro(false);
    const t = await render();
    await press(t, "Open shop");
    expect(mockPush).toHaveBeenCalledWith("/shop");
  });
});
