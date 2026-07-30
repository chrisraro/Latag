import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

const mockReplace = jest.fn();
const mockRouter = { push: jest.fn(), replace: mockReplace, back: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("../lib/notifications", () => ({
  ensureNotifPermission: jest.fn(async () => true),
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Location from "expo-location";
import { ensureNotifPermission } from "../lib/notifications";
import OnboardingScreen from "../app/onboarding";

const requestMediaPerm = MediaLibrary.requestPermissionsAsync as jest.Mock;
const requestLocationPerm = Location.requestForegroundPermissionsAsync as jest.Mock;
const requestNotifPerm = ensureNotifPermission as jest.Mock;

let tree: ReactTestRenderer | null = null;

beforeEach(async () => {
  jest.clearAllMocks();
  requestMediaPerm.mockResolvedValue({ granted: true });
  requestLocationPerm.mockResolvedValue({ granted: true });
  requestNotifPerm.mockResolvedValue(true);
  await AsyncStorage.clear();
});

afterEach(() => {
  act(() => { tree?.unmount(); });
  tree = null;
});

async function render(): Promise<ReactTestRenderer> {
  await act(async () => { tree = renderer.create(<OnboardingScreen />); });
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

/** All pressables whose rendered text includes `label`, innermost last. */
function pressablesByText(t: ReactTestRenderer, label: string) {
  return t.root.findAll(
    (n) => typeof n.props?.onPress === "function" && collectTexts(n).includes(label),
  );
}

/** Presses the pressable at `index` among those whose text includes `label`
 *  (permission rows repeat the "Allow" chip — index picks the row). */
async function press(t: ReactTestRenderer, label: string, index = 0) {
  const hits = pressablesByText(t, label);
  // The innermost matching pressable per row is the chip itself; rows are
  // rendered in order, so group hits by walking outermost-first duplicates out.
  const innermost = hits.filter((h) => !hits.some((other) => other !== h && other.parent === h));
  const roots = innermost.length > 0 ? innermost : hits;
  expect(roots.length).toBeGreaterThan(index);
  await act(async () => { roots[index].props.onPress(); });
}

test("renders three panes: modes, camera, permissions", async () => {
  const t = await render();
  const all = texts(t);
  expect(all).toContain("How do you source?");
  expect(all).toContain("Shoot it. Tag it. Sell it.");
  expect(all).toContain("Latag asks only when needed");
});

test("permissions pane shows the three rows and the optional footer", async () => {
  const t = await render();
  const all = texts(t);
  expect(all).toContain("Photos");
  expect(all).toContain("Save listing photos to your gallery");
  expect(all).toContain("Notifications");
  expect(all).toContain("Batch reminders that ring like an alarm");
  expect(all).toContain("Location");
  expect(all).toContain("Pin batches on the map");
  expect(all).toContain("All optional — Latag asks again only when a feature needs it.");
  expect(pressablesByText(t, "Allow").length).toBeGreaterThanOrEqual(3);
});

test("Photos Allow fires the OS prompt (writeOnly=false) and flips to Granted ✓", async () => {
  const t = await render();
  await press(t, "Allow", 0);
  expect(requestMediaPerm).toHaveBeenCalledWith(false);
  const all = texts(t);
  expect(all).toContain("Granted ✓");
});

test("Notifications Allow goes through ensureNotifPermission", async () => {
  const t = await render();
  await press(t, "Allow", 1);
  expect(requestNotifPerm).toHaveBeenCalled();
  expect(texts(t)).toContain("Granted ✓");
});

test("Location Allow requests foreground location permission", async () => {
  const t = await render();
  await press(t, "Allow", 2);
  expect(requestLocationPerm).toHaveBeenCalled();
  expect(texts(t)).toContain("Granted ✓");
});

test("denied chip stays 'Allow' and stays tappable for a retry", async () => {
  requestMediaPerm.mockResolvedValue({ granted: false });
  const t = await render();
  await press(t, "Allow", 0);
  expect(texts(t)).not.toContain("Granted ✓");
  await press(t, "Allow", 0); // still tappable
  expect(requestMediaPerm).toHaveBeenCalledTimes(2);
});

test("permission request failures don't crash the pane", async () => {
  requestLocationPerm.mockRejectedValue(new Error("boom"));
  const t = await render();
  await press(t, "Allow", 2);
  expect(texts(t)).toContain("Latag asks only when needed"); // pane intact
  expect(texts(t)).not.toContain("Granted ✓");
});

test("Start logging lives on the permissions pane and finishes onboarding", async () => {
  const t = await render();
  await press(t, "Start logging");
  expect(await AsyncStorage.getItem("latag.onboarded")).toBe("1");
  expect(await AsyncStorage.getItem("latag.welcomed")).toBe("1");
  expect(mockReplace).toHaveBeenCalledWith("/");
});

test("Skip stays available top-right on the first pane", async () => {
  const t = await render();
  expect(pressablesByText(t, "Skip").length).toBeGreaterThan(0);
});

test("Selector is preselected on open — no card shows a selected style by accident", async () => {
  const t = await render();
  const [selectorCard] = t.root.findAll(
    (n) => n.props?.accessibilityRole === "radio" && n.props?.accessibilityLabel?.includes("Selector"),
  );
  const [bultoCard] = t.root.findAll(
    (n) => n.props?.accessibilityRole === "radio" && n.props?.accessibilityLabel?.includes("Bulto"),
  );
  expect(selectorCard.props.accessibilityState).toEqual({ checked: true });
  expect(bultoCard.props.accessibilityState).toEqual({ checked: false });
});

test("tapping Bulto selects it and deselects Selector — exactly one selected at a time", async () => {
  const t = await render();
  const [bultoCard] = t.root.findAll(
    (n) => n.props?.accessibilityRole === "radio" && n.props?.accessibilityLabel?.includes("Bulto"),
  );
  await act(async () => { bultoCard.props.onPress(); });

  const [selectorCard] = t.root.findAll(
    (n) => n.props?.accessibilityRole === "radio" && n.props?.accessibilityLabel?.includes("Selector"),
  );
  const [bultoCardAfter] = t.root.findAll(
    (n) => n.props?.accessibilityRole === "radio" && n.props?.accessibilityLabel?.includes("Bulto"),
  );
  expect(selectorCard.props.accessibilityState).toEqual({ checked: false });
  expect(bultoCardAfter.props.accessibilityState).toEqual({ checked: true });
});

test("tapping Bulto then finishing onboarding persists 'bulto' as the default mode", async () => {
  const t = await render();
  const [bultoCard] = t.root.findAll(
    (n) => n.props?.accessibilityRole === "radio" && n.props?.accessibilityLabel?.includes("Bulto"),
  );
  await act(async () => { bultoCard.props.onPress(); });
  await press(t, "Start logging");
  expect(await AsyncStorage.getItem("latag.defaultMode")).toBe("bulto");
});

test("Skip on pane 1 without touching a card persists the Selector default", async () => {
  const t = await render();
  await press(t, "Skip");
  expect(await AsyncStorage.getItem("latag.defaultMode")).toBe("selector");
});

test("mode cards emit exactly one bg-* utility each — two competing bg classes on one element is decided by tailwind.config.js key order, not intent", async () => {
  // ModeCard's className is built from a base string plus a selected-branch
  // override. If the base ever reintroduces its own bg-* (as the unselected
  // branch's bg-surface1 used to sit outside the ternary), the selected card
  // renders with two bg-* utilities on one element and the winner depends on
  // tailwind.config.js key order rather than which branch is active — the
  // exact accident that let the selected card fall back to bg-surface1 with
  // text-acidink on it (an unreadable acid-on-dark combination) the moment
  // that file's key order changed. Every other selected-state element in
  // this codebase (components/ui.tsx Chip/PrimaryButton, the Batches tab
  // pills) emits exactly one bg-* — mode cards must match.
  const t = await render();
  const cards = t.root.findAll((n) => n.props?.accessibilityRole === "radio");
  expect(cards.length).toBeGreaterThan(0); // sanity: we actually found the cards
  for (const card of cards) {
    const bgClasses = (card.props.className as string).match(/\bbg-\S+/g) ?? [];
    expect(bgClasses.length).toBe(1);
  }
});

test("a storage write failure on finish still lets the user continue past onboarding", async () => {
  jest.spyOn(AsyncStorage, "multiSet").mockRejectedValueOnce(new Error("disk full"));
  const t = await render();
  await press(t, "Start logging");
  expect(mockReplace).toHaveBeenCalledWith("/");
});
