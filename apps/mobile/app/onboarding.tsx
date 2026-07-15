import { useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONT } from "../lib/theme";
import { PrimaryButton } from "../components/ui";
import { PhotoSlot } from "../components/PhotoSlot";

const PANES = 2;

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

function ModeCard({ title, body, accent }: { title: string; body: string; accent?: boolean }) {
  return (
    <View className={`mb-3 rounded-card border p-4 ${accent ? "border-acid bg-surface1" : "border-hairline bg-surface1"}`}>
      <Text style={{ fontFamily: FONT.display }} className="text-[15px] text-ink">{title}</Text>
      <Text style={{ fontFamily: FONT.text }} className="mt-1.5 text-[13px] leading-5 text-inkdim">{body}</Text>
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

  const goToPane2 = () => scrollRef.current?.scrollTo({ x: SCREEN_WIDTH, animated: true });

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
        <View style={{ width: SCREEN_WIDTH, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }} className="flex-1 px-4">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-2">
              <Text style={{ fontFamily: FONT.display }} className="text-[24px] text-ink">How do you source?</Text>
              <Text style={{ fontFamily: FONT.text }} className="mt-1 text-[13.5px] text-inkdim">
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
              title="Selector"
              body="Cherry-pick pieces at per-item prices. Latag tracks profit piece by piece."
            />
            <ModeCard
              title="Bulto"
              body="Buy the whole bale at one fixed cost. Latag tracks capital recovery to break-even and beyond."
              accent
            />
          </View>

          <Dots active={active} />
          <PrimaryButton label="Continue" onPress={goToPane2} />
        </View>

        {/* Pane 2 — camera & privacy */}
        <View style={{ width: SCREEN_WIDTH, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }} className="flex-1 px-4">
          <Text style={{ fontFamily: FONT.display }} className="text-[24px] text-ink">Shoot it. Tag it. Sell it.</Text>
          <Text style={{ fontFamily: FONT.text }} className="mt-1 text-[13.5px] text-inkdim">
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
                title="Photos stay on your phone"
                body="Compressed and stored on-device. Nothing is ever uploaded."
              />
            </View>
          </View>

          <Dots active={active} />
          <PrimaryButton label="Start logging" onPress={() => void finishOnboarding(router)} />
        </View>
      </ScrollView>
    </View>
  );
}
