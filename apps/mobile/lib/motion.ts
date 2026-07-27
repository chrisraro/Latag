import { createElement, useRef, type ComponentType, type ReactNode } from "react";
import { Animated, Easing as RNEasing, View, type StyleProp, type ViewStyle } from "react-native";
import { NATIVE_ANIMATION_ENABLED } from "./native-ui";

/**
 * The app's motion vocabulary — one place that owns how long anything takes.
 *
 * ## Why a module and not a few inline numbers
 *
 * Motion is a language: rows entering, a tab crossing over, a button giving
 * under a thumb. When each screen invents its own timing the app stops feeling
 * like one product, and "make it calmer" becomes a hunt. Every animation in
 * Latag asks this module for its duration, its easing and its delay;
 * `tests/motion.test.ts(x)` fails the build if a screen writes its own.
 *
 * ## Reduced motion means instant
 *
 * Someone who has switched the OS setting on is often doing it because motion
 * makes them ill, and a 90ms fade is still motion. So every accessor here
 * collapses to **zero** — and the entrance animation is removed entirely rather
 * than shortened, so the row is simply already there. Nothing in this module
 * ever gates input or a save on an animation finishing: entrances are decorative
 * wrappers, the press scale is fire-and-forget, and navigation happens on press.
 *
 * ## Why Reanimated is behind a guarded require
 *
 * Importing `react-native-reanimated` touches the worklets native module at
 * *import* time. Where that module is missing — Jest, or any build where the
 * native side did not link — the require throws before a single component
 * renders, which would take every screen that imports this file down with it.
 * `components/SwipeRow.tsx` hit the same wall with `ReanimatedSwipeable` and
 * solved it the same way: resolve once, fall back forever. Unlike the Compose
 * crash of 2026-07-27 (see `lib/native-ui.ts`) this failure is a plain JS throw,
 * so a `try`/`catch` genuinely catches it — but the fallback still has to be a
 * real, usable screen, and here it is: the row, unanimated.
 */

// --- The vocabulary -----------------------------------------------------

/**
 * Durations in milliseconds.
 *
 * - `press` — a control giving under a thumb. Must complete before the finger
 *   lifts or it reads as lag rather than feedback.
 * - `enter` — one row arriving. The plan's budget is 200ms; see below.
 * - `screen` — a whole surface changing: a tab cross-fade, the composer rising.
 * - `fly` — the location picker's map camera, which travels a real distance and
 *   is disorienting if it teleports.
 */
export const DURATION = {
  press: 90,
  enter: 180,
  screen: 220,
  fly: 600,
} as const;

export type DurationKey = keyof typeof DURATION;

/** A single row's entrance may not exceed this (G3 Task 6). Asserted in tests
 *  so raising `DURATION.enter` past it is a build failure, not a regression. */
export const ENTER_BUDGET_MS = 200;

/** Gap between consecutive rows in a list entrance. */
export const STAGGER_STEP_MS = 24;

/**
 * How many rows stagger at all.
 *
 * A 500-item inventory must not animate for twelve seconds, and it must not pay
 * for 492 entrances nobody will ever see. Only the first screenful is staggered;
 * everything below the fold is rendered at rest, which is also what a user
 * scrolling fast actually wants.
 */
export const STAGGER_LIMIT = 8;

/** Standard easing as bezier control points — plain data, so reading the
 *  vocabulary never requires a native module. Decelerating: quick to leave,
 *  soft to land. */
export const EASING_STANDARD = [0.2, 0, 0, 1] as const;

/** How far a pressed control gives. */
export const PRESS_SCALE = 0.94;

/** The duration of `key`, or zero when the OS asked for reduced motion. */
export function durationFor(key: DurationKey, reduced: boolean): number {
  return reduced ? 0 : DURATION[key];
}

/**
 * When the row at `index` should start entering, or `null` for "do not animate
 * this one at all" — past the first screenful, under reduced motion, or for an
 * index that is not a real list position.
 */
export function entranceDelay(index: number, reduced: boolean): number | null {
  if (reduced) return null;
  if (!Number.isInteger(index) || index < 0 || index >= STAGGER_LIMIT) return null;
  return index * STAGGER_STEP_MS;
}

// --- Navigator-level motion --------------------------------------------

/** Bottom-tab scene animation. Tabs are peers, so they cross-fade rather than
 *  slide — sliding implies an order the bar does not have. */
export function tabSwitchAnimation(reduced: boolean): "none" | "fade" {
  return reduced ? "none" : "fade";
}

/** Timing for that cross-fade, in React Navigation's `transitionSpec` shape. */
export function tabTransitionSpec(reduced: boolean): { animation: "timing"; config: { duration: number } } {
  return { animation: "timing", config: { duration: durationFor("screen", reduced) } };
}

/** The FAB → composer transition. The composer is summoned by a button at the
 *  bottom of the screen, so it arrives from the bottom. */
export function composerAnimation(reduced: boolean): "none" | "fade_from_bottom" {
  return reduced ? "none" : "fade_from_bottom";
}

// --- Reanimated, if it is there -----------------------------------------

/** A Reanimated layout-animation builder, narrowed to the three calls used here. */
export type EnteringBuilder = {
  duration(ms: number): EnteringBuilder;
  delay(ms: number): EnteringBuilder;
  easing(fn: unknown): EnteringBuilder;
};

