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
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
const mockRouter = {
  push: mockPush,
  back: mockBack,
  replace: mockReplace,
  canGoBack: () => mockCanGoBack,
};
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { db } from "../db/client";
import { items, sessions } from "../db/schema";
import DashboardScreen from "../app/session/[id]/index";

let tree: ReactTestRenderer | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
  mockParams = { id: "s1" };
  db.delete(items).run();
  db.delete(sessions).run();
});

afterEach(() => {
  act(() => { tree?.unmount(); });
  tree = null;
});

function render(): ReactTestRenderer {
  act(() => { tree = renderer.create(<DashboardScreen />); });
  return tree!;
}

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

function press(t: ReactTestRenderer, label: string) {
  const hits = t.root.findAll(
    (n) => typeof n.props?.onPress === "function" && collectTexts(n).includes(label),
  );
  expect(hits.length).toBeGreaterThan(0);
  act(() => { hits[hits.length - 1].props.onPress(); });
}

test("an existing batch renders its dashboard", () => {
  db.insert(sessions).values({ id: "s1", name: "Naga Run", type: "selector", createdAt: new Date() }).run();
  expect(texts(render())).toContain("Naga Run");
});

// A reminder for a deleted batch used to land on a permanently blank screen.
test("a deleted batch renders an honest not-found state, not a blank screen", () => {
  mockParams = { id: "gone" };
  const all = texts(render());
  expect(all).toContain("Batch not found");
  expect(all.some((x) => x.includes("deleted"))).toBe(true);
});

test("the not-found state can go back when there is a stack", () => {
  mockParams = { id: "gone" };
  press(render(), "Back to batches");
  expect(mockBack).toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

test("a cold-start notification tap with no stack lands on the batches tab", () => {
  mockParams = { id: "gone" };
  mockCanGoBack = false;
  press(render(), "Back to batches");
  expect(mockReplace).toHaveBeenCalledWith("/batches");
  expect(mockBack).not.toHaveBeenCalled();
});
