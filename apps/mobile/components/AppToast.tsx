import { Pressable, Text, View } from "react-native";
import Toast, { type ToastConfig } from "react-native-toast-message";
import { FONT } from "../lib/theme";

function ToastCard({ text1, tone, onPress }: { text1?: string; tone: "success" | "error"; onPress?: () => void }) {
  const card = (
    <View className="mx-6 w-[85%] flex-row items-center gap-2.5 rounded-card border border-hairline bg-surface2 px-4 py-3">
      <Text style={{ fontFamily: FONT.bold }} className={`text-[15px] ${tone === "success" ? "text-acid" : "text-danger"}`}>
        {tone === "success" ? "✓" : "!"}
      </Text>
      <Text style={{ fontFamily: FONT.semibold }} className="flex-1 text-[14px] text-ink" numberOfLines={2}>
        {text1}
      </Text>
    </View>
  );
  // Actionable toasts (e.g. "Update ready — tap here to restart") must actually
  // be tappable; Toast.show({ onPress }) reaches custom renderers via props.
  return onPress ? <Pressable onPress={onPress}>{card}</Pressable> : card;
}

const toastConfig: ToastConfig = {
  success: ({ text1, onPress }) => <ToastCard text1={text1} tone="success" onPress={onPress} />,
  error: ({ text1, onPress }) => <ToastCard text1={text1} tone="error" onPress={onPress} />,
};

/** Mounted once at the root, above the Stack. */
export function AppToast() {
  return <Toast config={toastConfig} position="bottom" bottomOffset={104} visibilityTime={2200} />;
}
