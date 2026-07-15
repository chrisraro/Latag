import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { TextInput } from "react-native";

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

import { db } from "../db/client";
import { userBrands } from "../db/schema";
import { addUserBrand, listUserBrands } from "../lib/brands";
import { BrandPickerSheet } from "../components/BrandPickerSheet";

const noop = () => {};

afterEach(() => {
  db.delete(userBrands).run();
});

function render(props: Partial<Parameters<typeof BrandPickerSheet>[0]> = {}): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <BrandPickerSheet visible value="" recents={[]} onPick={noop} onClose={noop} {...props} />,
    );
  });
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

function pressableByLabel(tree: ReactTestRenderer, label: string) {
  // Pressable is a memo/forwardRef wrapper — not matchable via findAllByType.
  const hits = tree.root.findAll(
    (n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === "function",
  );
  expect(hits.length).toBeGreaterThan(0);
  return hits[0];
}

function typeQuery(tree: ReactTestRenderer, text: string) {
  const input = tree.root.findByType(TextInput);
  act(() => { input.props.onChangeText(text); });
}

test("visible=false renders nothing", () => {
  const tree = render({ visible: false });
  expect(tree.toJSON()).toBeNull();
});

test("browse mode: recents tagged 'recent' before custom tagged 'yours' before untagged seed; no add row", () => {
  addUserBrand(db, "Manila Thrift Co");
  const tree = render({ recents: ["Uniqlo"] });
  const all = texts(tree);
  expect(all).toContain("Brand");
  expect(all).toContain("Uniqlo");
  expect(all).toContain("recent");
  expect(all).toContain("Manila Thrift Co");
  expect(all).toContain("yours");
  expect(all.indexOf("Uniqlo")).toBeLessThan(all.indexOf("Manila Thrift Co"));
  expect(all.some((t) => t.startsWith("+ Add"))).toBe(false);
});

test("query with no exact match shows a leading acid add row that creates the brand and picks it", () => {
  const onPick = jest.fn();
  const tree = render({ onPick });
  typeQuery(tree, "Detroit Vintage Co");
  expect(texts(tree)).toContain('+ Add "Detroit Vintage Co"');
  act(() => { pressableByLabel(tree, "Add Detroit Vintage Co").props.onPress(); });
  expect(onPick).toHaveBeenCalledWith("Detroit Vintage Co");
  expect(listUserBrands(db)).toContain("Detroit Vintage Co");
});

test("exact nocase match hides the add row; tapping a suggestion picks its canonical name", () => {
  const onPick = jest.fn();
  const tree = render({ onPick });
  typeQuery(tree, "nike"); // Nike is in data/brands.json
  const all = texts(tree);
  expect(all).toContain("Nike");
  expect(all.some((t) => t.startsWith("+ Add"))).toBe(false);
  act(() => { pressableByLabel(tree, "Nike").props.onPress(); });
  expect(onPick).toHaveBeenCalledWith("Nike");
});

test("the row matching `value` is marked selected", () => {
  const tree = render({ value: "Nike" });
  typeQuery(tree, "nike");
  const row = pressableByLabel(tree, "Nike");
  expect(row.props.accessibilityState).toEqual({ selected: true });
});
