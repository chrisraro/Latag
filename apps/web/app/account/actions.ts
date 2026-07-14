"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

type ActionResult = { error: string } | { error?: undefined };

const FEEDBACK_TYPES = ["feedback", "suggestion", "feature_request"] as const;
type FeedbackType = (typeof FEEDBACK_TYPES)[number];

function isFeedbackType(value: unknown): value is FeedbackType {
  return typeof value === "string" && (FEEDBACK_TYPES as readonly string[]).includes(value);
}

function readEmail(input: FormData | string): string {
  const raw = typeof input === "string" ? input : input.get("email");
  return typeof raw === "string" ? raw.trim() : "";
}

// Server actions are directly callable endpoints — validate shape here, not
// just in the browser. Deliberately loose (local@domain.tld); Supabase does
// the authoritative validation.
function isEmailShaped(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

/**
 * Sends a 6-digit email OTP. Accepts either a FormData (from a form submit)
 * or a plain email string (used by the sign-in page's "Resend code" action,
 * which already has the email in state and has no form to read from).
 */
export async function requestOtp(formDataOrEmail: FormData | string): Promise<ActionResult> {
  const email = readEmail(formDataOrEmail);

  if (!isEmailShaped(email)) {
    return { error: "Enter a valid email address." };
  }

  // The emailed link must land back on THIS deployment (prod or localhost).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${proto}://${host}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}

/** Verifies the 6-digit code and, on success, redirects to /account. */
export async function verifyOtp(email: string, code: string): Promise<ActionResult> {
  const trimmedEmail = email.trim();

  if (!isEmailShaped(trimmedEmail)) {
    return { error: "Enter a valid email address." };
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

type FeedbackResult = { error: string } | { ok: true };

/**
 * Inserts a feedback row via the cookie-scoped server client — RLS's
 * "own feedback insert" with-check (`auth.uid() = user_id`) is the
 * authoritative guard against a caller spoofing another user's id.
 */
export async function submitFeedback(formData: FormData): Promise<FeedbackResult> {
  const type = formData.get("type");
  const bodyRaw = formData.get("body");
  const body = typeof bodyRaw === "string" ? bodyRaw.trim() : "";

  if (!isFeedbackType(type)) {
    return { error: "Choose a feedback type." };
  }
  if (body.length < 1 || body.length > 4000) {
    return { error: "Feedback must be 1–4000 characters." };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in to send feedback." };
  }

  const { error } = await supabase.from("feedback").insert({ user_id: user.id, type, body });
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/account");
  return { ok: true };
}

/**
 * Deletes the signed-in user's auth account (service-role client — this
 * bypasses RLS by design, since a user can never delete themselves via the
 * anon-key client). The `profiles` FK is `on delete cascade`; `feedback`'s
 * `user_id` FK is `on delete set null`, so past feedback rows survive.
 *
 * No try/catch around the redirect: `redirect()` throws a control-flow
 * signal internally, and swallowing it here would strand the user on a
 * half-deleted account instead of sending them home.
 */
export async function deleteAccount(): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in to delete your account." };
  }

  const admin = createAdminSupabase();

  // Privacy page promises deletion removes "any feedback you sent us".
  // MUST run BEFORE deleteUser: the feedback FK is `on delete set null`,
  // so after deletion the rows would be anonymized and unfindable.
  const { error: feedbackError } = await admin.from("feedback").delete().eq("user_id", user.id);
  if (feedbackError) {
    return { error: feedbackError.message };
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return { error: error.message };
  }

  await supabase.auth.signOut();
  redirect("/");
}
