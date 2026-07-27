import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import type { ReactElement, ReactNode } from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { Text, View } from "react-native";

import {
  DURATION,
  EASING_STANDARD,
  ENTER_BUDGET_MS,
  MotionView,
  STAGGER_LIMIT,
  STAGGER_STEP_MS,
  composerAnimation,
  durationFor,
  entranceDelay,
  enteringFor,
  resolveReanimated,
  tabSwitchAnimation,
  tabTransitionSpec,
  type EnteringBuilder,
  type MotionLib,
} from "../lib/motion";

/**
 * Motion is a shared vocabulary, not a pile of magic numbers: every screen asks
 * this module how long something takes, so "make it calmer" is one edit here
 * rather than a hunt through the app. These tests pin the two properties that
 * actually matter to a user — a stagger that ends, and a reduced-motion setting
 * that means *instant* rather than merely faster.
 */

// --- The vocabulary -----------------------------------------------------

test("every duration is a real, positive number of milliseconds", () => {
  const values = Object.values(DURATION);
  expect(values.length).toBeGreaterThan(0);
  for (const ms of values) {
    expect(Number.isFinite(ms)).toBe(true);
    expect(ms).toBeGreaterThan(0);
  }
});

test("a row's entrance stays inside the 200ms budget the plan set", () => {
  expect(ENTER_BUDGET_MS).toBe(200);
  expect(DURATION.enter).toBeLessThanOrEqual(ENTER_BUDGET_MS);
});

test("the standard easing is plain data, so nothing needs a native module to read it", () => {
  expect(EASING_STANDARD).toHaveLength(4);
  expect(EASING_STANDARD.every((n) => Number.isFinite(n))).toBe(true);
});

test("durationFor hands back the constant, and zero under reduced motion", () => {
  for (const key of Object.keys(DURATION) as (keyof typeof DURATION)[]) {
    expect(durationFor(key, false)).toBe(DURATION[key]);
    // Reduced motion is not "quicker" — it is no animation at all.
    expect(durationFor(key, true)).toBe(0);
  }
});

// --- The stagger --------------------------------------------------------

test("the first rows enter one step apart", () => {
  expect(entranceDelay(0, false)).toBe(0);
  expect(entranceDelay(1, false)).toBe(STAGGER_STEP_MS);
  expect(entranceDelay(2, false)).toBe(2 * STAGGER_STEP_MS);
});

test("a 500-item list does not animate forever — the stagger stops at one screenful", () => {
  expect(entranceDelay(STAGGER_LIMIT - 1, false)).not.toBeNull();
  expect(entranceDelay(STAGGER_LIMIT, false)).toBeNull();
  expect(entranceDelay(120, false)).toBeNull();
  expect(entranceDelay(499, false)).toBeNull();
});

test("the whole entrance is over inside a third of a second", () => {
  const last = entranceDelay(STAGGER_LIMIT - 1, false)!;
  expect(last + DURATION.enter).toBeLessThanOrEqual(400);
});

test("reduced motion removes the entrance entirely, at every index", () => {
  expect(entranceDelay(0, true)).toBeNull();
  expect(entranceDelay(3, true)).toBeNull();
});

test("a nonsense index is not animated rather than NaN-delayed", () => {
  expect(entranceDelay(-1, false)).toBeNull();
  expect(entranceDelay(Number.NaN, false)).toBeNull();
  expect(entranceDelay(1.5, false)).toBeNull();
});

// --- Navigator-level motion --------------------------------------------

test("tabs cross-fade, and do not move at all under reduced motion", () => {
  expect(tabSwitchAnimation(false)).toBe("fade");
  expect(tabSwitchAnimation(true)).toBe("none");
  expect(tabTransitionSpec(false)).toEqual({ animation: "timing", config: { duration: DURATION.screen } });
  expect(tabTransitionSpec(true)).toEqual({ animation: "timing", config: { duration: 0 } });
});

test("the FAB's composer rises from the bottom, and appears instantly under reduced motion", () => {
  expect(composerAnimation(false)).toBe("fade_from_bottom");
  expect(composerAnimation(true)).toBe("none");
});

// --- Resolving the animation library ------------------------------------

/** The shape `lib/motion` needs from Reanimated, and nothing more. */
function fakeReanimated() {
  const calls: { duration?: number; delay?: number; easing?: unknown } = {};
  const builder: EnteringBuilder = {
    duration(ms: number) { calls.duration = ms; return builder; },
    delay(ms: number) { calls.delay = ms; return builder; },
    easing(fn: unknown) { calls.easing = fn; return builder; },
  };
  const AnimatedView = ({ children }: { children?: ReactNode }) => <View>{children}</View>;
  return {
    calls,
    mod: {
      default: { View: AnimatedView },
      FadeInDown: builder,
      Easing: { bezier: (...args: number[]) => ({ bezier: args }) },
      useReducedMotion: () => false,
    } satisfies MotionLib,
  };
}

