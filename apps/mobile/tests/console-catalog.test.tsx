import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("../db/client", () => {
  const { makeTestDb } = require("./helpers/testDb");
  return { db: makeTestDb().db };
});
// Synchronous stand-in: re-runs the query every render (fresh data, no liveness needed).
jest.mock("drizzle-orm/expo-sqlite", () => ({ useLiveQuery: (q: any) => ({ data: q.all() }) }));
let mockParams: Record<string, string> = { id: "s1" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), dismiss: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../lib/repo", () => ({
  addItem: jest.fn(() => ({ item: { id: "new-item" }, logsRemaining: 5 })),
  updateItem: jest.fn(() => ({ id: "edited-item" })),
  addPhoto: jest.fn(),
  replacePhoto: jest.fn(() => ({ photo: { id: "p" }, replacedUris: [] })),
}));
jest.mock("../lib/media", () => ({ deleteFiles: jest.fn(async () => {}) }));
jest.mock("../lib/toast", () => ({ showError: jest.fn(), showSuccess: jest.fn() }));
jest.mock("../components/PhotoSlot", () => ({ PhotoSlot: () => null }));
jest.mock("../components/GoProSheet", () => ({ GoProSheet: () => null }));
jest.mock("../components/BrandPickerSheet", () => ({ BrandPickerSheet: () => null }));

import { db } from "../db/client";
import { sessions, items, entitlements, photos, userBrands } from "../db/schema";
import { addItem, updateItem } from "../lib/repo";
import RapidConsole from "../app/session/[id]/add";

const addItemMock = addItem as jest.Mock;
const updateItemMock = updateItem as jest.Mock;

const SESSION_ID = "s1";
const SEP = " · "; // FieldLabel separator: en-space + middle dot + en-space (existing console voice)

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: SESSION_ID };
  db.delete(photos).run();
  db.delete(items).run();
  db.delete(userBrands).run();
  db.delete(sessions).run();
  db.delete(entitlements).run();
  db.insert(sessions).values({ id: SESSION_ID, name: "Bagong Silang", type: "selector", totalBaleCost: 0, createdAt: new Date() }).run();
  db.insert(entitlements).values({ id: 1 }).run();
});

function insertItem(overrides: Partial<typeof items.$inferInsert> = {}): string {
  const id = overrides.id ?? "item-1";
  db.insert(items).values({
    id, sessionId: SESSION_ID, brand: "Nike", category: "Tee", condition: "9/10",
    targetSellPrice: 350, createdAt: new Date(), ...overrides,
  }).run();
  return id;
}

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(<RapidConsole />); });
  return tree;
}

