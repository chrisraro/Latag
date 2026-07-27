import { quickAddRoute } from "../lib/quick-add";

test("routes into the most recent batch's add flow when one exists", () => {
  expect(quickAddRoute("session-42")).toBe("/session/session-42/add");
});

test("routes to /session/new when there is no batch at all", () => {
  expect(quickAddRoute(null)).toBe("/session/new");
});
