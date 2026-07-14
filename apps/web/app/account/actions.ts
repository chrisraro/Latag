"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

type ActionResult = { error: string } | { error?: undefined };

function readEmail(input: FormData | string): string {
  const raw = typeof input === "string" ? input : input.get("email");
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Sends a 6-digit email OTP. Accepts either a FormData (from a form submit)
 * or a plain email string (used by the sign-in page's "Resend code" action,
 * which already has the email in state and has no form to read from).
 */
export async function requestOtp(formDataOrEmail: FormData | string): Promise<ActionResult> {
  const email = readEmail(formDataOrEmail);

  if (!email) {
    return { error: "Enter your email address." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}

/** Verifies the 6-digit code and, on success, redirects to /account. */
export async function verifyOtp(email: string, code: string): Promise<ActionResult> {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return { error: "Enter your email address." };
  }
  if (!/^\d{6}$/.test(code)) {
    return { error: "Enter the 6-digit code." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({
    email: trimmedEmail,
    token: code,
    type: "email",
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/account");
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
