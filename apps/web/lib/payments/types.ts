export type CheckoutRequest = {
  sku: string;
  amount: number;
  userId: string;
};

export type CheckoutResult =
  | { kind: "redirect"; url: string }
  | { kind: "unavailable"; reason: string };

export type WebhookVerdict =
  | { ok: true; userId: string; sku: string; amount: number; providerRef: string }
  | { ok: false; reason: string };

export interface PaymentProvider {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  verifyWebhook(rawBody: string, signature: string | null): Promise<WebhookVerdict>;
}
