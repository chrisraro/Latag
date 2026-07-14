"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin-gate";

type ActionResult = { error: string } | { error?: undefined };

const PRO_SKU = "latag-pro-lifetime";

const FEEDBACK_STATUSES = ["new", "reviewed", "done"] as const;
type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

// Supabase auth user ids are v4 UUIDs — "uuid-ish" validation, not a strict
// version check, since the format is stable across the ids we ever pass in.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FLAG_KEY_RE = /^[a-z0-9_-]{1,64}$/;

function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

/**
 * Every admin action re-verifies the caller is an admin from scratch — the
 * page-level gate (`notFound()` in page.tsx) only hides the UI. Actions are
 * directly callable endpoints and must not trust that a form only renders
 * for admins; a forged request must be rejected here too.
 */
async function requireAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminEmail(user?.email, process.env.ADMIN_EMAILS);
}

/**
 * Grants the Pro lifetime license. Idempotent: the partial unique index
 * (`user_id, sku` where `status = 'active'`) means a second grant for an
 * already-active license conflicts on insert — Postgres error 23505 is
 * treated as success rather than surfaced as a failure.
 */
export async function grantPro(userId: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "forbidden" };
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return { error: "invalid user id" };

  const admin = createAdminSupabase();
  const { error } = await admin
    .from("licenses")
    .insert({ user_id: userId, sku: PRO_SKU, status: "active" });

  if (error && error.code !== "23505") {
    return { error: error.message };
  }

  revalidatePath("/admin");
  return {};
}

/** Revokes any active Pro license row(s) for the user (normally exactly one). */
export async function revokePro(userId: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "forbidden" };
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return { error: "invalid user id" };

  const admin = createAdminSupabase();
  const { error } = await admin
    .from("licenses")
    .update({ status: "revoked" })
    .eq("user_id", userId)
    .eq("sku", PRO_SKU)
    .eq("status", "active");

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}

export async function updatePrice(sku: string, price: number): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "forbidden" };
  if (typeof sku !== "string" || sku.length < 1 || sku.length > 100) return { error: "invalid sku" };
  if (typeof price !== "number" || !Number.isInteger(price) || price < 1) {
    return { error: "price must be a whole number ≥ 1" };
  }

  const admin = createAdminSupabase();
  const { error } = await admin.from("pricing").update({ price }).eq("sku", sku);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}

export async function setFeedbackStatus(id: string, status: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "forbidden" };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: "invalid id" };
  if (!isFeedbackStatus(status)) return { error: "invalid status" };

  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback").update({ status }).eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}

export async function setFlag(key: string, enabled: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "forbidden" };
  if (typeof key !== "string" || !FLAG_KEY_RE.test(key)) return { error: "invalid key" };
  if (typeof enabled !== "boolean") return { error: "invalid value" };

  const admin = createAdminSupabase();
  const { error } = await admin.from("feature_flags").update({ enabled }).eq("key", key);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}

export async function addFlag(key: string, notes: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "forbidden" };
  if (typeof key !== "string" || !FLAG_KEY_RE.test(key)) {
    return { error: "key must be 1-64 lowercase letters, numbers, - or _" };
  }
  const trimmedNotes = typeof notes === "string" ? notes.trim().slice(0, 500) : "";

  const admin = createAdminSupabase();
  const { error } = await admin
    .from("feature_flags")
    .insert({ key, notes: trimmedNotes.length > 0 ? trimmedNotes : null, enabled: false });

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}
