import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { supabase } from "../../lib/supabase";
import { completeSignIn } from "../../lib/auth-complete";
import { setWelcomed } from "../../lib/first-run";
import { showError } from "../../lib/toast";
import { FONT, COLORS } from "../../lib/theme";
import { formatCountdown } from "../../lib/format";
import { FieldLabel, PrimaryButton } from "../../components/ui";
import { AppHead } from "../../components/AppHead";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_RE = /^\d{6}$/;
const RESEND_SECONDS = 45;

/** Mockup .otp: 6 boxes driven by one invisible TextInput; the box at the cursor position gets the acid border. */
function OtpBoxes({ code }: { code: string }) {
  return (
    <View className="flex-row gap-2">
      {Array.from({ length: 6 }).map((_, i) => {
        const digit = code[i] ?? "";
        const active = i === code.length && code.length < 6;
        return (
          <View
            key={i}
            style={{ aspectRatio: 0.86, borderRadius: 12 }}
            className={`flex-1 items-center justify-center border bg-surface2 ${active ? "border-acid" : "border-hairline"}`}
          >
            <Text style={{ fontFamily: FONT.display }} className="text-[24px] text-ink">{digit}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false); // double-tap guard
  const [verifying, setVerifying] = useState(false); // double-tap guard
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resendKey, setResendKey] = useState(0);

  // Resend countdown: restarts whenever the code step is (re)entered or resend is tapped.
  // No drift-critical precision needed — a fresh 1s interval per (re)start is enough.
  useEffect(() => {
    if (step !== "code") return;
    setSecondsLeft(RESEND_SECONDS);
    const id = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [step, resendKey]);

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
      const signedIn = await completeSignIn(router);
      if (signedIn) await setWelcomed();
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
    if (sending || secondsLeft > 0) return;
    Haptics.selectionAsync();
    setResendKey((k) => k + 1);
    void sendEmail();
  };

  const inputCls = "mb-2.5 h-13 rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px] text-ink";

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 4 }}>
      <AppHead
        title={step === "email" ? "Sign in" : "Enter code"}
        onBack={step === "email" ? () => router.back() : useDifferentEmail}
      />

      {step === "email" ? (
        <>
          <Text style={{ fontFamily: FONT.text }} className="mb-[18px] mt-1 text-[13.5px] text-inkdim">
            We'll email you a sign-in link — no password needed.
          </Text>
          <FieldLabel>Email</FieldLabel>
          <TextInput
            value={email}
            onChangeText={(v) => { setEmail(v); setErrorMsg(null); }}
            placeholder="you@example.com"
            placeholderTextColor={COLORS.inkFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={{ fontFamily: FONT.text }}
            className={inputCls}
          />
          {errorMsg ? (
            <Text style={{ fontFamily: FONT.text }} className="mb-2 text-[12.5px] text-danger">{errorMsg}</Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <PrimaryButton label="Send link + code" onPress={() => void sendEmail()} disabled={sending || !email.trim()} />
        </>
      ) : (
        <>
          <Text style={{ fontFamily: FONT.text }} className="mb-[18px] mt-1 text-[13.5px] leading-5 text-inkdim">
            We sent a 6-digit code to{" "}
            <Text style={{ fontFamily: FONT.semibold }} className="text-ink">{email.trim()}</Text>
          </Text>

          <View className="relative">
            <OtpBoxes code={code} />
            <TextInput
              value={code}
              onChangeText={(v) => { setCode(v.replace(/[^0-9]/g, "").slice(0, 6)); setErrorMsg(null); }}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoFocus
              caretHidden
              style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: 0 }}
            />
          </View>

          {errorMsg ? (
            <Text style={{ fontFamily: FONT.text }} className="mt-2 text-[12.5px] text-danger">{errorMsg}</Text>
          ) : null}

          <View className="mt-[14px] items-center">
            <Text style={{ fontFamily: FONT.text }} className="text-[12.5px] text-inkfaint">
              {secondsLeft > 0 ? (
                <>Didn't get it? Resend in {formatCountdown(secondsLeft)}</>
              ) : (
                <>
                  Didn't get it?{" "}
                  <Text onPress={resend} style={{ fontFamily: FONT.semibold }} className="text-inkdim">Resend</Text>
                </>
              )}
            </Text>
          </View>

          <Pressable hitSlop={8} onPress={useDifferentEmail} className="mt-2 items-center">
            <Text style={{ fontFamily: FONT.semibold }} className="text-[12.5px] text-inkdim">Use a different email</Text>
          </Pressable>

          <View style={{ flex: 1 }} />
          <PrimaryButton label="Verify" onPress={() => void verifyCode()} disabled={verifying || code.trim().length !== 6} />
          <Text style={{ fontFamily: FONT.text }} className="mb-2 text-center text-[11.5px] text-inkfaint">
            After this, Latag never asks for a connection again.
          </Text>
        </>
      )}
    </View>
  );
}
