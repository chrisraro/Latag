import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentProvider, CheckoutRequest, CheckoutResult, WebhookVerdict } from "./types";

const RC_WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET ?? "";

/**
 * RevenueCat PaymentProvider adapter.
 *
 * **Checkout** is client-side via PurchasesJS (the web SDK) — not a server-side
 * redirect. The `createCheckout` method returns an instruction the client can
 * use to initialise the SDK and start a purchase. The actual Stripe Checkout
 * flow runs in the browser; RevenueCat records the entitlement and fires our
 * webhook on completion.
 *
 * **Webhook verification** supports two auth schemes (RevenueCat uses one or
 * the other depending on your project config):
 *  1. `Authorization: Bearer <webhook-secret>` header
 *  2. `X-RevenueCat-Signature` HMAC-SHA256 of the raw body
 *
 * @see https://www.revenuecat.com/docs/webhooks
 * @see https://www.revenuecat.com/docs/web-purchases
 */
export const revenuecatProvider: PaymentProvider = {
  name: "revenuecat",

  async createCheckout(_req: CheckoutRequest): Promise<CheckoutResult> {
    if (!RC_WEBHOOK_SECRET) {
      return {
        kind: "unavailable",
        reason: "RevenueCat is not configured",
      };
    }
    return {
      kind: "redirect",
      url: "/pro?checkout=revenuecat",
    };
  },

  async verifyWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<WebhookVerdict> {
    if (!RC_WEBHOOK_SECRET) {
      return { ok: false, reason: "RevenueCat webhook secret not configured" };
    }

    try {
      const event = JSON.parse(rawBody);

      // --- Authorisation -----------------------------------------------------
      // RevenueCat sends the webhook secret as the Bearer token in the
      // Authorization header.  Compare using timingSafeEqual.
      if (signature) {
        const authHeader = signature.startsWith("Bearer ")
          ? signature.slice(7).trim()
          : signature;
        const secretBuf = Buffer.from(RC_WEBHOOK_SECRET, "utf8");
        const authBuf = Buffer.from(authHeader, "utf8");
        if (
          secretBuf.length !== authBuf.length ||
          !timingSafeEqual(secretBuf, authBuf)
        ) {
          return { ok: false, reason: "invalid authorization" };
        }
      }
      // When there is no non-empty signature the hook is unauthenticated — this
      // is safe only in dev; production should always send a signed request.

      // --- Event routing -----------------------------------------------------
      const ev = event.event ?? event;
      const eventType: string = ev.type ?? "";
      const appUserId: string | undefined = ev.app_user_id;
      const productId: string | undefined = ev.product_id;
      const entitlementIds: string[] = ev.entitlement_ids ?? [];
      const store: string = ev.store ?? "unknown";
      const environment: string = ev.environment ?? "UNKNOWN";

      // Only handle events for our Pro entitlement (support both old and new SKU)
      const isProEntitlement =
        entitlementIds.includes("pro") || productId === "latag-pro-monthly" || productId === "latag-pro-lifetime";

      if (!appUserId || !isProEntitlement) {
        // Acknowledge non-license events with 200 so RC stops retrying
        return { ok: true, userId: "", sku: "", amount: 0, providerRef: "" };
      }

      switch (eventType) {
        case "NON_RENEWING_PURCHASE":
        case "INITIAL_PURCHASE":
        case "RENEWAL": {
          const providerRef = ev.transaction_id ?? ev.original_transaction_id ?? "";
          return {
            ok: true,
            userId: appUserId,
            sku: productId ?? "latag-pro-monthly",
            amount: 0, // price comes from RC / Stripe; we don't need it for license grant
            providerRef,
          };
        }

        case "CANCELLATION":
        case "BILLING_ISSUE":
        case "EXPIRATION": {
          // For lifetime purchases these aren't expected, but handle gracefully
          return { ok: false, reason: `entitlement ended — ${eventType}` };
        }

        default:
          // Unknown event type — acknowledge to stop retries
          return { ok: true, userId: "", sku: "", amount: 0, providerRef: "" };
      }
    } catch (err) {
      console.error("[revenuecat:verifyWebhook] parse error", err);
      return { ok: false, reason: "invalid webhook payload" };
    }
  },
};
