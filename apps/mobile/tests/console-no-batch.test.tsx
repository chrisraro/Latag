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
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  // `/item/new` carries no route params at all — the console must survive that.
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ back: mockBack, push: mockPush, dismiss: jest.fn() }),
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
// The real PhotoSlot renders (it is how the camera route is reached); only its
// image backend needs standing in for.
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("../components/BrandPickerSheet", () => ({ BrandPickerSheet: () => null }));

import { db } from "../db/client";
import { sessions, items, entitlements, photos, userBrands } from "../db/schema";
import { addItem } from "../lib/repo";
import NewItemScreen from "../app/item/new/index";

const addItemMock = addItem as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  db.delete(photos).run();
  db.delete(items).run();
  db.delete(userBrands).run();
  db.delete(sessions).run();
  db.delete(entitlements).run();
  db.insert(entitlements).values({ id: 1 }).run();
});

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(<NewItemScreen />); });
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

function press(tree: ReactTestRenderer, label: string) {
  const hits = tree.root.findAll(
    (n) => typeof n.props?.onPress === "function" && collectTexts(n).includes(label),
  );
  expect(hits.length).toBeGreaterThan(0);
  act(() => { hits[hits.length - 1].props.onPress(); });
}

test("the console renders with no batch in the database at all", () => {
  const tree = render();
  const all = texts(tree);
  expect(all).toContain("New item");
  expect(all).toContain("No batch");
  // The whole Rapid Console is still there — departments, types, wheels, save.
  for (const d of ["Tops", "Bottoms", "Dresses", "Footwear", "Bags", "Accessories"]) expect(all).toContain(d);
  expect(all).toContain("Tee");
  expect(all).toContain('PTP "');
  expect(all).toContain("Save item");
});

test("no batch means no bale to allocate — the cost wheel stays hidden", () => {
  const all = texts(render());
  expect(all).toContain("Target price");
  expect(all).not.toContain("Cost · Price");
});

test("saving writes a loose item (null sessionId) and returns where the user came from", () => {
  // A previously logged loose item gives the console its recent-brand chip.
  db.insert(items).values({
    id: "seed", sessionId: null, brand: "Nike", category: "Tee", condition: "9/10",
    targetSellPrice: 350, createdAt: new Date(),
  }).run();
  const tree = render();
  press(tree, "Nike");
  press(tree, "Save item");
  expect(addItemMock).toHaveBeenCalledTimes(1);
  expect(addItemMock.mock.calls[0][1]).toMatchObject({
    sessionId: null, brand: "Nike", department: "tops", category: "Tee", individualCost: 0,
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("photo slots open the batch-less camera", () => {
  const tree = render();
  press(tree, "FRONT");
  expect(mockPush).toHaveBeenCalledWith("/item/new/camera?slot=front&filled=");
});
