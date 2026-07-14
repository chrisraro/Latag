import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { supabase } from "../../lib/supabase";
import { completeSignIn } from "../../lib/auth-complete";
import { showError } from "../../lib/toast";
import { FONT } from "../../lib/theme";
import { FieldLabel, PrimaryButton } from "../../components/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_RE = /^\d{6}$/;

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false); // double-tap guard
  const [verifying, setVerifying] = useState(false); // double-tap guard
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sendEmail = async () => {
    if (sending) return;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setErrorMsg("Enter a valid email address.");
      showError("Enter a valid email address");
      return;
    }
    setErrorMsg(null);
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: true, emailRedirectTo: "latag://auth/callback" },
      });
      if (error) {
        setErrorMsg(error.message);
        showError(error.message);
        return;
      }
      setStep("code");
    } catch {
      setErrorMsg("Couldn't send the email — check your connection and try again.");
      showError("Couldn't send the email — check your connection and try again");
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (verifying) return;
    const trimmed = code.trim();
    if (!CODE_RE.test(trimmed)) {
      setErrorMsg("Enter the 6-digit code from your email.");
      showError("Enter the 6-digit code from your email");
      return;
    }
    setErrorMsg(null);
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: trimmed, type: "email" });
      if (error) {
        setErrorMsg(error.message);
        showError(error.message);
        return;
      }
      await completeSignIn(router);
    } catch {
      setErrorMsg("Couldn't verify the code — check your connection and try again.");
      showError("Couldn't verify the code — check your connection and try again");
    } finally {
      setVerifying(false);
    }
  };

  const useDifferentEmail = () => {
    Haptics.selectionAsync();
    setStep("email");
    setCode("");
    setErrorMsg(null);
  };

  const resend = () => {
    Haptics.selectionAsync();
    void sendEmail();
  };

  const inputCls = "mb-2.5 h-13 rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px] text-ink";

  return (
    <View className="flex-1 bg-surface1 px-4" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }}>
      <View className="mb-3 h-1 w-11 self-center rounded-full bg-hairline" />
      <Text style={{ fontFamily: FONT.display }} className="text-[19px] text-ink">Sign In</Text>

      {step === "email" ? (
        <>
          <Text style={{ fontFamily: FONT.text }} className="mb-3 mt-0.5 text-[12.5px] text-inkdim">
            We'll email you a sign-in link — no password needed.
          </Text>
          <FieldLabel>Email</FieldLabel>
          <TextInput
            value={email}
            onChangeText={(v) => { setEmail(v); setErrorMsg(null); }}
            placeholder="you@example.com"
            placeholderTextColor="#8A8A8A"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={{ fontFamily: FONT.text }}
            className={inputCls}
          />
          {errorMsg ? (
            <Text style={{ fontFamily: FONT.text }} className="mb-2 text-[12.5px] text-danger">{errorMsg}</Text>
          ) : null}
          <PrimaryButton label="Send link + code" onPress={() => void sendEmail()} disabled={sending || !email.trim()} />
        </>
      ) : (
        <>
          <Text style={{ fontFamily: FONT.text }} className="mb-3 mt-0.5 text-[12.5px] leading-5 text-inkdim">
            Tap the sign-in link we emailed to {email.trim()} — or enter the code below if your email shows one.
          </Text>
          <FieldLabel>6-digit code</FieldLabel>
          <TextInput
            value={code}
            onChangeText={(v) => { setCode(v.replace(/[^0-9]/g, "").slice(0, 6)); setErrorMsg(null); }}
            placeholder="000000"
            placeholderTextColor="#8A8A8A"
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            style={{ fontFamily: FONT.displayBlack, letterSpacing: 10 }}
            className="mb-2.5 h-16 rounded-[14px] border border-hairline bg-surface2 px-4 text-center text-[28px] text-ink"
          />
          {errorMsg ? (
            <Text style={{ fontFamily: FONT.text }} className="mb-2 text-[12.5px] text-danger">{errorMsg}</Text>
          ) : null}
          <PrimaryButton label="Verify" onPress={() => void verifyCode()} disabled={verifying || code.trim().length !== 6} />
          <View className="mt-2 flex-row justify-center gap-6">
            <Pressable hitSlop={8} onPress={resend} disabled={sending}>
              <Text style={{ fontFamily: FONT.semibold }} className="text-[12.5px] text-inkdim">Resend</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={useDifferentEmail}>
              <Text style={{ fontFamily: FONT.semibold }} className="text-[12.5px] text-inkdim">Use a different email</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
