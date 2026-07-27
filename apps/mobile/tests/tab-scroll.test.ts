import { registerTabScroll, scrollTabToTop } from "../lib/tab-scroll";

test("a registered route scrolls and reports that it did", () => {
  const scroll = jest.fn();
  const unregister = registerTabScroll("index", scroll);
  expect(scrollTabToTop("index")).toBe(true);
  expect(scroll).toHaveBeenCalledTimes(1);
  unregister();
});

test("an unregistered route is a reported no-op", () => {
  expect(scrollTabToTop("nobody-home")).toBe(false);
});

test("unregistering stops the handler from being called", () => {
  const scroll = jest.fn();
  registerTabScroll("shop", scroll)();
  expect(scrollTabToTop("shop")).toBe(false);
  expect(scroll).not.toHaveBeenCalled();
});

test("a stale unregister cannot remove the screen that replaced it", () => {
  const first = jest.fn();
  const second = jest.fn();
  const undoFirst = registerTabScroll("batches", first);
  registerTabScroll("batches", second);
  undoFirst(); // the old screen unmounts AFTER the new one registered
  expect(scrollTabToTop("batches")).toBe(true);
  expect(second).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
});

test("a handler with nothing to scroll reports a no-op", () => {
  const unregister = registerTabScroll("index", () => false);
  expect(scrollTabToTop("index")).toBe(false);
  unregister();
});

test("a throwing handler is contained and reported as a no-op", () => {
  const unregister = registerTabScroll("settings", () => { throw new Error("list gone"); });
  expect(scrollTabToTop("settings")).toBe(false);
  unregister();
});
