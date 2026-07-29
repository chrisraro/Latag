import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("../db/client", () => {
  const { makeTestDb } = require("./helpers/testDb");
  return { db: makeTestDb().db };
});
// Synchronous stand-in: re-runs the query every render (fresh data, no liveness needed).
jest.mock("drizzle-orm/expo-sqlite", () => ({ useLiveQuery: (q: any) => ({ data: q.all() }) }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
// Stable router identity — the screen's first-run effect depends on [router].
const mockRouter = { push: mockPush, replace: mockReplace, back: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../lib/toast", () => ({ showError: jest.fn(), showSuccess: jest.fn() }));
// The network seam only — the repo and the outbox stay real, because the swipe
// actions exist to write to them. The upload/upsert/delete trio must be present
// (not merely omitted): publishing calls kickSync, whose drain reaches straight
// into these, and an undefined one would be swallowed as a failed attempt.
jest.mock("../lib/shop-api", () => ({
  shopUrl: (h: string) => `https://latag.vercel.app/shop/${h}`,
  shopItemUrl: (h: string, c: string | null) => `https://latag.vercel.app/shop/${h}/${c}`,
  getMyShop: jest.fn(async () => ({ ok: true, data: null })),
  cachedShop: jest.fn(async () => null),
  cacheShop: jest.fn(async () => {}),
  uploadItemPhotos: jest.fn(async () => ({ ok: true, data: [] as string[] })),
  upsertShopItem: jest.fn(async () => ({ ok: true, data: null })),
  deleteShopItem: jest.fn(async () => ({ ok: true, data: null })),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { entitlements, publishQueue, sessions, items, type Item } from "../db/schema";
import { cachedShop, type ShopProfile } from "../lib/shop-api";
import { showSuccess } from "../lib/toast";
import { SwipeRow, type SwipeBinding } from "../components/SwipeRow";
import type { ItemActionKey } from "../lib/swipe-actions";
import InventoryScreen from "../app/(tabs)/inventory";

const mockedCachedShop = cachedShop as jest.MockedFunction<typeof cachedShop>;
const mockedSuccess = showSuccess as jest.MockedFunction<typeof showSuccess>;

const PROFILE: ShopProfile = {
  handle: "naga-thrift", displayName: "Naga Thrift", bio: null,
  contactMessenger: null, contactInstagram: null, contactEmail: null,
  showSold: false, isPublished: true,
};

let tree: ReactTestRenderer | null = null;

beforeEach(async () => {
  jest.clearAllMocks();
  db.delete(items).run();
  db.delete(sessions).run();
  db.delete(publishQueue).run();
  db.delete(entitlements).run();
  db.insert(entitlements).values({ id: 1, pro: false }).run();
  mockedCachedShop.mockResolvedValue(null);
  db.insert(sessions).values({ id: "s1", name: "Naga Run", type: "bulto", totalBaleCost: 1000, createdAt: new Date() }).run();
  // Past the first-run gate: welcomed + onboarded → no redirect, screen renders.
  await AsyncStorage.multiSet([
    ["latag.welcomed", "1"],
    ["latag.onboarded", "1"],
  ]);
});

afterEach(() => {
  act(() => { tree?.unmount(); });
  tree = null;
});

function insertItem(over: Partial<typeof items.$inferInsert> = {}): void {
  db.insert(items).values({
    id: "i1", sessionId: "s1", brand: "Carhartt", name: null, department: "tops",
    category: "Jacket", condition: "9/10", individualCost: 0, targetSellPrice: 850,
    status: "available", createdAt: new Date("2026-07-01T00:00:00Z"), ...over,
  }).run();
}

async function render(): Promise<ReactTestRenderer> {
  await act(async () => { tree = renderer.create(<InventoryScreen />); });
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

function press(t: ReactTestRenderer, label: string) {
  const target = pressableByText(t, label);
  act(() => { target.props.onPress(); });
}

function search(t: ReactTestRenderer, value: string) {
  const field = t.root.findAll((n) => n.props?.accessibilityLabel === "Search inventory");
  expect(field.length).toBeGreaterThan(0);
  act(() => { field[0].props.onChangeText(value); });
}

/** The pressable rows rendered inside the list (chips and header live outside it). */
function rows(t: ReactTestRenderer) {
  return t.root.findByType(FlashList).findAll((n) => typeof n.props?.onPress === "function");
}

/**
 * Brand of each rendered row, in order. The row's first text node is the
 * thumbnail's brand-initial fallback, so read the title Text (the only
 * semibold node in the row) instead.
 */
function rowBrands(t: ReactTestRenderer): string[] {
  return rows(t).map((row) => {
    const title = row.findAll((n) => n.props?.style?.fontFamily === "Archivo-SemiBold")[0];
    return collectTexts(title)[0];
  });
}

/**
 * Brands in list order, read from what the list was *handed* rather than from
 * what it rendered: `FlashList` recycles its row components, so the order of
 * the mounted rows is its own business and does not track `data` after a
 * re-render. Order-sensitive assertions (sort) must use this; presence
 * assertions can use `rowBrands`.
 */
function listBrands(t: ReactTestRenderer): string[] {
  return (t.root.findByType(FlashList).props.data as Item[]).map((i) => i.brand);
}

function seedThree(): void {
  insertItem({ id: "i1", brand: "Carhartt", category: "Jacket" });
  insertItem({ id: "i2", brand: "Nike", name: "Windbreaker", category: "Jacket" });
  insertItem({ id: "i3", brand: "Levi's", category: "Jeans", department: "bottoms", status: "sold", soldPrice: 700, soldAt: new Date() });
}

test("renders every item with the totals strip", async () => {
  seedThree();
  const t = await render();
  expect(rowBrands(t).sort()).toEqual(["Carhartt", "Levi's", "Nike"]);
  const all = texts(t);
  expect(all).toContain("Carhartt");
  expect(all).toContain("SOLD");
  expect(all).toContain("3 items · 2 available · ₱1,700 stock value");
});

test("search narrows across brand, name and category", async () => {
  seedThree();
  const t = await render();
  search(t, "wind");
  expect(rowBrands(t)).toEqual(["Nike"]);
  search(t, "jeans");
  expect(rowBrands(t)).toEqual(["Levi's"]);
  search(t, "");
  expect(rowBrands(t)).toHaveLength(3);
});

test("Sold status chip shows only sold rows", async () => {
  seedThree();
  const t = await render();
  press(t, "Sold");
  expect(rowBrands(t)).toEqual(["Levi's"]);
});

test("department chip narrows to that department", async () => {
  seedThree();
  const t = await render();
  press(t, "Bottoms");
  expect(rowBrands(t)).toEqual(["Levi's"]);
});

test("department chip switches cleanly between departments", async () => {
  seedThree();
  const t = await render();
  press(t, "Bottoms");
  expect(rowBrands(t)).toEqual(["Levi's"]);
  press(t, "Tops");
  expect(rowBrands(t).sort()).toEqual(["Carhartt", "Nike"]);
});

test("Loose items chip shows only items with no batch, and clears back to all", async () => {
  seedThree();
  insertItem({ id: "i4", brand: "Uniqlo", sessionId: null });
  const t = await render();
  expect(rowBrands(t)).toHaveLength(4);
  press(t, "Loose items");
  expect(rowBrands(t)).toEqual(["Uniqlo"]);
  expect(pressableByText(t, "Loose items").props.accessibilityState).toEqual({ selected: true });
  expect(texts(t)).toContain("Showing 1 of 4 · ₱850 in this view");
  press(t, "Loose items");
  expect(rowBrands(t)).toHaveLength(4);
});

// G3 turned sort from a one-tap cycle through four hidden modes into a
// segmented control. Under Jest the platform is iOS, so what renders is the
// chip fallback — which is exactly the point: every mode is on screen at once
// and reachable in one tap, whichever half of the control you get.
test("every sort mode is on screen, with the current one marked", async () => {
  seedThree();
  const t = await render();
  const all = texts(t);
  for (const label of ["Newest", "₱ High", "₱ Low", "Oldest"]) expect(all).toContain(label);
  expect(pressableByText(t, "Newest").props.accessibilityState).toEqual({ selected: true });
  expect(pressableByText(t, "Oldest").props.accessibilityState).toEqual({ selected: false });
});

test("choosing a sort mode reorders the list and moves the selection", async () => {
  seedThree(); // Carhartt ₱850, Nike ₱850, Levi's sold ₱700 — all logged the same instant
  const t = await render();

  press(t, "₱ Low");
  expect(listBrands(t)).toEqual(["Levi's", "Carhartt", "Nike"]);
  expect(pressableByText(t, "₱ Low").props.accessibilityState).toEqual({ selected: true });
  expect(pressableByText(t, "Newest").props.accessibilityState).toEqual({ selected: false });

  // One tap from any mode to any other — no cycling through the ones between.
  press(t, "₱ High");
  expect(listBrands(t)).toEqual(["Carhartt", "Nike", "Levi's"]);
});

// Status is the other segmented dimension; re-tapping the mode you are already
// in must not churn the list.
test("re-tapping the current status leaves the view alone", async () => {
  seedThree();
  const t = await render();
  press(t, "Sold");
  expect(rowBrands(t)).toEqual(["Levi's"]);
  press(t, "Sold");
  expect(rowBrands(t)).toEqual(["Levi's"]);
});

test("no matches shows the filtered empty copy, not the first-run copy", async () => {
  seedThree();
  const t = await render();
  search(t, "zzzz");
  expect(rowBrands(t)).toHaveLength(0);
  expect(texts(t)).toContain("No items match these filters.");
});

// Items no longer need a batch (G2), so the first-run copy must not send the
// user off to create one before they can log anything.
test("an empty inventory points at the add button, not at batches", async () => {
  const t = await render();
  expect(texts(t)).toContain("No items yet — tap + to log your first piece.");
});

test("tapping a row opens item detail", async () => {
  insertItem({ id: "i9", brand: "Carhartt" });
  const t = await render();
  act(() => { rows(t)[0].props.onPress(); });
  expect(mockPush).toHaveBeenCalledWith("/item/i9");
});

/** The single control carrying an exact a11y label (header icon buttons). */
function pressLabelled(t: ReactTestRenderer, label: string) {
  const hits = t.root.findAll((n) => typeof n.props?.onPress === "function" && n.props?.accessibilityLabel === label);
  expect(hits).toHaveLength(1);
  act(() => { hits[0].props.onPress(); });
}

// ---------------------------------------------------------------------------
// Swipe actions (G3)
//
// `SwipeRow` falls back to a plain row under Jest — Reanimated's native side
// isn't there to require — so the gesture itself can't be dragged here. What is
// worth testing anyway is the wiring: which actions each row is handed, and
// what each one does to the database. The reveal animation is device QA.
// ---------------------------------------------------------------------------

const swipeRows = (t: ReactTestRenderer) => t.root.findAllByType(SwipeRow as any);

function swipeKeys(t: ReactTestRenderer, index = 0): string[] {
  return (swipeRows(t)[index].props.actions as SwipeBinding<ItemActionKey>[]).map((a) => a.key);
}

function swipe(t: ReactTestRenderer, key: ItemActionKey, index = 0): void {
  const action = (swipeRows(t)[index].props.actions as SwipeBinding<ItemActionKey>[]).find((a) => a.key === key);
  if (!action) throw new Error(`row ${index} has no ${key} action (has ${swipeKeys(t, index).join(", ")})`);
  act(() => { action.onPress(); });
}

/** Answers the most recent Alert by pressing the button with this label. */
function confirmAlert(label: string): void {
  const alertMock = Alert.alert as unknown as jest.Mock;
  expect(alertMock).toHaveBeenCalled();
  const buttons = alertMock.mock.calls[alertMock.mock.calls.length - 1][2] as { text: string; onPress?: () => void }[];
  const button = buttons.find((b) => b.text === label);
  expect(button).toBeDefined();
  act(() => { button!.onPress?.(); });
}

const readItem = (id: string): Item => db.select().from(items).where(eq(items.id, id)).all()[0];

beforeEach(() => {
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

async function renderAsSeller(): Promise<ReactTestRenderer> {
  db.update(entitlements).set({ pro: true }).run();
  mockedCachedShop.mockResolvedValue(PROFILE);
  const t = await render();
  // The shop lookup lands a tick after mount; without this the rows are still
  // built from `hasShop: false` and would never offer Publish.
  await act(async () => { await Promise.resolve(); });
  return t;
}

test("an available row swipes to mark sold at the asking price", async () => {
  insertItem({ id: "i1", brand: "Carhartt", targetSellPrice: 850 });
  const t = await render();
  expect(swipeKeys(t)).toEqual(["markSold"]);
  swipe(t, "markSold");
  const after = readItem("i1");
  expect(after.status).toBe("sold");
  expect(after.soldPrice).toBe(850);
  expect(mockedSuccess).toHaveBeenCalledWith("Sold at ₱850 — tap to undo", expect.anything());
});

// A stray drag on a scrolling list must be one tap away from being wrong.
test("the mark-sold toast's undo puts the item back in stock", async () => {
  insertItem({ id: "i1", brand: "Carhartt", targetSellPrice: 850 });
  const t = await render();
  swipe(t, "markSold");
  const undo = mockedSuccess.mock.calls[0][1]?.onPress;
  expect(undo).toBeDefined();
  act(() => { undo!(); });
  const after = readItem("i1");
  expect(after.status).toBe("available");
  expect(after.soldPrice).toBeNull();
  expect(after.soldAt).toBeNull();
});

// Un-marking throws away the date it sold on, which no toast can hand back.
test("undoing a sale asks first, and leaves the sale alone if you cancel", async () => {
  insertItem({ id: "i1", brand: "Levi's", status: "sold", soldPrice: 700, soldAt: new Date("2026-07-02T00:00:00Z") });
  const t = await render();
  expect(swipeKeys(t)).toEqual(["undoSold"]);
  swipe(t, "undoSold");
  expect(readItem("i1").status).toBe("sold"); // nothing yet — the dialog is open
  confirmAlert("Cancel");
  expect(readItem("i1").status).toBe("sold");
  swipe(t, "undoSold");
  confirmAlert("Undo sold");
  expect(readItem("i1").status).toBe("available");
});

test("publish is offered only to a Pro seller who has a shop", async () => {
  insertItem({ id: "i1", brand: "Carhartt" });
  const free = await render();
  expect(swipeKeys(free)).not.toContain("publish");
  act(() => { free.unmount(); });

  const seller = await renderAsSeller();
  expect(swipeKeys(seller)).toContain("publish");
});

test("swiping publish mints a code, queues the upsert, and offers an undo", async () => {
  insertItem({ id: "i1", brand: "Carhartt" });
  const t = await renderAsSeller();
  swipe(t, "publish");
  const published = readItem("i1");
  expect(published.publishedAt).not.toBeNull();
  expect(published.shopCode).toMatch(/^LT-/);
  expect(db.select().from(publishQueue).all().map((r) => r.op)).toEqual(["upsert"]);

  const undo = mockedSuccess.mock.calls[0][1]?.onPress;
  expect(undo).toBeDefined();
  act(() => { undo!(); });
  expect(readItem("i1").publishedAt).toBeNull();
  // The code survives an unpublish — buyers may already be holding it.
  expect(readItem("i1").shopCode).toBe(published.shopCode);
});

// The one action on this screen that changes what strangers can see.
test("unpublishing demands a confirmation before the listing comes down", async () => {
  insertItem({ id: "i1", brand: "Carhartt", publishedAt: new Date("2026-07-02T00:00:00Z"), shopCode: "LT-ABCDE" });
  const t = await renderAsSeller();
  expect(swipeKeys(t)).toEqual(["markSold", "unpublish"]);
  swipe(t, "unpublish");
  expect(readItem("i1").publishedAt).not.toBeNull(); // still live until you say so
  confirmAlert("Cancel");
  expect(readItem("i1").publishedAt).not.toBeNull();

  swipe(t, "unpublish");
  confirmAlert("Remove");
  expect(readItem("i1").publishedAt).toBeNull();
  expect(db.select().from(publishQueue).all().map((r) => r.op)).toEqual(["delete"]);
});

// A lapsed seller must never be trapped with stock live on a page they cannot
// reach — putting something up needs a shop, taking it down does not.
test("a published item can be taken down even with no Pro and no cached shop", async () => {
  insertItem({ id: "i1", brand: "Carhartt", publishedAt: new Date("2026-07-02T00:00:00Z"), shopCode: "LT-ABCDE" });
  const t = await render();
  expect(swipeKeys(t)).toContain("unpublish");
});

// Settings left the tab bar in G1 — the header gear is now the only way in
// besides a deep link, from every tab.
test("the header gear opens Settings and the count badge survives beside it", async () => {
  seedThree();
  const t = await render();
  expect(texts(t)).toContain("3"); // the count badge, still in the right slot
  pressLabelled(t, "Settings");
  expect(mockPush).toHaveBeenCalledWith("/settings");
});

