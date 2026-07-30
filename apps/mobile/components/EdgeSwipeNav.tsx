import { useCallback, useRef, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useRouter, usePathname } from "expo-router";
import {
  EDGE_WIDTH,
  pathnameFromRouteName,
  resolveEdgeSwipeTarget,
  routeNameFromPathname,
  type EdgeSwipeSample,
} from "../lib/edge-swipe";

/**
 * Edge-swipe shortcut between the four bar tabs. Wraps `<Tabs>` once, in
 * `app/(tabs)/_layout.tsx` — every tab screen gets it for free.
 *
 * ## Why this is safe to ship over the air
 *
 * `react-native-gesture-handler` is a *plain* dependency here — no worklet is
 * ever created. `.runOnJS(true)` below is `Gesture.Pan()`'s own builder method
 * (see `node_modules/react-native-gesture-handler/.../gesture.js`), not
 * Reanimated's `runOnJS`; it forces the gesture's callbacks onto the JS thread
 * unconditionally. Nothing here imports `react-native-reanimated` — if it did,
 * `tests/native-ui-gate.test.ts` would fail the build, and per the 2026-07-27
 * postmortem in `lib/native-ui.ts`, a worklet is the one failure mode no error
 * boundary can catch. `GestureHandlerRootView` is already mounted at the app
 * root (`app/_layout.tsx`), so this module reaches for nothing that isn't
 * already linked and proven on the shipped binary.
 *
 * ## Why it doesn't fight the FlashLists, the RefreshControls, or the two
 * horizontal strips (Home's recent items, Inventory's filter chips)
 *
 * Each `Gesture.Pan()` below carries a `hitSlop` that shrinks its touchable
 * area to a 24px sliver at one screen edge. A touch beginning anywhere else —
 * which is to say, everywhere the app's own horizontal scrollers and lists
 * live — never reaches this gesture at all; it passes straight through to
 * whatever is underneath. The `edgeSwipeDirection` distance/dominance check in
 * `lib/edge-swipe.ts` is a second, independently-testable line of defense on
 * top of that, not a substitute for it.
 *
 * ## Why there is no finger-tracked page translation
 *
 * That needs Reanimated. `router.navigate` below fires once, on release, and
 * rides the same cross-fade `app/(tabs)/_layout.tsx` already applies to a tap
 * on the bar — including its `useReducedMotion` handling. This component adds
 * no animation of its own.
 *
 * ## Why swipe is never the only way anywhere
 *
 * The bar is unchanged: every destination it reaches, this reaches, and
 * nothing else. A route outside `TAB_DESTINATIONS` (Settings) is a structural
 * no-op — `neighborTabRoute` returns `null` for it — never a crash or a
 * misnavigation.
 */
export function EdgeSwipeNav({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const startXRef = useRef(0);

  const attempt = useCallback(
    (sample: EdgeSwipeSample) => {
      const currentRoute = routeNameFromPathname(pathname);
      const target = resolveEdgeSwipeTarget(sample, width, currentRoute);
      if (target) router.navigate(pathnameFromRouteName(target) as Parameters<typeof router.navigate>[0]);
    },
    [pathname, width, router],
  );

  const onEnd = useCallback(
    (e: { translationX: number; translationY: number }) => {
      attempt({ startX: startXRef.current, translationX: e.translationX, translationY: e.translationY });
    },
    [attempt],
  );

  const leftEdge = Gesture.Pan()
    .runOnJS(true)
    .hitSlop({ left: 0, width: EDGE_WIDTH })
    .onBegin((e) => { startXRef.current = e.x; })
    .onEnd(onEnd);

  const rightEdge = Gesture.Pan()
    .runOnJS(true)
    .hitSlop({ right: 0, width: EDGE_WIDTH })
    .onBegin((e) => { startXRef.current = e.x; })
    .onEnd(onEnd);

  return (
    <GestureDetector gesture={Gesture.Race(leftEdge, rightEdge)}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}
