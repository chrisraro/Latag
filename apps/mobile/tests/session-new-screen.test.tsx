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
jest.mock("../lib/notifications", () => ({
  ensureNotifPermission: jest.fn(async () => true),
  scheduleSessionReminders: jest.fn(async () => []),
}));
jest.mock("../lib/toast", () => ({ showError: jest.fn(), showSuccess: jest.fn() }));
// LocationPicker drags in @maplibre/maplibre-react-native, an ESM-only native
// module Jest can't transform. It's irrelevant to mode-default behaviour.
jest.mock("../components/LocationPicker", () => ({ LocationPicker: () => null }));

const mockPush = jest.fn();
const mockDismiss = jest.fn();
const mockRouter = { push: mockPush, dismiss: mockDismiss, back: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "../db/client";
import { sessions } from "../db/schema";
import NewSessionScreen from "../app/session/new";

let tree: ReactTestRenderer | null = null;

beforeEach(async () => {
  jest.clearAllMocks();
  db.delete(sessions).run();
  await AsyncStorage.clear();
});

afterEach(() => {
  act(() => { tree?.unmount(); });
  tree = null;
});

async function render(): Promise<ReactTestRenderer> {
  await act(async () => { tree = renderer.create(<NewSessionScreen />); });
  return tree!;
}

/** Every Pressable in the mode toggle group, in "selector", "bulto" order. */
function modeButtons(t: ReactTestRenderer) {
  return t.root.findAll(
    (n) => typeof n.props?.onPress === "function" && typeof n.props?.className === "string" && /rounded-full/.test(n.props.className) && n.children.length > 0,
  );
}

test("nothing stored: New Batch still opens with Selector selected (safe default)", async () => {
  const t = await render();
  const buttons = modeButtons(t);
  // First mode pressable ("selector") carries the acid-selected background class.
  expect(buttons[0].props.className).toContain("bg-acid");
  expect(buttons[1].props.className).not.toContain("bg-acid");
});

test("a persisted 'bulto' onboarding pick becomes the New Batch default", async () => {
  await AsyncStorage.setItem("latag.defaultMode", "bulto");
  const t = await render();
  const buttons = modeButtons(t);
  expect(buttons[0].props.className).not.toContain("bg-acid");
  expect(buttons[1].props.className).toContain("bg-acid");
});

test("a corrupt/garbage persisted value falls back to the Selector default", async () => {
  await AsyncStorage.setItem("latag.defaultMode", "garbage");
  const t = await render();
  const buttons = modeButtons(t);
  expect(buttons[0].props.className).toContain("bg-acid");
});
