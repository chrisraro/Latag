import { Component, type ReactNode } from "react";
import { Platform, ScrollView, View } from "react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONT } from "../../lib/theme";
import { NATIVE_UI_ENABLED } from "../../lib/native-ui";
import { Chip } from "../ui";

/**
 * A one-of-N picker: Material 3's `SingleChoiceSegmentedButtonRow` on Android,
 * today's chip row everywhere else.
 *
 * ## Why this one is allowed to go native
 *
 * `SegmentedButton` (verified in the installed @expo/ui 57.0.4) takes a full
 * `colors` object — active/inactive container, content and border — and the
 * Compose `Text` takes `color` plus a `fontFamily` that resolves the fonts
 * expo-font already loaded. Between them the Warehouse Console tokens survive
 * intact: acid on near-black, Archivo, hairline borders. That is the bar. A
 * control that could only render stock Material purple would have stayed
 * custom (see `SearchField.tsx` for one that did).
 *
 * ## Why Android only
 *
 * The SwiftUI side ships `Picker` with `pickerStyle('segmented')`, but its
 * props are `CommonViewModifierProps` — no colours, only a `tint` modifier,
 * which on `UISegmentedControl` moves the selected-segment fill and nothing
 * else. Label colour, inactive fill and the font are all system-owned, so an
 * iOS segmented picker would sit on our black screen as a grey system chip
 * with a blue-ish selection. The chips already do the job and carry the brand,
 * so iOS keeps them.
 */

/** One choice. `value` is what the caller's state holds; `label` is what shows. */
export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedUI = typeof import("@expo/ui/jetpack-compose");

/**
 * Decides whether the native segmented row can be used, given a platform name
 * and a loader for the module. Pure and side-effect free on purpose: it is
 * exercised directly in tests instead of fighting Jest's module-load order.
 *
 * Every component in `@expo/ui/jetpack-compose` calls `requireNativeView` at
 * *import* time — if the native view manager isn't linked, the `require()`
 * throws before anything renders, so a static top-level `import` would take
 * the whole Inventory screen down. Hence the loader inside a `try`/`catch`,
 * exactly as `NativeTabBar` does it.
 */
export function resolveSegmentedUI(platform: string, loadModule: () => SegmentedUI): SegmentedUI | null {
  if (platform !== "android") return null;
  try {
    const mod = loadModule();
    const ok =
      typeof mod?.Host === "function" &&
      typeof mod?.SingleChoiceSegmentedButtonRow === "function" &&
      typeof mod?.SegmentedButton === "function" &&
      typeof mod?.Text === "function";
    return ok ? mod : null;
  } catch {
    return null;
  }
}

// Resolved once at module load — Platform.OS never changes for a running
// process, and the native side does not appear halfway through a session.
//
// Gated on NATIVE_UI_ENABLED, currently false. `SegmentedButton` is ordinary
// Material 3, not the expressive component that crash-looped the tab bar on
// 2026-07-27, and it may well be perfectly fine — but "may well be" is not
// something to find out through an OTA, which is the one channel a bricked
// device cannot roll back for itself. This ships in a native build or not at
// all; until then the chip row below is the control, exactly as before.
const segmentedUI = NATIVE_UI_ENABLED
  ? resolveSegmentedUI(Platform.OS, () => require("@expo/ui/jetpack-compose"))
  : null;

/** Anything that goes wrong *after* the module resolves — a bad prop, a native
 *  layout edge case — still must not take the filters (or the list under them)
 *  down with it. */
class SegmentedBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/** Matches the chip fallback's 44px target, so swapping between the two never
 *  moves the list underneath. */
export const SEGMENTED_HEIGHT = 44;

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers ("Status", "Sort"). */
  label: string;
}

/** Public entry point — wires the module-level capability singleton in. */
export function Segmented<T extends string>(props: SegmentedProps<T>) {
  return <SegmentedView {...props} ui={segmentedUI} />;
}

/**
 * The seam tests drive directly: `ui: null` must produce a fully working chip
 * row, and a module that resolves but explodes must land on the same chips.
 */
export function SegmentedView<T extends string>({ ui, ...props }: SegmentedProps<T> & { ui: SegmentedUI | null }) {
  const chips = <SegmentedChips {...props} />;
  if (!ui) return chips;
  return (
    <SegmentedBoundary fallback={chips}>
      <NativeSegmented {...props} ui={ui} />
    </SegmentedBoundary>
  );
}

/**
 * The fallback, and the iOS control: the same `Chip` row Inventory shipped with.
 * It scrolls because four sort labels do not fit a narrow phone side by side.
 */
function SegmentedChips<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      style={{ flexGrow: 0, height: SEGMENTED_HEIGHT }}
      contentContainerStyle={{ gap: 8, paddingRight: 4 }}
    >
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={value === o.value}
          onPress={() => { if (o.value !== value) onChange(o.value); }}
        />
      ))}
    </ScrollView>
  );
}

/**
 * `fillMaxWidth()` from @expo/ui's modifier factory, inlined. The factory
 * module is pure (it only builds `{ $type, ...params }` objects), but the whole
 * point of this file is that nothing from `@expo/ui` is reached at import time,
 * so the literal it would have produced is written out instead.
 */
const FILL_WIDTH = { $type: "fillMaxWidth" };

/** Warehouse Console on a Material 3 control. Disabled states are never used
 *  here — every segment is always tappable — so they are left to Material. */
const SEGMENT_COLORS = {
  activeContainerColor: COLORS.acid,
  activeContentColor: COLORS.acidInk,
  activeBorderColor: COLORS.acid,
  inactiveContainerColor: COLORS.surface2,
  inactiveContentColor: COLORS.inkDim,
  inactiveBorderColor: COLORS.hairline,
} as const;

function NativeSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
  ui,
}: SegmentedProps<T> & { ui: SegmentedUI }) {
  const { Host, SingleChoiceSegmentedButtonRow, SegmentedButton, Text } = ui;
  return (
    // Compose owns the semantics inside the Host (the row is a real M3
    // single-choice group), so this wrapper only names the group itself.
    <View accessibilityLabel={label} style={{ height: SEGMENTED_HEIGHT, justifyContent: "center" }}>
      <Host style={{ height: SEGMENTED_HEIGHT }}>
        <SingleChoiceSegmentedButtonRow modifiers={[FILL_WIDTH]}>
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <SegmentedButton
                key={o.value}
                selected={selected}
                colors={SEGMENT_COLORS}
                onClick={() => {
                  if (selected) return;
                  Haptics.selectionAsync();
                  onChange(o.value);
                }}
              >
                <SegmentedButton.Label>
                  <Text
                    color={selected ? COLORS.acidInk : COLORS.inkDim}
                    style={{ fontSize: 13, fontFamily: selected ? FONT.bold : FONT.medium }}
                  >
                    {o.label}
                  </Text>
                </SegmentedButton.Label>
              </SegmentedButton>
            );
          })}
        </SingleChoiceSegmentedButtonRow>
      </Host>
    </View>
  );
}
