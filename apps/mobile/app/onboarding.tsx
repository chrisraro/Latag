import { useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// Legacy entry keeps parity with lib/albums — the v57 main-entry classic API is deprecated.
import * as MediaLibrary from "expo-media-library/legacy";
import * as Location from "expo-location";
import { FONT, COLORS } from "../lib/theme";
import { ensureNotifPermission } from "../lib/notifications";
import { PrimaryButton } from "../components/ui";
import { PhotoSlot } from "../components/PhotoSlot";
import { Icon, type IconName } from "../components/Icon";

const PANES = 3;

/** Sets the first-run flags and lands on the sessions list. Shared by both exits (Skip and Start logging). */
async function finishOnboarding(router: ReturnType<typeof useRouter>) {
  // Navigate even if the flag writes fail — worst case, onboarding shows again.
  // Also sets `latag.welcomed` — covers users who reach onboarding directly
  // (pre-welcome-era navigation, or the "start offline" welcome exit already
  // set it) so the welcome screen never reappears after this point.
  await AsyncStorage.multiSet([
    ["latag.onboarded", "1"],
    ["latag.welcomed", "1"],
  ]).catch(() => {});
  router.replace("/");
}

function Dots({ active }: { active: number }) {
  return (
    <View className="mb-3 flex-row items-center justify-center gap-2">
      {Array.from({ length: PANES }).map((_, idx) => (
        <View key={idx} className={`h-2 rounded-full ${idx === active ? "w-6 bg-acid" : "w-2 bg-hairline"}`} />
      ))}
    </View>
  );
}

/** Mockup .obcard: radius 14, gap 14 items-start, 44px icon tile (surface2, acid icon), title 16px display, body 13px inkdim lh19.
 * Spacing polish pass: padding 16→18 and title→body gap 3→6 for breathing room. */
function ModeCard({ icon, title, body, accent }: { icon: IconName; title: string; body: string; accent?: boolean }) {
  return (
    <View
      style={{ borderRadius: 14 }}
      className={`mb-3 flex-row items-start gap-3.5 border bg-surface1 p-[18px] ${accent ? "border-acid" : "border-hairline"}`}
    >
      <View className="h-11 w-11 flex-none items-center justify-center rounded-xl bg-surface2">
        <Icon name={icon} size={24} color={COLORS.acid} />
      </View>
      <View className="flex-1">
        <Text style={{ fontFamily: FONT.display }} className="text-[16px] text-ink">{title}</Text>
        <Text style={{ fontFamily: FONT.text }} className="mt-1.5 text-[13px] leading-[19px] text-inkdim">{body}</Text>
      </View>
    </View>
  );
}

/** Obcard-style permission row: icon tile + copy + right-side "Allow" chip that
 *  fires the real OS prompt. Grant flips the chip to an acid "Granted ✓" state;
 *  deny leaves it tappable for a retry. `request` never needs to throw-guard —
 *  the row swallows failures and simply stays un-granted. */
function PermissionRow({ icon, title, body, request }: { icon: IconName; title: string; body: string; request: () => Promise<boolean> }) {
  const [granted, setGranted] = useState(false);
  const busy = useRef(false);

  const onAllow = async () => {
    if (busy.current || granted) return;
    busy.current = true;
    try {
      if (await request()) setGranted(true);
    } catch {
      // Denied/errored prompts leave the chip in "Allow" — user can retry.
    } finally {
      busy.current = false;
    }
  };

  return (
    <View
      style={{ borderRadius: 14 }}
      className="mb-3 flex-row items-center gap-3.5 border border-hairline bg-surface1 p-[18px]"
    >
      <View className="h-11 w-11 flex-none items-center justify-center rounded-xl bg-surface2">
        <Icon name={icon} size={24} color={COLORS.acid} />
      </View>
      <View className="flex-1">
        <Text style={{ fontFamily: FONT.display }} className="text-[16px] text-ink">{title}</Text>
        <Text style={{ fontFamily: FONT.text }} className="mt-1.5 text-[13px] leading-[19px] text-inkdim">{body}</Text>
      </View>
      <Pressable
        hitSlop={8}
        disabled={granted}
        onPress={() => void onAllow()}
        accessibilityRole="button"
        accessibilityLabel={granted ? `${title} permission granted` : `Allow ${title.toLowerCase()} permission`}
        accessibilityState={{ disabled: granted }}
        className={`h-9 flex-none items-center justify-center rounded-full px-3.5 ${granted ? "bg-acid" : "border border-hairline bg-surface2"}`}
      >
        <Text style={{ fontFamily: FONT.semibold }} className={`text-[12px] ${granted ? "text-acidink" : "text-ink"}`}>
          {granted ? "Granted ✓" : "Allow"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);
  // Reactive: pane math survives rotation, split-screen, and foldable resizes.
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  const goToPane = (idx: number) => scrollRef.current?.scrollTo({ x: SCREEN_WIDTH * idx, animated: true });

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActive(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
  };

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
      >
        {/* Pane 1 — modes */}
        <View style={{ width: SCREEN_WIDTH, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }} className="flex-1 px-5">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-2">
              <Text style={{ fontFamily: FONT.display }} className="text-[24px] text-ink">How do you source?</Text>
              <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="mt-1.5 text-[13.5px] text-inkdim">
                You pick per session — run both styles anytime.
              </Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={() => void finishOnboarding(router)}
              className="h-11 items-center justify-center px-2"
            >
              <Text style={{ fontFamily: FONT.semibold }} className="text-[13px] text-inkfaint">Skip</Text>
            </Pressable>
          </View>

          <View className="flex-1 justify-center">
            <ModeCard
              icon="Target"
              title="Selector"
              body="Cherry-pick pieces at per-item prices. Latag tracks profit piece by piece."
            />
            <ModeCard
              icon="Package"
              title="Bulto"
              body="Buy the whole bale at one fixed cost. Latag tracks capital recovery to break-even and beyond."
              accent
            />
          </View>

          <Dots active={active} />
          <PrimaryButton label="Continue" onPress={() => goToPane(1)} />
        </View>

        {/* Pane 2 — camera & privacy */}
        <View style={{ width: SCREEN_WIDTH, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }} className="flex-1 px-5">
          <Text style={{ fontFamily: FONT.display }} className="text-[24px] text-ink">Shoot it. Tag it. Sell it.</Text>
          <Text style={{ fontFamily: FONT.text, lineHeight: 19 }} className="mt-1.5 text-[13.5px] text-inkdim">
            Four angles per piece — buyers claim faster when they see the flaws too.
          </Text>

          <View className="flex-1 justify-center">
            <View className="flex-row gap-2">
              <PhotoSlot label="FRONT" uri={null} onPress={() => {}} />
              <PhotoSlot label="BACK" uri={null} onPress={() => {}} />
              <PhotoSlot label="TAG" uri={null} onPress={() => {}} />
              <PhotoSlot label="FLAW" uri={null} onPress={() => {}} />
            </View>
            <View className="mt-4">
              <ModeCard
                icon="ShieldCheck"
                title="Photos stay on your phone"
                body="Compressed and stored on-device. Nothing is ever uploaded."
              />
            </View>
          </View>

          <Dots active={active} />
          <PrimaryButton label="Continue" onPress={() => goToPane(2)} />
        </View>

        {/* Pane 3 — permissions */}
        <View style={{ width: SCREEN_WIDTH, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }} className="flex-1 px-5">
          <Text style={{ fontFamily: FONT.display }} className="text-[24px] text-ink">Latag asks only when needed</Text>

          <View className="flex-1 justify-center">
            <PermissionRow
              icon="Images"
              title="Photos"
              body="Save listing photos to your gallery"
              request={async () => (await MediaLibrary.requestPermissionsAsync(false)).granted}
            />
            <PermissionRow
              icon="Bell"
              title="Notifications"
              body="Session reminders that ring like an alarm"
              request={ensureNotifPermission}
            />
            <PermissionRow
              icon="MapPin"
              title="Location"
              body="Pin sessions on the map"
              request={async () => (await Location.requestForegroundPermissionsAsync()).granted}
            />
            <Text style={{ fontFamily: FONT.text, lineHeight: 17 }} className="mt-1 text-center text-[12px] text-inkfaint">
              All optional — Latag asks again only when a feature needs it.
            </Text>
          </View>

          <Dots active={active} />
          <PrimaryButton label="Start logging" onPress={() => void finishOnboarding(router)} />
        </View>
      </ScrollView>
    </View>
  );
}
