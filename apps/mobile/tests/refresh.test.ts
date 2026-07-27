import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

import { MIN_REFRESH_MS, settle, useRefresh } from "../lib/refresh";

type Api = ReturnType<typeof useRefresh>;

/** A deferred promise — lets a test hold a refresh open and inspect the flag
 *  while it is genuinely in flight, with no timers involved. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Mounts the hook in a render-less probe. `api()` always reads the latest
 *  committed value, so assertions never look at a stale render. */
function mount(cb: () => Promise<void>) {
  let latest: Api | null = null;
  const Probe = ({ onRefresh }: { onRefresh: () => Promise<void> }) => {
    latest = useRefresh(onRefresh);
    return null;
  };
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(React.createElement(Probe, { onRefresh: cb })); });
  return {
    api: () => latest!,
    rerender: (next: () => Promise<void>) =>
      act(() => { tree.update(React.createElement(Probe, { onRefresh: next })); }),
    unmount: () => act(() => { tree.unmount(); }),
  };
}

test("a pull raises the flag, runs the callback, and lowers it when the work finishes", async () => {
  const d = deferred();
  const cb = jest.fn(() => d.promise);
  const h = mount(cb);

  expect(h.api().refreshing).toBe(false);
  act(() => { h.api().onRefresh(); });
  expect(cb).toHaveBeenCalledTimes(1);
  expect(h.api().refreshing).toBe(true);

  await act(async () => { d.resolve(); await d.promise; });
  expect(h.api().refreshing).toBe(false);
  h.unmount();
});

test("a second pull while one is in flight is ignored", async () => {
  const d = deferred();
  const cb = jest.fn(() => d.promise);
  const h = mount(cb);

  act(() => { h.api().onRefresh(); });
  act(() => { h.api().onRefresh(); });
  act(() => { h.api().onRefresh(); });
  expect(cb).toHaveBeenCalledTimes(1);

  await act(async () => { d.resolve(); await d.promise; });
  act(() => { h.api().onRefresh(); }); // the guard releases once the work is done
  expect(cb).toHaveBeenCalledTimes(2);
  h.unmount();
});

test("a rejected callback is swallowed and still lowers the flag", async () => {
  const d = deferred();
  const cb = jest.fn(() => d.promise);
  const h = mount(cb);

  act(() => { h.api().onRefresh(); });
  expect(h.api().refreshing).toBe(true);

  await act(async () => {
    d.reject(new Error("offline"));
    await d.promise.catch(() => {});
  });
  expect(h.api().refreshing).toBe(false);

  act(() => { h.api().onRefresh(); }); // a failure must not lock the screen out
  expect(cb).toHaveBeenCalledTimes(2);
  h.unmount();
});

test("a callback that throws synchronously is swallowed and still lowers the flag", async () => {
  const cb = jest.fn(() => { throw new Error("boom"); }) as unknown as () => Promise<void>;
  const h = mount(cb);

  await act(async () => { h.api().onRefresh(); });
  expect(h.api().refreshing).toBe(false);
  expect(cb).toHaveBeenCalledTimes(1);

  await act(async () => { h.api().onRefresh(); });
  expect(cb).toHaveBeenCalledTimes(2);
  h.unmount();
});

test("the pull runs the callback the screen rendered last, not the first one", async () => {
  const first = jest.fn(async () => {});
  const second = jest.fn(async () => {});
  const h = mount(first);

  h.rerender(second);
  await act(async () => { h.api().onRefresh(); });

  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  h.unmount();
});

test("a refresh that lands after the screen unmounts does not touch state", async () => {
  const d = deferred();
  const h = mount(() => d.promise);

  act(() => { h.api().onRefresh(); });
  h.unmount();

  // No "state update on an unmounted component" and, more importantly, no throw.
  await act(async () => { d.resolve(); await d.promise; });
  expect(h.api().refreshing).toBe(true); // the last committed render, never updated after unmount
});

test("settle gives the spinner a visible floor and always resolves", async () => {
  expect(MIN_REFRESH_MS).toBeGreaterThan(0);
  const started = Date.now();
  await settle(0);
  expect(Date.now() - started).toBeLessThan(MIN_REFRESH_MS);
});