/** Flattens every text node in render order. */
function texts(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (node == null) return;
    if (typeof node === "string") { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out;
}

function collectTexts(node: any, out: string[] = []): string[] {
  for (const child of node.children ?? []) {
    if (typeof child === "string") out.push(child);
    else collectTexts(child, out);
  }
  return out;
}

/** Innermost pressable whose rendered text includes `label` (chips, segments, buttons). */
function pressableByText(tree: ReactTestRenderer, label: string) {
  const hits = tree.root.findAll(
    (n) => typeof n.props?.onPress === "function" && collectTexts(n).includes(label),
  );
  expect(hits.length).toBeGreaterThan(0);
  return hits[hits.length - 1];
}

function press(tree: ReactTestRenderer, label: string) {
  const target = pressableByText(tree, label);
  act(() => { target.props.onPress(); });
}

function sizeNoteInput(tree: ReactTestRenderer) {
  const hits = tree.root.findAll(
    (n) => n.props?.accessibilityLabel === "Size note" && typeof n.props?.onChangeText === "function",
  );
  return hits.length ? hits[0] : null;
}

test("defaults to tops: six departments, tops types, paired key-spec wheels, collapsed More specs", () => {
  const tree = render();
  const all = texts(tree);
  for (const d of ["Tops", "Bottoms", "Dresses", "Footwear", "Bags", "Accessories"]) expect(all).toContain(d);
  expect(pressableByText(tree, "Tops").props.accessibilityState).toEqual({ selected: true });
  for (const t of ["Tee", "Polo", "Longsleeve", "Jersey", "Crewneck", "Sweater", "Hoodie", "Jacket"]) expect(all).toContain(t);
  expect(all).toContain(`Pit-to-pit${SEP}Length`);
  expect(all).toContain('PTP "');
  expect(all).toContain('L "');
  expect(all).toContain("+ More specs");
  expect(all).not.toContain('SL "'); // extra stays collapsed
});

test("switching department swaps type chips, resets category to first type, swaps wheels", () => {
  const tree = render();
  press(tree, "Bottoms");
  const all = texts(tree);
  expect(pressableByText(tree, "Bottoms").props.accessibilityState).toEqual({ selected: true });
  for (const t of ["Jeans", "Trousers", "Cargo", "Shorts", "Skirt"]) expect(all).toContain(t);
  expect(all).not.toContain("Tee");
  expect(pressableByText(tree, "Jeans").props.accessibilityState).toEqual({ selected: true });
  expect(all).toContain(`Waist${SEP}Inseam`);
  expect(all).toContain('W "');
  expect(all).toContain('INS "');
  expect(all).not.toContain(`Pit-to-pit${SEP}Length`);
});

test("+ More specs expands the extra wheels", () => {
  const tree = render();
  press(tree, "Bottoms");
  press(tree, "+ More specs");
  const all = texts(tree);
  expect(all).toContain(`Rise${SEP}Leg opening`);
  expect(all).toContain('RISE "');
  expect(all).toContain('LEG "');
});

test("footwear wheels use US and CM unit labels", () => {
  const tree = render();
  press(tree, "Footwear");
  const all = texts(tree);
  expect(all).toContain(`US size${SEP}Insole`);
  expect(all).toContain("US");
  expect(all).toContain("CM");
  expect(all).not.toContain("+ More specs"); // footwear has no extras
});

test("accessories shows no wheels, no More specs — just the size note field", () => {
  const tree = render();
  press(tree, "Accessories");
  const all = texts(tree);
  for (const t of ["Cap", "Belt", "Scarf", "Beanie", "Watch", "Eyewear"]) expect(all).toContain(t);
  expect(all).not.toContain("+ More specs");
  expect(all.some((t) => t.endsWith('"'))).toBe(false); // no inch wheel unit labels
  expect(sizeNoteInput(tree)).not.toBeNull();
});

test("save passes department, wheel defaults for key specs, null extras", () => {
  insertItem({ id: "seed", brand: "Nike" }); // gives the console a recent-brand chip
  const tree = render();
  press(tree, "Bottoms");
  press(tree, "Nike");
  press(tree, "Save item");
  expect(addItemMock).toHaveBeenCalledTimes(1);
  const input = addItemMock.mock.calls[0][1];
  expect(input).toMatchObject({
    sessionId: SESSION_ID, brand: "Nike", department: "bottoms", category: "Jeans",
    waistInches: 35, inseamInches: 30, riseInches: null, legOpeningInches: null, sizeNote: null,
  });
  expect(input).not.toHaveProperty("ptpInches");
});

test("save passes trimmed sizeNote for accessories", () => {
  insertItem({ id: "seed", brand: "Nike" });
  const tree = render();
  press(tree, "Accessories");
  press(tree, "Nike");
  act(() => { sizeNoteInput(tree)!.props.onChangeText("  7 1/4 fitted  "); });
  press(tree, "Save item");
  expect(addItemMock).toHaveBeenCalledTimes(1);
  expect(addItemMock.mock.calls[0][1]).toMatchObject({
    department: "accessories", category: "Cap", sizeNote: "7 1/4 fitted",
  });
});

test("edit mode derives department from the item and prefills specs", () => {
  const id = insertItem({ id: "shoe-1", brand: "Asics", department: "footwear", category: "Boots", shoeSizeUs: 9.5, insoleCm: 26 });
  mockParams = { id: SESSION_ID, item: id };
  const tree = render();
  expect(pressableByText(tree, "Footwear").props.accessibilityState).toEqual({ selected: true });
  expect(pressableByText(tree, "Boots").props.accessibilityState).toEqual({ selected: true });
  press(tree, "Save changes");
  expect(updateItemMock).toHaveBeenCalledTimes(1);
  expect(updateItemMock.mock.calls[0][2]).toMatchObject({
    brand: "Asics", department: "footwear", category: "Boots", shoeSizeUs: 9.5, insoleCm: 26,
  });
});

test("edit mode auto-expands More specs when an extra spec is set", () => {
  const id = insertItem({ id: "jeans-1", brand: "Levi's", department: "bottoms", category: "Jeans", waistInches: 32, inseamInches: 30, riseInches: 10.5 });
  mockParams = { id: SESSION_ID, item: id };
  const tree = render();
  expect(texts(tree)).toContain(`Rise${SEP}Leg opening`); // expanded without a tap
});

test("switching department in edit mode clears prefilled specs", () => {
  const id = insertItem({ id: "shoe-2", brand: "Asics", department: "footwear", category: "Boots", shoeSizeUs: 9.5, insoleCm: 26 });
  mockParams = { id: SESSION_ID, item: id };
  const tree = render();
  press(tree, "Tops");
  press(tree, "Save changes");
  expect(updateItemMock).toHaveBeenCalledTimes(1);
  const patch = updateItemMock.mock.calls[0][2];
  expect(patch).toMatchObject({ department: "tops", category: "Tee", ptpInches: 25, lengthInches: 28, sleeveInches: null });
  expect(patch).not.toHaveProperty("shoeSizeUs");
});
