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
}));
jest.mock("../lib/notifications", () => ({ cancelReminders: jest.fn(async () => {}) }));
jest.mock("../lib/toast", () => ({ showError: jest.fn(), showSuccess: jest.fn() }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "../db/client";
import { sessions, items } from "../db/schema";
import { startScheduledSession } from "../lib/repo";
import { cancelReminders } from "../lib/notifications";
import { showSuccess } from "../lib/toast";
import SessionsScreen from "../app/index";

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

test("defaults to Sessions tab: live sessions only, Scheduled seg carries a count badge", async () => {
  insertSession();
  insertSession({ id: "sch1", name: "Baguio Weekend", scheduledAt: new Date(Date.now() + 120 * MIN + 5000), reminderOffsets: "[0,30,60]" });
  const t = await render();
  const all = texts(t);
  expect(all).toContain("Naga Run");
  expect(all).not.toContain("Baguio Weekend"); // scheduled stays off the live tab
  expect(all).toContain("Sessions");
  expect(all).toContain("Scheduled");
  expect(all).toContain("1"); // scheduled count badge
  expect(pressableByText(t, "Sessions").props.accessibilityState).toEqual({ selected: true });
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
  expect(showSuccess).toHaveBeenCalledWith("Session started");
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
  expect(texts(t)).toContain("No scheduled sessions — plan your next bale run from New Session");
});

test("live session card gains a pinned-location line when locationName is set", async () => {
  insertSession({ locationName: "Ukay Center", lat: 13.6, lng: 123.2 });
  const t = await render();
  expect(texts(t)).toContain("Ukay Center");
});
