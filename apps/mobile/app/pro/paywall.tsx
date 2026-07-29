import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { db } from "../../db/client";
import { applyLicense, clearLicense } from "../../lib/license";
import { isRevenueCatConfigured, getOfferings, purchaseProduct, type RCProduct } from "../../lib/purchases";
import { FONT, COLORS } from "../../lib/theme";
import { PrimaryButton } from "../../components/ui";
import { Icon } from "../../components/Icon";

type FeatureRow = {
  icon: "Storefront" | "ShareNetwork" | "InstagramLogo" | "ShieldCheck";
  title: string;
  subtitle: string;
};

const FEATURES: FeatureRow[] = [
  {
    icon: "Storefront",
    title: "Your own shop page",
    subtitle: "Publish items buyers can browse — one link to share anywhere",
  },
  {
    icon: "ShareNetwork",
    title: "Buyer-ready inquiries",
    subtitle: "Pre-written messages land in your DMs on Facebook & Messenger",
  },
  {
    icon: "InstagramLogo",
    title: "IG drop export",
    subtitle: "Share your curated selection directly to Instagram stories",
  },
  {
    icon: "ShieldCheck",
    title: "Works offline, always",
    subtitle: "Costs, margins & inventory never leave your phone",
  },
];

/**
 * Match RC product identifiers to our local SKUs.
 * IAP identifiers use underscores (App Store convention); our backend SKUs use hyphens.
 */
const RC_ID_TO_SKU: Record<string, string> = {
  latag_pro_monthly: "latag-pro-monthly",
  latag_pro_yearly: "latag-pro-yearly",
};

/** Return the product with trial intro pricing, and its yearly comparison. */
function pickBestPair(products: RCProduct[]) {
  const monthly = products.find((p) => p.identifier === "latag_pro_monthly");
  const yearly = products.find((p) => p.identifier === "latag_pro_yearly");
  return { monthly, yearly };
}

