import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

/**
 * Direct tests of useShopViewModel's `refreshing` flag — the hook, not the
 * screen. `shop-tab.test.tsx` mocks this hook entirely (so it can drive the
 * screen through every state without a real db round-trip), which means
 * nothing there exercises the hook's own contract with `lib/refresh`'s
 * useRefresh: no overlapping refreshes, the flag always clears, and a
 * throwing/rejecting refresh is swallowed rather than left stuck. This file
 * mounts the real hook and holds it to that contract.
 */

jest.mock("../db/client", () => {
  const { makeTestDb } = require("./helpers/testDb");
  return { db: makeTestDb().db };
});
// Synchronous stand-in: re-runs the query every render (fresh data, no liveness needed).
jest.mock("drizzle-orm/expo-sqlite", () => ({ useLiveQuery: (q: any) => ({ data: q.all() }) }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismiss: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require("react");
    useEffect(() => cb(), [cb]);
  },
}));
jest.mock("../lib/toast", () => ({ showSuccess: jest.fn(), showError: jest.fn() }));
// The network seam only — the derived state and useRefresh stay real.
jest.mock("../lib/shop-api", () => ({
  shopUrl: (h: string) => `https://latag.vercel.app/shop/${h}`,
  shopUrlLabel: (h: string) => `latag.vercel.app/shop/${h}`,
  getMyShop: jest.fn(),
  cachedShop: jest.fn(async () => null),
  cacheShop: jest.fn(async () => {}),
}));

import { db } from "../db/client";
import { entitlements, items, photos, publishQueue, sessions } from "../db/schema";
import { getMyShop } from "../lib/shop-api";
import { useShopViewModel, type ShopViewModel } from "../hooks/useShopViewModel";

const mockedGetMyShop = getMyShop as jest.MockedFunction<typeof getMyShop>;

let tree: ReactTestRenderer | null = null;

afterEach(() => {
  // Guaranteed even when an assertion above throws mid-test — an unmounted
  // Probe left dangling would keep its effects live into the next test and,
  // combined with fake timers, fire outside any act() there.
  act(() => { tree?.unmount(); });
  tree = null;
});

async function mount(): Promise<{ api: () => ShopViewModel }> {
  let latest: ShopViewModel | null = null;
  const Probe = () => {
    latest = useShopViewModel();
    return null;
  };
  await act(async () => {
    tree = renderer.create(React.createElement(Probe));
  });
  return { api: () => latest! };
}

/** Flushes both the fake timer queue and the microtask queue it feeds. */
async function settleAll(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  db.delete(publishQueue).run();
  db.delete(photos).run();
  db.delete(items).run();
  db.delete(sessions).run();
  db.delete(entitlements).run();
  db.insert(sessions).values({ id: "s1", name: "Naga Run", type: "bulto", totalBaleCost: 1000, createdAt: new Date() }).run();
  db.insert(entitlements).values({ id: 1, pro: true }).run();
  mockedGetMyShop.mockResolvedValue({ ok: true, data: null });
});

describe("useShopViewModel — refreshing", () => {
  test("starts false, flips true while a pull is in flight, and clears once it settles", async () => {
    jest.useFakeTimers();
    try {
      const h = await mount();
      expect(h.api().refreshing).toBe(false);

      act(() => { h.api().refresh(); });
      expect(h.api().refreshing).toBe(true);

      await settleAll();
      expect(h.api().refreshing).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a refresh whose network read rejects still clears refreshing — useRefresh swallows the failure", async () => {
    jest.useFakeTimers();
    try {
      const h = await mount();
      mockedGetMyShop.mockRejectedValueOnce(new Error("offline"));

      act(() => { h.api().refresh(); });
      expect(h.api().refreshing).toBe(true);

      await settleAll();
      expect(h.api().refreshing).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