test("a Reanimated that cannot be loaded is simply absent — it never throws", () => {
  expect(resolveReanimated(() => { throw new Error("no worklets native module"); })).toBeNull();
});

test("a half-linked Reanimated counts as absent", () => {
  expect(resolveReanimated(() => undefined)).toBeNull();
  expect(resolveReanimated(() => ({}))).toBeNull();
  // Present, but with no animated View to render into.
  expect(resolveReanimated(() => ({ FadeInDown: {}, Easing: {}, default: {} }))).toBeNull();
});

test("a complete Reanimated resolves", () => {
  const { mod } = fakeReanimated();
  expect(resolveReanimated(() => mod)).toBe(mod);
});

// --- The entrance animation itself --------------------------------------

test("enteringFor builds a FadeInDown carrying this module's duration, delay and easing", () => {
  const { mod, calls } = fakeReanimated();
  const entering = enteringFor(mod, 2, false);
  expect(entering).toBe(mod.FadeInDown);
  expect(calls.duration).toBe(DURATION.enter);
  expect(calls.delay).toBe(2 * STAGGER_STEP_MS);
  expect(calls.easing).toEqual({ bezier: [...EASING_STANDARD] });
});

test("enteringFor gives nothing when there is no library, no stagger left, or reduced motion", () => {
  const { mod } = fakeReanimated();
  expect(enteringFor(null, 0, false)).toBeUndefined();
  expect(enteringFor(mod, STAGGER_LIMIT, false)).toBeUndefined();
  expect(enteringFor(mod, 0, true)).toBeUndefined();
});

// --- MotionView ---------------------------------------------------------

function render(el: ReactElement): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => { tree = renderer.create(el); });
  return tree!;
}

test("MotionView renders its children with no library at all", () => {
  const t = render(
    <MotionView lib={null} index={0} reduced={false}><Text>row</Text></MotionView>,
  );
  expect(t.root.findByType(Text).props.children).toBe("row");
  // Nothing animated, so nothing carries an entrance.
  expect(t.root.findAllByType(View).some((n) => n.props.entering !== undefined)).toBe(false);
});

test("MotionView animates the first rows and leaves the rest alone", () => {
  const { mod } = fakeReanimated();
  const animated = render(<MotionView lib={mod} index={0} reduced={false}><Text>a</Text></MotionView>);
  expect(animated.root.findByType(mod.default.View).props.entering).toBeTruthy();

  const late = render(<MotionView lib={mod} index={STAGGER_LIMIT + 4} reduced={false}><Text>b</Text></MotionView>);
  // Past the first screenful the row carries NO entrance. The wrapper itself
  // stays — the element type must not depend on `index`, or a recycled
  // FlashList cell crossing STAGGER_LIMIT would remount its whole subtree
  // (image reload, swipe state reset) in the middle of a scroll.
  expect(late.root.findByType(mod.default.View).props.entering).toBeUndefined();
  expect(late.root.findByType(Text).props.children).toBe("b");
});

test("reduced motion renders the row at rest, never a faster fade", () => {
  const { mod } = fakeReanimated();
  const t = render(<MotionView lib={mod} index={0} reduced><Text>c</Text></MotionView>);
  // At rest means no entrance at all — not a shorter one.
  expect(t.root.findByType(mod.default.View).props.entering).toBeUndefined();
  expect(t.root.findByType(Text).props.children).toBe("c");
});

// --- The standing rule --------------------------------------------------

const MOBILE_ROOT = join(__dirname, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCE_FILES = ["app", "components"].flatMap((d) => walk(join(MOBILE_ROOT, d)));

/** Anything that moves: a layout animation, a navigator transition, an
 *  interpolated value, a map camera. */
const ANIMATES = /\bentering=|\bexiting=|animationDuration|transitionSpec|\banimation:|Animated\.timing\(|\.flyTo\(|\bEnterView\b|\busePressScale\b/;

/** A duration written as a number, anywhere outside this module. */
const HARDCODED_MS = /\b(duration|animationDuration|delay)\s*:\s*[0-9]/;

test("every screen that animates reads its timing from lib/motion", () => {
  const animating = SOURCE_FILES.filter((f) => ANIMATES.test(readFileSync(f, "utf8")));
  // The rule is worthless if it silently matches nothing.
  expect(animating.length).toBeGreaterThan(0);
  const freelancing = animating.filter((f) => !/from\s+"[./]*lib\/motion"/.test(readFileSync(f, "utf8")));
  expect(freelancing.map((f) => f.replace(MOBILE_ROOT, ""))).toEqual([]);
});

test("no screen writes its own duration", () => {
  // One vocabulary or none: a literal here is how an app ends up with four
  // different ideas of what "quick" means.
  const offenders = SOURCE_FILES.filter((f) => HARDCODED_MS.test(readFileSync(f, "utf8")));
  expect(offenders.map((f) => f.replace(MOBILE_ROOT, ""))).toEqual([]);
});
