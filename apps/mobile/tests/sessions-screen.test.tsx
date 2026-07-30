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
const mockReplace = jest.fn();
// Stable router identity — the screen's first-run effect depends on [router].
const mockRouter = { push: mockPush, replace: mockReplace, back: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../lib/repo", () => ({
  startScheduledSession: jest.fn(() => ({ session: { id: "sch1" }, notificationIds: ["n1", "n2"] })),
  deleteSession: jest.fn(() => ({ photoUris: ["file://front.jpg"], reminderNotificationIds: ["n7"] })),
}));
jest.mock("../lib/notifications", () => ({ cancelReminders: jest.fn(async () => {}) }));
jest.mock("../lib/media", () => ({ deleteFiles: jest.fn(async () => {}) }));
jest.mock("../lib/toast", () => ({ showError: jest.fn(), showSuccess: jest.fn() }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, AppState, FlatList, type AppStateStatus } from "react-native";
import { db } from "../db/client";
import { sessions, items } from "../db/schema";
import { deleteSession, startScheduledSession } from "../lib/repo";
import { cancelReminders } from "../lib/notifications";
import { deleteFiles } from "../lib/media";
import { showSuccess } from "../lib/toast";
import { SwipeRow, type SwipeBinding } from "../components/SwipeRow";
import type { BatchActionKey } from "../lib/swipe-actions";
import SessionsScreen from "../app/(tabs)/batches";

const MIN = 60_000;
let tree: ReactTestRenderer | null = null;

beforeEach(async () => {
  jest.clearAllMocks();
  db.delete(items).run();
  db.delete(sessions).run();
  // Past the first-run gate: welcomed + onboarded → no redirect, screen renders.
  await AsyncStorage.multiSet([
    ["latag.welcomed", "1"],
    ["latag.onboarded", "1"],
  ]);
});

afterEach(() => {
  act(() => { tree?.unmount(); }); // inside act: unmount runs effect cleanups (countdown interval)
  tree = null;
});

function insertSession(over: Partial<typeof sessions.$inferInsert> = {}): void {
  db.insert(sessions).values({
    id: "s1", name: "Naga Run", type: "bulto", totalBaleCost: 1000, createdAt: new Date(), ...over,
  }).run();
}

async function render(): Promise<ReactTestRenderer> {
  await act(async () => { tree = renderer.create(<SessionsScreen />); });
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

/** Innermost pressable whose rendered text includes `label` (chips, segments, buttons). */
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

/** The single control carrying an exact a11y label (header icon buttons). */
function pressLabelled(t: ReactTestRenderer, label: string) {
  const hits = t.root.findAll((n) => typeof n.props?.onPress === "function" && n.props?.accessibilityLabel === label);
  expect(hits).toHaveLength(1);
  act(() => { hits[0].props.onPress(); });
}

// Settings left the tab bar in G1 — the header gear is now the only way in
// besides a deep link, from every tab.
test("the header gear opens Settings and the batch count survives beside it", async () => {
  insertSession();
  const t = await render();
  expect(texts(t)).toContain("1 BATCH");
  pressLabelled(t, "Settings");
  expect(mockPush).toHaveBeenCalledWith("/settings");
});

test("defaults to Sessions tab: live sessions only, Scheduled seg carries a count badge", async () => {
  insertSession();
  insertSession({ id: "sch1", name: "Baguio Weekend", scheduledAt: new Date(Date.now() + 120 * MIN + 5000), reminderOffsets: "[0,30,60]" });
  const t = await render();
  const all = texts(t);
  expect(all).toContain("Naga Run");
  expect(all).not.toContain("Baguio Weekend"); // scheduled stays off the live tab
  expect(all).toContain("Batches"); // AppHead title
  expect(all).toContain("Active"); // segmented control's left segment
  expect(all).toContain("Scheduled");
  expect(all).toContain("1"); // scheduled count badge
  expect(pressableByText(t, "Active").props.accessibilityState).toEqual({ selected: true });
});

test("Scheduled tab: soonest-first cards with countdown, stamp, pin line, reminder summary", async () => {
  const soon = new Date(Date.now() + 30 * MIN + 5000);
  insertSession({ id: "sch-later", name: "Later Run", scheduledAt: new Date(Date.now() + 120 * MIN + 5000), reminderOffsets: "[30]" });
  insertSession({ id: "sch-soon", name: "Sooner Run", scheduledAt: soon, locationName: "SM Naga", lat: 13.6, lng: 123.2, reminderOffsets: "[0,30,60]" });
  const t = await render();
  press(t, "Scheduled");
  const all = texts(t);
  expect(all.indexOf("Sooner Run")).toBeLessThan(all.indexOf("Later Run"));
  expect(all).toContain("in 30m");
  expect(all).toContain("in 2h");
  expect(all).toContain("SM Naga");
  expect(all).toContain("3 reminders");
  expect(all).toContain("1 reminder");
  expect(all.some((x) => x.includes(" · ") && (x.includes("AM") || x.includes("PM")))).toBe(true); // schedule stamp
});

test("overdue scheduled session shows countdown 'now'", async () => {
  insertSession({ id: "sch1", name: "Missed Run", scheduledAt: new Date(Date.now() - 5 * MIN), reminderOffsets: "[30]" });
  const t = await render();
  press(t, "Scheduled");
  expect(texts(t)).toContain("now");
});

test("Start now converts the session, cancels reminders, toasts, and pushes the dashboard", async () => {
  insertSession({ id: "sch1", name: "Baguio Weekend", scheduledAt: new Date(Date.now() + 120 * MIN + 5000), reminderOffsets: "[0,30]" });
  const t = await render();
  press(t, "Scheduled");
  press(t, "Start now");
  expect(startScheduledSession).toHaveBeenCalledWith(expect.anything(), "sch1");
  expect(cancelReminders).toHaveBeenCalledWith(["n1", "n2"]);
  expect(showSuccess).toHaveBeenCalledWith("Batch started");
  expect(mockPush).toHaveBeenCalledWith("/session/sch1");
});

test("scheduled card body does not navigate to the dashboard (only Start now does)", async () => {
  insertSession({ id: "sch1", name: "Baguio Weekend", scheduledAt: new Date(Date.now() + 120 * MIN + 5000), reminderOffsets: "[30]" });
  const t = await render();
  press(t, "Scheduled");
  const hits = t.root.findAll(
    (n) => typeof n.props?.onPress === "function" && collectTexts(n).includes("Baguio Weekend"),
  );
  expect(hits).toHaveLength(0);
});

test("Edit chip opens the edit sheet for that session", async () => {
  insertSession({ id: "sch1", name: "Baguio Weekend", scheduledAt: new Date(Date.now() + 120 * MIN + 5000), reminderOffsets: "[30]" });
  const t = await render();
  press(t, "Scheduled");
  press(t, "Edit");
  expect(mockPush).toHaveBeenCalledWith("/session/edit?id=sch1");
});

test("empty Scheduled tab shows the ghost card copy", async () => {
  insertSession();
  const t = await render();
  press(t, "Scheduled");
  expect(texts(t)).toContain("No scheduled batches — plan your next bale run from New Batch");
});

test("live session card gains a pinned-location line when locationName is set", async () => {
  insertSession({ locationName: "Ukay Center", lat: 13.6, lng: 123.2 });
  const t = await render();
  expect(texts(t)).toContain("Ukay Center");
});

// ---------------------------------------------------------------------------
// List sizing (Wave 1 Task 3)
//
// Neither FlatList here had `style`/`flex`, unlike every other list in the
// app (inventory.tsx, shop.tsx) and unlike the empty-state ScrollView in this
// same file — an unbounded FlatList in a flex column sizes to its content
// instead of the remaining screen space, which can grow past the viewport
// and push the sibling "New Batch" footer (a plain View below the list, not
// part of its scroll content) off-screen once there are enough rows to fill
// a screen. Jest's renderer doesn't run Yoga layout, so it can't measure
// actual pixel heights or prove scrolling — the closest verifiable proxy is
// that the list is a real FlatList (a scrollable container, not a plain
// View) carrying the same flex-sizing style as the reference screens, with
// the primary action still reachable in the tree in every list state.
//
// Placed before "countdowns refresh...": that test's AppState.addEventListener
// spy (restored in its own `finally`) is unrelated to this fix, but running a
// scheduled-tab test immediately after it hits a pre-existing test-order
// fragility in the real (unmocked) AppState listener's cleanup — not
// something this task touches, so these tests run ahead of it instead.
// ---------------------------------------------------------------------------

test("the live batches list is a flex-sized FlatList with New Batch still present", async () => {
  insertSession();
  const t = await render();
  const lists = t.root.findAllByType(FlatList as any);
  expect(lists).toHaveLength(1);
  expect(lists[0].props.style).toEqual(expect.objectContaining({ flex: 1 }));
  expect(pressableByText(t, "New Batch")).toBeTruthy();
});

test("the scheduled list is a flex-sized FlatList with New Batch still present", async () => {
  insertSession({ id: "sch1", name: "Baguio Weekend", scheduledAt: new Date(Date.now() + 120 * MIN + 5000), reminderOffsets: "[30]" });
  const t = await render();
  press(t, "Scheduled");
  const lists = t.root.findAllByType(FlatList as any);
  expect(lists).toHaveLength(1);
  expect(lists[0].props.style).toEqual(expect.objectContaining({ flex: 1 }));
  expect(pressableByText(t, "New Batch")).toBeTruthy();
});

test("the empty batches state (no FlatList mounted) still shows New Batch", async () => {
  const t = await render();
  expect(t.root.findAllByType(FlatList as any)).toHaveLength(0);
  expect(pressableByText(t, "New Batch")).toBeTruthy();
});

test("countdowns refresh the moment the app returns to the foreground", async () => {
  // The 30s interval is suspended while backgrounded, so a resumed screen would
  // otherwise show a countdown minted before the phone went to sleep.
  const resume: ((state: AppStateStatus) => void)[] = [];
  const spy = jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((type, listener) => {
      if (type === "change") resume.push(listener as (state: AppStateStatus) => void);
      return { remove: jest.fn() } as never;
    });
  jest.useFakeTimers();
  try {
    jest.setSystemTime(new Date("2026-07-27T10:00:00+08:00"));
    insertSession({ id: "sch1", name: "Baguio Weekend", scheduledAt: new Date(Date.now() + 30 * MIN + 5000), reminderOffsets: "[30]" });
    const t = await render();
    press(t, "Scheduled");
    expect(texts(t)).toContain("in 30m");
    expect(resume.length).toBeGreaterThan(0);

    jest.setSystemTime(new Date("2026-07-27T10:15:00+08:00")); // backgrounded: no interval ticks
    act(() => { resume.forEach((h) => h("active")); });
    expect(texts(t)).toContain("in 15m");
  } finally {
    jest.useRealTimers();
    spy.mockRestore();
  }
});

// ---------------------------------------------------------------------------
// Swipe actions (G3)
//
// `SwipeRow` falls back to a plain card under Jest — Reanimated's native side
// isn't there to require — so the drag itself can't be performed here. What
// matters anyway is the wiring: which actions a card is handed, and that the
// destructive one cannot fire without an answer to a dialog.
// ---------------------------------------------------------------------------

const swipeBindings = (t: ReactTestRenderer, index = 0) =>
  t.root.findAllByType(SwipeRow as any)[index].props.actions as SwipeBinding<BatchActionKey>[];

function swipe(t: ReactTestRenderer, key: BatchActionKey, index = 0): void {
  const action = swipeBindings(t, index).find((a) => a.key === key);
  if (!action) throw new Error(`card ${index} has no ${key} action`);
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

test("a live batch card carries an Add item and a Delete action", async () => {
  insertSession();
  const t = await render();
  expect(swipeBindings(t).map((a) => a.key)).toEqual(["addItem", "deleteBatch"]);
});

test("swiping Add item opens the batch's console", async () => {
  insertSession();
  const t = await render();
  swipe(t, "addItem");
  expect(mockPush).toHaveBeenCalledWith("/session/s1/add");
});

// A stray drag must never take a batch — and its items and photos — with it.
test("swiping Delete asks first and does nothing if you cancel", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  try {
    insertSession();
    const t = await render();
    swipe(t, "deleteBatch");
    expect(deleteSession).not.toHaveBeenCalled();
    confirmAlert("Cancel");
    expect(deleteSession).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

test("confirming the delete removes the batch, its photo files and its reminders", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  try {
    insertSession();
    const t = await render();
    swipe(t, "deleteBatch");
    confirmAlert("Delete");
    expect(deleteSession).toHaveBeenCalledWith(expect.anything(), "s1");
    expect(deleteFiles).toHaveBeenCalledWith(["file://front.jpg"]);
    expect(cancelReminders).toHaveBeenCalledWith(["n7"]);
    expect(showSuccess).toHaveBeenCalledWith("Batch deleted");
  } finally {
    spy.mockRestore();
  }
});
