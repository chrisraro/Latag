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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { FlashList } from "@shopify/flash-list";
import { db } from "../db/client";
import { sessions, items } from "../db/schema";
import InventoryScreen from "../app/(tabs)/index";

let tree: ReactTestRenderer | null = null;

beforeEach(async () => {
  jest.clearAllMocks();
  db.delete(items).run();
  db.delete(sessions).run();
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

test("sort chip cycles newest -> price-high -> price-low -> oldest -> newest", async () => {
  seedThree();
  const t = await render();

  // Default mode: unselected (acid only once you've moved off it), labelled Newest.
  expect(pressableByText(t, "Newest").props.accessibilityState).toEqual({ selected: false });

  press(t, "Newest");
  expect(texts(t)).toContain("₱ High");
  expect(pressableByText(t, "₱ High").props.accessibilityState).toEqual({ selected: true });

  press(t, "₱ High");
  expect(texts(t)).toContain("₱ Low");

  press(t, "₱ Low");
  expect(texts(t)).toContain("Oldest");

  // Full cycle: back to Newest, and unselected again.
  press(t, "Oldest");
  expect(texts(t)).toContain("Newest");
  expect(pressableByText(t, "Newest").props.accessibilityState).toEqual({ selected: false });
});

test("no matches shows the filtered empty copy, not the first-run copy", async () => {
  seedThree();
  const t = await render();
  search(t, "zzzz");
  expect(rowBrands(t)).toHaveLength(0);
  expect(texts(t)).toContain("No items match these filters.");
});

test("an empty inventory shows the start-a-batch copy", async () => {
  const t = await render();
  expect(texts(t)).toContain("No items yet — start a batch to log your first piece.");
});

test("tapping a row opens item detail", async () => {
  insertItem({ id: "i9", brand: "Carhartt" });
  const t = await render();
  act(() => { rows(t)[0].props.onPress(); });
  expect(mockPush).toHaveBeenCalledWith("/item/i9");
});