/** The slice of `react-native-reanimated` this module needs, and nothing more. */
export type MotionLib = {
  default: { View: ComponentType<{ style?: StyleProp<ViewStyle>; entering?: unknown; children?: ReactNode }> };
  FadeInDown: EnteringBuilder;
  Easing: { bezier: (x1: number, y1: number, x2: number, y2: number) => unknown };
  /** Verified against the installed react-native-reanimated 4.5.0
   *  (`lib/typescript/hook/useReducedMotion.d.ts`): `useReducedMotion(): boolean`,
   *  re-exported from the package index. It reads a value captured at app start
   *  and is not a real hook, so calling it behind a module-level capability
   *  check can never reorder anyone's hooks. */
  useReducedMotion: () => boolean;
};

/**
 * Decides whether Reanimated is usable, given a loader for it. Pure and
 * injectable on purpose — it is tested with a loader that throws rather than by
 * fighting Jest's module-load order, exactly like `resolveSwipeable` and
 * `resolveJetpackUI`. A half-linked module (present, but with no animated view
 * to render into) counts as absent.
 */
export function resolveReanimated(load: () => unknown): MotionLib | null {
  try {
    const mod = load() as Partial<MotionLib> | undefined;
    const AnimatedView = mod?.default?.View;
    const usable =
      (typeof AnimatedView === "function" ||
        (typeof AnimatedView === "object" && AnimatedView !== null && "$$typeof" in AnimatedView)) &&
      typeof mod?.FadeInDown?.duration === "function" &&
      typeof mod?.Easing?.bezier === "function" &&
      typeof mod?.useReducedMotion === "function";
    return usable ? (mod as MotionLib) : null;
  } catch {
    return null;
  }
}

// Resolved once at module load: the native side does not appear halfway through
// a session, so re-resolving per render would only cost frames.
//
// Gated on NATIVE_ANIMATION_ENABLED, currently false. `resolveReanimated`
// above catches a module that is missing or half-linked; it cannot catch a
// worklet runtime that fails on the UI thread, and this OTA would be the first
// code ever to run one on the owner's phone. Read lib/native-ui.ts before
// changing this line. With the gate off every branch below takes the
// no-library path: rows render at rest, which is exactly what shipped before.
const REANIMATED = NATIVE_ANIMATION_ENABLED
  ? resolveReanimated(() => require("react-native-reanimated"))
  : null;

/**
 * Whether the OS asked for reduced motion. `false` wherever Reanimated is
 * absent, which is the safe answer: the fallback path renders everything at
 * rest anyway.
 */
export function useReducedMotion(): boolean {
  return REANIMATED ? REANIMATED.useReducedMotion() : false;
}

/**
 * The entrance for the row at `index`, or `undefined` when it should not have
 * one. Carries this module's duration, easing and stagger delay — a caller
 * never gets to pick its own.
 */
export function enteringFor(lib: MotionLib | null, index: number, reduced: boolean): unknown | undefined {
  if (!lib) return undefined;
  const delay = entranceDelay(index, reduced);
  if (delay === null) return undefined;
  return lib.FadeInDown.duration(DURATION.enter).easing(lib.Easing.bezier(...EASING_STANDARD)).delay(delay);
}

export type MotionViewProps = {
  /** The row's position in its list. Drives the stagger, and the cap. */
  index: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * `EnterView` with its two dependencies handed in, so both branches are
 * testable without a native module. Screens use `EnterView`.
 */
export function MotionView({
  lib,
  reduced,
  index,
  style,
  children,
}: MotionViewProps & { lib: MotionLib | null; reduced: boolean }) {
  const entering = enteringFor(lib, index, reduced);
  // No library: a plain view, with the row already where it belongs. Never a
  // shorter fade.
  if (!lib) return createElement(View, { style }, children);
  // Past the first screenful (or reduced motion) `entering` is undefined, which
  // Animated.View treats as "no layout animation" — but the ELEMENT TYPE stays
  // `lib.default.View` either way. Switching type on `index` would remount the
  // subtree whenever a recycled FlashList cell crossed STAGGER_LIMIT: scrolling
  // a 60-item inventory down past row 20 and back would reload each row's
  // image and reset its swipe state, mid-scroll.
  return createElement(lib.default.View, { style, entering }, children);
}

/**
 * Wraps one list row in its entrance. Decorative by construction: the row's
 * content, its press target and its data are identical either way, so a missing
 * animation costs nothing and a running one blocks nothing.
 */
export function EnterView(props: MotionViewProps) {
  return createElement(MotionView, { ...props, lib: REANIMATED, reduced: useReducedMotion() });
}

// --- Press feedback -----------------------------------------------------

/**
 * The give under a pressed control, on React Native's own `Animated` — no
 * native module, no worklets, available everywhere the app runs.
 *
 * Deliberately decoupled from what the press *does*: the caller navigates on
 * `onPress` immediately and this only decorates the moment. Under reduced
 * motion the scale never leaves 1, so the control simply does not move.
 */
export function usePressScale(): {
  style: { transform: { scale: Animated.Value }[] };
  onPressIn: () => void;
  onPressOut: () => void;
} {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number) => {
    Animated.timing(scale, {
      toValue: value,
      duration: durationFor("press", reduced),
      easing: RNEasing.out(RNEasing.quad),
      useNativeDriver: true,
    }).start();
  };
  return {
    style: { transform: [{ scale }] },
    onPressIn: () => to(reduced ? 1 : PRESS_SCALE),
    onPressOut: () => to(1),
  };
}