export default function ProPaywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<RCProduct[] | null>(null);
  const [selected, setSelected] = useState<RCProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(true);

  useEffect(() => {
    if (!isRevenueCatConfigured()) {
      setLoadingOfferings(false);
      return;
    }
    (async () => {
      const offers = await getOfferings();
      if (offers && offers.length > 0) {
        setProducts(offers);
        // Pre-select yearly if available (best value)
        const yearly = offers.find((p) => p.identifier === "latag_pro_yearly");
        setSelected(yearly ?? offers[0]);
      }
      setLoadingOfferings(false);
    })();
  }, []);

  const startTrial = async () => {
    if (!selected || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);

    try {
      const result = await purchaseProduct(selected.identifier);
      if (result.kind === "success") {
        // RC SDK caches the entitlement locally — apply it immediately
        const pro = result.customerInfo.entitlements.active["pro"];
        if (pro) {
          applyLicense(db, {
            receipt: "rc_in_app",
            expiresAt: pro.expirationDate ?? null,
          });
        }
        router.back();
      } else if (result.kind === "cancelled") {
        // User dismissed the native payment sheet — just reset
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        setError(result.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setBusy(false);
    }
  };

  const { monthly, yearly } = pickBestPair(products ?? []);

  const selectedPrice = selected?.priceString ?? "";

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Pressable
          hitSlop={8}
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Icon name="X" size={22} color={COLORS.inkDim} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        className="flex-1 px-5"
      >
        {/* Hero */}
        <View className="mt-4 items-center">
          <View className="rounded-full border border-acid/40 bg-acid/10 px-4 py-1.5">
            <Text
              style={{ fontFamily: FONT.display, letterSpacing: 1.2, lineHeight: 18 }}
              className="text-[12px] uppercase text-acid"
            >
              Latag Pro
            </Text>
          </View>

          <Text
            style={{ fontFamily: FONT.displayBlack, lineHeight: 48 }}
            className="mt-5 text-center text-[40px] uppercase text-ink"
          >
            Unlock
            {"\n"}your shop
          </Text>

          <View className="mt-2 rounded-full bg-surface2 px-3 py-1">
            <Text
              style={{ fontFamily: FONT.semibold, letterSpacing: 0.6, lineHeight: 16 }}
              className="text-[11px] uppercase text-inkdim"
            >
              14 days free · Cancel anytime
            </Text>
          </View>
        </View>

        {/* Loading */}
        {loadingOfferings ? (
          <View className="mt-12 items-center gap-3">
            <ActivityIndicator color={COLORS.acid} />
            <Text style={{ fontFamily: FONT.text, lineHeight: 18 }} className="text-[13px] text-inkdim">
              Loading plans…
            </Text>
          </View>
        ) : !products || products.length === 0 ? (
          /* Not configured yet */
          <View className="mt-12 gap-4">
            <Text
              style={{ fontFamily: FONT.semibold, lineHeight: 22 }}
              className="text-center text-[15px] text-inkdim"
            >
              Subscriptions not available yet
            </Text>
            <Text
              style={{ fontFamily: FONT.text, lineHeight: 18 }}
              className="text-center text-[13px] text-inkfaint"
            >
              The in-app purchase setup is still in progress.
              Come back soon!
            </Text>
          </View>
        ) : (
          <>
            {/* Plan selector */}
            <View className="mt-8 gap-3">
              {/* Monthly card */}
              {monthly ? (
                <PlanCard
                  label="Monthly"
                  product={monthly}
                  badge={null}
                  isSelected={selected?.identifier === monthly.identifier}
                  onSelect={() => { Haptics.selectionAsync(); setSelected(monthly); }}
                />
              ) : null}

              {/* Yearly card */}
              {yearly ? (
                <PlanCard
                  label="Yearly"
                  product={yearly}
                  badge="Save 25%"
                  subText={monthly ? `₱${formatPesoAnnual(monthly.price)}/mo vs ₱${yearly.priceString}` : null}
                  isSelected={selected?.identifier === yearly.identifier}
                  onSelect={() => { Haptics.selectionAsync(); setSelected(yearly); }}
                />
              ) : null}
            </View>

            {/* Purchase CTA */}
            <View className="mt-6">
              <PrimaryButton
                label={busy ? "Processing…" : `Start 14-day free trial${selectedPrice ? ` · ${selectedPrice}` : ""}`}
                onPress={() => void startTrial()}
                disabled={busy || !selected}
              />
              <Text
                style={{ fontFamily: FONT.text, lineHeight: 16 }}
                className="mt-1 text-center text-[11px] text-inkfaint"
              >
                No charge during trial. Cancel anytime in settings.
              </Text>
            </View>

            {/* Error */}
            {error ? (
              <View className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3">
                <Text style={{ fontFamily: FONT.semibold, lineHeight: 17 }} className="text-[12px] text-danger">
                  {error}
                </Text>
              </View>
            ) : null}
          </>
        )}

        {/* Features */}
        <View className="mt-10 rounded-xl border border-hairline bg-surface1">
          {FEATURES.map((feature, i) => (
            <View
              key={feature.icon}
              className={`flex-row items-center gap-3 px-4 py-4 ${
                i < FEATURES.length - 1 ? "border-b border-hairline" : ""
              }`}
            >
              <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-surface2">
                <Icon name={feature.icon} size={18} color={COLORS.acid} />
              </View>
              <View className="flex-1">
                <Text
                  style={{ fontFamily: FONT.semibold, lineHeight: 18 }}
                  className="text-[14px] text-ink"
                  numberOfLines={1}
                >
                  {feature.title}
                </Text>
                <Text
                  style={{ fontFamily: FONT.text, lineHeight: 16 }}
                  className="mt-0.5 text-[12px] text-inkdim"
                >
                  {feature.subtitle}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View className="mt-6 items-center">
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              router.back();
            }}
            hitSlop={8}
            className="flex-row items-center gap-1.5"
          >
            <Icon name="EnvelopeSimple" size={14} color={COLORS.inkFaint} />
            <Text
              style={{ fontFamily: FONT.semibold, lineHeight: 17 }}
              className="text-[12px] text-inkfaint"
            >
              Already subscribed? Restore in Settings
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────

function PlanCard({
  label,
  product,
  badge,
  subText,
  isSelected,
  onSelect,
}: {
  label: string;
  product: RCProduct;
  badge: string | null;
  subText?: string | null;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // Extract the base price without trial messaging
  const priceDisplay = product.priceString ?? `₱${product.price.toLocaleString("en-PH")}`;
  return (
    <Pressable
      onPress={onSelect}
      className={`rounded-2xl border p-4 ${isSelected ? "border-acid" : "border-hairline"}`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              style={{ fontFamily: FONT.display, lineHeight: 22 }}
              className="text-[16px] uppercase text-ink"
            >
              {label}
            </Text>
            {badge ? (
              <View className="rounded-full bg-acid/15 px-2.5 py-0.5">
                <Text
                  style={{ fontFamily: FONT.semibold, letterSpacing: 0.5, lineHeight: 14 }}
                  className="text-[10px] text-acid"
                >
                  {badge}
                </Text>
              </View>
            ) : null}
          </View>
          <View className="mt-1 flex-row items-baseline gap-1">
            <Text
              style={{ fontFamily: FONT.display, lineHeight: 28, fontVariant: ["tabular-nums"] }}
              className="text-[24px] text-ink"
            >
              {priceDisplay}
            </Text>
            <Text style={{ fontFamily: FONT.semibold, lineHeight: 18 }} className="text-[13px] text-inkdim">
              {product.introPrice ? "then " : ""}/{label.toLowerCase()}
            </Text>
          </View>
          {subText ? (
            <Text
              style={{ fontFamily: FONT.text, lineHeight: 16 }}
              className="mt-0.5 text-[11px] text-inkfaint"
            >
              {subText}
            </Text>
          ) : null}
        </View>
        {/* Radio dot */}
        <View
          className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
            isSelected ? "border-acid" : "border-hairline"
          }`}
        >
          {isSelected ? <View className="h-2.5 w-2.5 rounded-full bg-acid" /> : null}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatPesoAnnual(monthlyPrice: number): string {
  return (monthlyPrice * 12).toLocaleString("en-PH");
}
