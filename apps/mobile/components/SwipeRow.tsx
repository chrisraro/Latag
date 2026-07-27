import { Component, type ComponentType, type ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONT } from "../lib/theme";
import { SWIPE_ACTION_WIDTH, type SwipeAction } from "../lib/swipe-actions";
import { NATIVE_ANIMATION_ENABLED } from "../lib/native-ui";
import { Icon } from "./Icon";

/**
 * A row you can drag sideways to reveal one action per side.
 *
 * The gesture is a shortcut, never the only way to do something: every action
 * offered here also exists on the item's own screen. That is deliberate — if
 * the native gesture layer is missing the row still renders and the app still
 * works, it just stops being fast.
 */

/** What the row's owner hands us: an action from `lib/swipe-actions` plus the doing. */
export type SwipeBinding<K extends string = string> = SwipeAction<K> & { onPress: () => void };

/**
 * `ReanimatedSwipeable` is NOT re-exported from `react-native-gesture-handler`'s
 * index in 2.32 — only the legacy, deprecated `Swipeable` is. It lives behind
 * the `react-native-gesture-handler/ReanimatedSwipeable` subpath, and requiring
 * it pulls in Reanimated, which touches the worklets native module at *import*
 * time. Under Jest (and on any build where the native side is missing) that
 * throws before a single component renders, so the require is guarded exactly
 * like `@expo/ui` is in `NativeTabBar` — resolve once, fall back forever.
 *
 * Exported so the resolution rule can be tested directly instead of fighting
 * Jest's module-load order.
 */
export function resolveSwipeable(load: () => unknown): ComponentType<SwipeableProps> | null {
  try {
    const mod = load() as { default?: unknown } | undefined;
    const Cmp = mod?.default ?? mod;
    // A plain function, or a React element type object (`ReanimatedSwipeable`
    // is a `forwardRef`, so it is an object carrying `$$typeof`). Anything else
    // — an empty module, a half-linked one — is treated as absent.
    const usable = typeof Cmp === "function" || (typeof Cmp === "object" && Cmp !== null && "$$typeof" in Cmp);
    return usable ? (Cmp as ComponentType<SwipeableProps>) : null;
  } catch {
    return null;
  }
}

/** The slice of `SwipeableProps` this component actually uses. */
type SwipeableMethods = { close: () => void };
type RenderActions = (progress: unknown, translation: unknown, methods: SwipeableMethods) => ReactNode;
type SwipeableProps = {
  friction?: number;
  enabled?: boolean;
  overshootLeft?: boolean;
  overshootRight?: boolean;
  leftThreshold?: number;
  rightThreshold?: number;
  animationOptions?: Record<string, unknown>;
  containerStyle?: StyleProp<ViewStyle>;
  childrenContainerStyle?: StyleProp<ViewStyle>;
  renderLeftActions?: RenderActions;
  renderRightActions?: RenderActions;
  onSwipeableWillOpen?: (direction: string) => void;
  children?: ReactNode;
};

// Resolved once at module load: the native side does not appear halfway through
// a session, so re-resolving per render would only cost frames.
//
// Gated on NATIVE_ANIMATION_ENABLED, currently false. `ReanimatedSwipeable` is
// gesture-handler's reanimated-backed variant, so it runs worklets — the same
// runtime, and the same never-yet-executed-on-device risk, as lib/motion.ts.
// With the gate off every row renders through the plain fallback below; each
// action a swipe would have offered is still reachable from the item screen.
const Swipeable = NATIVE_ANIMATION_ENABLED
  ? resolveSwipeable(() => require("react-native-gesture-handler/ReanimatedSwipeable"))
  : null;

/**
 * Anything that goes wrong *after* the module resolves — a gesture-handler
 * runtime edge case, a bad layout — must not take a whole list down with it.
 * The fallback is the row itself, unswipeable.
 */
class SwipeBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/**
 * Springs, not linear ramps — a row that eases back on a curve reads as a thing
 * with weight. Damping is high enough that it settles without wobbling under a
 * list of sixty rows.
 */
const SPRING = { damping: 22, stiffness: 260, mass: 0.7 } as const;

/**
 * How far you have to drag before releasing latches the panel open. Two thirds
 * of a panel: a flick opens it, a nudge while scrolling does not.
 */
const THRESHOLD = Math.round(SWIPE_ACTION_WIDTH * 0.66);

function ActionPanel({
  action,
  close,
  radius,
}: {
  action: SwipeBinding;
  close: () => void;
  radius: number;
}) {
  const danger = action.tone === "danger";
  const bg = danger ? COLORS.danger : COLORS.acid;
  const fg = danger ? COLORS.ink : COLORS.acidInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={() => {
        // Close first: the action may open a confirm dialog or push a screen,
        // and a row left hanging open behind either one reads as a stuck row.
        close();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        action.onPress();
      }}
      style={{ width: SWIPE_ACTION_WIDTH, backgroundColor: bg, borderRadius: radius }}
      className="items-center justify-center gap-1.5"
    >
      <Icon name={action.icon} size={18} color={fg} />
      <Text
        style={{ fontFamily: FONT.display, letterSpacing: 0.36, color: fg, lineHeight: 14 }}
        className="text-[10.5px] uppercase"
        numberOfLines={1}
      >
        {action.label}
      </Text>
    </Pressable>
  );
}

export type SwipeRowProps<K extends string> = {
  /** Straight from `itemSwipeActions` / `batchSwipeActions`, with handlers bound. */
  actions: readonly SwipeBinding<K>[];
  children: ReactNode;
  /**
   * Fill painted behind the row's content. The content slides *over* the action
   * panels, so a transparent row would show them through it the whole way.
   */
  background?: string;
  /** Rounds the action panels to match a card's corners. */
  radius?: number;
  /** Outer container — carries the row's own margins so the panels match its height. */
  style?: StyleProp<ViewStyle>;
};

export function SwipeRow<K extends string>({ actions, children, background = COLORS.bg, radius = 0, style }: SwipeRowProps<K>) {
  const left = actions.find((a) => a.side === "left");
  const right = actions.find((a) => a.side === "right");
  const plain = <View style={style}>{children}</View>;

  // No native gesture layer, or nothing to reveal: the row is just a row.
  if (!Swipeable || (!left && !right)) return plain;

  const panel = (action: SwipeBinding<K>) => (methods: SwipeableMethods) => (
    <ActionPanel action={action} close={() => methods.close()} radius={radius} />
  );

  return (
    <SwipeBoundary fallback={plain}>
      <Swipeable
        friction={2}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={THRESHOLD}
        rightThreshold={THRESHOLD}
        animationOptions={SPRING}
        containerStyle={[{ overflow: "hidden", borderRadius: radius }, style]}
        childrenContainerStyle={{ backgroundColor: background, borderRadius: radius }}
        onSwipeableWillOpen={() => Haptics.selectionAsync()}
        renderLeftActions={left ? (_p, _t, m) => panel(left)(m) : undefined}
        renderRightActions={right ? (_p, _t, m) => panel(right)(m) : undefined}
      >
        {children}
      </Swipeable>
    </SwipeBoundary>
  );
}
