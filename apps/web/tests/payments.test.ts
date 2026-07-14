import { expect, test } from "vitest";
import { manualProvider } from "../lib/payments/manual";

test("manual provider never opens a checkout", async () => {
  const res = await manualProvider.createCheckout({ sku: "latag-pro-lifetime", amount: 499, userId: "u1" });
  expect(res).toEqual({ kind: "unavailable", reason: "purchases-open-soon" });
});
test("manual provider rejects all webhooks", async () => {
  const v = await manualProvider.verifyWebhook("{}", null);
  expect(v.ok).toBe(false);
});
