import { expect, test, vi, beforeEach } from "vitest";

// Set the env var before importing the module
process.env.REVENUECAT_WEBHOOK_SECRET = "test-webhook-secret";

const { revenuecatProvider } = await import("../lib/payments/revenuecat");

// These tests verify the RevenueCat PaymentProvider adapter's webhook
// verification logic.  They do not call any external service.

test("revenuecat provider name is 'revenuecat'", () => {
  expect(revenuecatProvider.name).toBe("revenuecat");
});

test("revenuecat verifyWebhook with unknown event type returns acknowledged", async () => {
  const body = JSON.stringify({
    event: {
      type: "PRODUCT_CHANGE",
      app_user_id: "user-1",
      product_id: "latag-pro-monthly",
      entitlement_ids: ["pro"],
    },
  });
  const verdict = await revenuecatProvider.verifyWebhook(body, null);
  // Unknown events are acknowledged (not rejected) to stop RC retries
  expect(verdict.ok).toBe(true);
});

test("revenuecat verifyWebhook with non-RC payload returns error", async () => {
  const verdict = await revenuecatProvider.verifyWebhook("invalid json", null);
  expect(verdict.ok).toBe(false);
  expect(verdict.reason).toContain("invalid");
});

test("revenuecat verifyWebhook with INITIAL_PURCHASE (monthly) returns grant verdict", async () => {
  const body = JSON.stringify({
    event: {
      type: "INITIAL_PURCHASE",
      app_user_id: "user-1",
      product_id: "latag-pro-monthly",
      entitlement_ids: ["pro"],
      transaction_id: "txn_123",
      store: "stripe",
      environment: "TEST",
      is_trial_period: true,
      expiration_at_ms: Date.now() + 14 * 24 * 60 * 60 * 1000,
    },
  });
  const verdict = await revenuecatProvider.verifyWebhook(body, null);
  expect(verdict.ok).toBe(true);
  if (verdict.ok) {
    expect(verdict.userId).toBe("user-1");
    expect(verdict.sku).toBe("latag-pro-monthly");
    expect(verdict.providerRef).toBe("txn_123");
  }
});

test("revenuecat verifyWebhook with INITIAL_PURCHASE (yearly) returns grant verdict", async () => {
  const body = JSON.stringify({
    event: {
      type: "INITIAL_PURCHASE",
      app_user_id: "user-1",
      product_id: "latag-pro-yearly",
      entitlement_ids: ["pro"],
      transaction_id: "txn_789",
      store: "stripe",
      environment: "TEST",
      is_trial_period: true,
      expiration_at_ms: Date.now() + 14 * 24 * 60 * 60 * 1000,
    },
  });
  const verdict = await revenuecatProvider.verifyWebhook(body, null);
  expect(verdict.ok).toBe(true);
  if (verdict.ok) {
    expect(verdict.userId).toBe("user-1");
    expect(verdict.sku).toBe("latag-pro-yearly");
    expect(verdict.providerRef).toBe("txn_789");
  }
});

test("revenuecat verifyWebhook with RENEWAL returns grant verdict", async () => {
  const body = JSON.stringify({
    event: {
      type: "RENEWAL",
      app_user_id: "user-2",
      product_id: "latag-pro-monthly",
      entitlement_ids: ["pro"],
      transaction_id: "txn_456",
      store: "stripe",
      environment: "TEST",
      expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
    },
  });
  const verdict = await revenuecatProvider.verifyWebhook(body, null);
  expect(verdict.ok).toBe(true);
  if (verdict.ok) {
    expect(verdict.userId).toBe("user-2");
    expect(verdict.sku).toBe("latag-pro-monthly");
  }
});

test("revenuecat verifyWebhook with EXPIRATION returns rejected verdict", async () => {
  const body = JSON.stringify({
    event: {
      type: "EXPIRATION",
      app_user_id: "user-1",
      product_id: "latag-pro-monthly",
      entitlement_ids: ["pro"],
      store: "stripe",
      environment: "TEST",
    },
  });
  const verdict = await revenuecatProvider.verifyWebhook(body, null);
  expect(verdict.ok).toBe(false);
  expect(verdict.reason).toContain("entitlement ended");
});

test("revenuecat verifyWebhook with BILLING_ISSUE returns rejected verdict", async () => {
  const body = JSON.stringify({
    event: {
      type: "BILLING_ISSUE",
      app_user_id: "user-1",
      product_id: "latag-pro-yearly",
      entitlement_ids: ["pro"],
      store: "stripe",
      environment: "TEST",
    },
  });
  const verdict = await revenuecatProvider.verifyWebhook(body, null);
  expect(verdict.ok).toBe(false);
  expect(verdict.reason).toContain("entitlement ended");
});

test("revenuecat verifyWebhook rejects incorrect Authorization header", async () => {
  const body = JSON.stringify({
    event: {
      type: "INITIAL_PURCHASE",
      app_user_id: "user-1",
      product_id: "latag-pro-monthly",
      entitlement_ids: ["pro"],
    },
  });
  const verdict = await revenuecatProvider.verifyWebhook(body, "Bearer wrong-secret");
  expect(verdict.ok).toBe(false);
  expect(verdict.reason).toContain("invalid authorization");
});

test("revenuecat verifyWebhook with non-Pro entitlement is acknowledged (no-op)", async () => {
  const body = JSON.stringify({
    event: {
      type: "INITIAL_PURCHASE",
      app_user_id: "user-1",
      product_id: "some-other-product",
      entitlement_ids: ["other"],
    },
  });
  const verdict = await revenuecatProvider.verifyWebhook(body, null);
  expect(verdict.ok).toBe(true);
});
