import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { revenuecatProvider } from "@/lib/payments/revenuecat";
import { PRO_SKUS } from "@latag/licensing";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/revenuecat — RevenueCat webhook endpoint.
 *
 * Handles subscription lifecycle: trial start, monthly renewal, cancellation,
 * and expiry.  Verifies the webhook signature, then grants or updates the Pro
 * license in Supabase with the current subscription period's expiry date.
 *
 * URL configured in RC dashboard:
 *   https://latag.vercel.app/api/webhooks/revenuecat
 *
 * Subscription flow:
 *   INITIAL_PURCHASE      → trial starts (14 days) or first paid period
 *   RENEWAL               → monthly billing success, extends expires_at
 *   CANCELLATION          → user cancelled; license stays active until expires_at
 *   UNCANCELLATION        → user re-enabled auto-renew
 *   EXPIRATION            → trial/paid period ended without renewal
 *   BILLING_ISSUE         → payment failed; grace period
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const authHeader = request.headers.get("authorization");
  const signatureHeader = request.headers.get("x-revenuecat-signature");
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;

  // --- Auth -----------------------------------------------------------------
  if (signatureHeader && secret) {
    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const expected = createHmac("sha256", secret)
      .update(raw)
      .digest("base64url");
    const sig = signatureHeader.trim();
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      console.warn("[webhooks/revenuecat] invalid signature");
      return NextResponse.json({ error: "invalid-signature" }, { status: 401 });
    }
  } else {
    const verdict = await revenuecatProvider.verifyWebhook(raw, authHeader ?? null);
    if (!verdict.ok) {
      if (verdict.reason === "invalid authorization") {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ received: true });
    }
  }

  // --- Parse event ----------------------------------------------------------
  try {
    const event = JSON.parse(raw);
    const ev = event.event ?? event;
    const eventType: string = ev.type ?? "";
    const appUserId: string | undefined = ev.app_user_id;
    const productId: string | undefined = ev.product_id;
    const entitlementIds: string[] = ev.entitlement_ids ?? [];

    const isProEvent =
      entitlementIds.includes("pro") || (productId ? PRO_SKUS.includes(productId) : false);

    if (!appUserId || !isProEvent) {
      return NextResponse.json({ received: true });
    }

    const admin = createAdminSupabase();

    // Subscription period from RC event
    const expirationMs: number | undefined = ev.expiration_at_ms;
    const expiresAt = expirationMs
      ? new Date(expirationMs).toISOString()
      : null;
    const isTrial: boolean = ev.is_trial_period ?? ev.period_type === "trial";
    const resolvedSku =
      productId && PRO_SKUS.includes(productId) ? productId : PRO_SKUS[0];
    const transactionId: string =
      ev.transaction_id ?? ev.original_transaction_id ?? "rc_" + Date.now();

    switch (eventType) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "UNCANCELLATION": {
        // Determine price for payment record
        const price = isTrial ? 0 : resolvedSku === "latag-pro-yearly" ? 1799 : 199;

        // Upsert: insert if new, update if existing active license for this SKU
        const existing = await admin
          .from("licenses")
          .select("id")
          .eq("user_id", appUserId)
          .eq("sku", resolvedSku)
          .eq("status", "active")
          .maybeSingle();

        if (existing.data) {
          // Renewal — extend the expiry
          await admin
            .from("licenses")
            .update({
              status: "active",
              expires_at: expiresAt,
              granted_at: new Date().toISOString(),
            })
            .eq("id", existing.data.id);
        } else {
          // New subscription (trial or fresh paid)
          const { error: insertError } = await admin.from("licenses").insert({
            user_id: appUserId,
            sku: resolvedSku,
            status: "active",
            granted_at: new Date().toISOString(),
            expires_at: expiresAt,
          });
          if (insertError && insertError.code !== "23505") {
            console.error("[webhooks/revenuecat] insert error", insertError);
            return NextResponse.json({ error: "server-error" }, { status: 500 });
          }
        }

        // Record payment (non-critical)
        await admin
          .from("payments")
          .insert({
            user_id: appUserId,
            provider: "revenuecat",
            provider_ref: transactionId,
            amount: price,
            currency: "PHP",
            status: "paid",
          })
          .catch(() => {});

        break;
      }

      case "CANCELLATION": {
        // User cancelled — license stays active until expires_at
        // Just log that cancellation happened; no DB change needed unless
        // we want to track it.  RC will send EXPIRATION when it actually ends.
        break;
      }

      case "BILLING_ISSUE": {
        // Payment failed — mark as past_due to give visibility
        await admin
          .from("licenses")
          .update({ status: "past_due" })
          .eq("user_id", appUserId)
          .eq("sku", resolvedSku)
          .eq("status", "active");
        break;
      }

      case "EXPIRATION": {
        // Trial or paid period ended without renewal
        await admin
          .from("licenses")
          .update({ status: "expired" })
          .eq("user_id", appUserId)
          .eq("sku", resolvedSku)
          .in("status", ["active", "past_due"]);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webhooks/revenuecat] parse error", err);
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
