import { PaymentProvider, CheckoutRequest, CheckoutResult, WebhookVerdict } from "./types";

export const manualProvider: PaymentProvider = {
  name: "manual",
  async createCheckout(_req: CheckoutRequest): Promise<CheckoutResult> {
    return {
      kind: "unavailable",
      reason: "purchases-open-soon"
    };
  },
  async verifyWebhook(_rawBody: string, _signature: string | null): Promise<WebhookVerdict> {
    return {
      ok: false,
      reason: "manual provider accepts no webhooks"
    };
  }
};
