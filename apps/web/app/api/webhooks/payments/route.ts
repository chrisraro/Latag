import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { revenuecatProvider } from "@/lib/payments/revenuecat";

export const dynamic = "force-dynamic";

const PRO_SKU = "latag-pro-monthly";

/**
 * POST /api/webhooks/payments — payment webhook seam.
 *
 * Originally designed as a provider-agnostic endpoint, now wired to the
 * RevenueCat adapter. RevenueCat also has a dedicated endpoint at
 * `/api/webhooks/revenuecat` (the URL you configure in the RC dashboard),
 * but this route stays for backward compatibility and testing.
 *
 * Both routes grant licenses the same way — this one delegates to the
 * PaymentProvider interface and handles the grant inline.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const authHeader = request.headers.get("authorization");
  const signatureHeader = request.headers.get("x-revenuecat-signature");

  // RevenueCat can authenticate via Authorization header or HMAC signature
  let verdict;

  if (signatureHeader && process.env.REVENUECAT_WEBHOOK_SECRET) {
    // HMAC-SHA256 verification of the raw body
    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const expected = createHmac("sha256", process.env.REVENUECAT_WEBHOOK_SECRET)
      .update(raw)
      .digest("base64url");
    const sig = signatureHeader.trim();
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "invalid-signature" }, { status: 401 });
    }
    // Parse event directly (skip provider for HMAC path)
    try {
      const event = JSON.parse(raw);
      const ev = event.event ?? event;
      const eventType: string = ev.type ?? "";
      const appUserId = ev.app_user_id;
      const entitlementIds: string[] = ev.entitlement_ids ?? [];
      const productId = ev.product_id;
      const transactionId = ev.transaction_id ?? ev.original_transaction_id ?? "rc_" + Date.now();
      const isPro = entitlementIds.includes("pro") || productId === PRO_SKU;

      if (!appUserId || !isPro) {
        return NextResponse.json({ received: true });
      }

      const admin = createAdminSupabase();

      if (["NON_RENEWING_PURCHASE", "INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION"].includes(eventType)) {
        const { error: insertError } = await admin.from("licenses").insert({
          user_id: appUserId,
          sku: PRO_SKU,
          status: "active",
          granted_at: new Date().toISOString(),
        });
        if (insertError && insertError.code !== "23505") {
          console.error("[webhooks/payments] insert error", insertError);
        }
        await admin.from("payments").insert({
          user_id: appUserId,
          provider: "revenuecat",
          provider_ref: transactionId,
          amount: 499,
          currency: "PHP",
          status: "paid",
        }).catch(() => {});
      } else if (["CANCELLATION", "BILLING_ISSUE", "EXPIRATION"].includes(eventType)) {
        await admin
          .from("licenses")
          .update({ status: "revoked" })
          .eq("user_id", appUserId)
          .eq("sku", PRO_SKU)
          .eq("status", "active");
      }

      return NextResponse.json({ received: true });
    } catch {
      return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
    }
  }

  // Fall back to payment provider interface (Authorization header auth)
  verdict = await revenuecatProvider.verifyWebhook(raw, authHeader ?? null);

  if (!verdict.ok && verdict.reason === "invalid authorization") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!verdict.ok) {
    // Non-auth failure (unknown event etc.) — acknowledge with 200
    return NextResponse.json({ received: true });
  }

  if (verdict.userId && verdict.sku && verdict.providerRef) {
    const admin = createAdminSupabase();
    const { error: insertError } = await admin.from("licenses").insert({
      user_id: verdict.userId,
      sku: PRO_SKU,
      status: "active",
      granted_at: new Date().toISOString(),
    });
    if (insertError && insertError.code !== "23505") {
      console.error("[webhooks/payments] insert error", insertError);
      return NextResponse.json({ error: "server-error" }, { status: 500 });
    }

    await admin.from("payments").insert({
      user_id: verdict.userId,
      provider: "revenuecat",
      provider_ref: verdict.providerRef,
      amount: 499,
      currency: "PHP",
      status: "paid",
    }).catch(() => {});
  }

  return NextResponse.json({ received: true });
}
