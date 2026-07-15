import { decideStartRoute } from "../lib/first-run";

test("fresh install -> welcome", () => expect(decideStartRoute(false, false)).toBe("/welcome"));
test("welcomed but not onboarded -> onboarding", () => expect(decideStartRoute(true, false)).toBe("/onboarding"));
test("existing user (onboarded pre-welcome-era, never welcomed) -> stays in app", () =>
  expect(decideStartRoute(false, true)).toBeNull());
test("fully initialized -> stays in app", () => expect(decideStartRoute(true, true)).toBeNull());
