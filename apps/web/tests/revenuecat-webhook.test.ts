import { expect, test, vi, beforeEach, describe } from "vitest";

/**
 * Captured writes, so we assert on the row the webhook actually produces.
 * Mis-recording here is a revenue bug: a yearly subscriber booked as monthly
 * under-reports ₱1,600 and grants the wrong renewal window.
 */
const captured = {
  inserts: [] as { table: string; values: Record<string, unknown> }[],
  updates: [] as { table: string; values: Record<string, unknown>; filters: Record<string, unknown> }[],
};

let existingLicense: { id: string } | null = null;

function builder(table: string, values: Record<string, unknown>, kind: "update") {
  const filters: Record<string, unknown> = {};
  captured[kind === "update" ? "updates" : "updates"].push({ table, values, filters });
  const chain: Record<string, unknown> = {
    eq: (col: string, val: unknown) => {
      filters[`eq:${col}`] = val;
      return chain;
    },
    in: (col: string, val: unknown) => {
      filters[`in:${col}`] = val;
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  return chain;
}

vi.mock("../lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => ({
      select: (..._a: unknown[]) => {
        const chain: Record<string, unknown> = {
          eq: () => chain,
          in: () => chain,
          maybeSingle: () => Promise.resolve({ data: existingLicense, error: null }),
        };
        return chain;
      },
      insert: (values: Record<string, unknown>) => {
        captured.inserts.push({ table, values });
        return Promise.resolve({ error: null });
      },
      update: (values: Record<string, unknown>) => builder(table, values, "update"),
    }),
  }),
}));

vi.mock("../lib/payments/revenuecat", () => ({
  revenuecatProvider: { verifyWebhook: () => Promise.resolve({ ok: true }) },
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({ json: data, status: init?.status ?? 200 }),
  },
}));

const USER = "550e8400-e29b-41d4-a716-446655440000";

async function post(event: Record<string, unknown>) {
  const { POST } = await import("../app/api/webhooks/revenuecat/route");
  const raw = JSON.stringify({ event });
  return POST({
    text: () => Promise.resolve(raw),
    headers: { get: () => null },
  } as never);
}

function licenseInsert() {
  return captured.inserts.find((i) => i.table === "licenses");
}
function paymentInsert() {
  return captured.inserts.find((i) => i.table === "payments");
}

describe("POST /api/webhooks/revenuecat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.inserts = [];
    captured.updates = [];
    existingLicense = null;
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
  });

  /**
   * Store product ids use underscores; our SKUs use hyphens. Without
   * translation the yearly id matches nothing and silently falls back to the
   * monthly SKU at the monthly price.
   */
  test("an underscore yearly purchase is recorded as the yearly SKU at the yearly price", async () => {
    await post({
      type: "INITIAL_PURCHASE",
      app_user_id: USER,
      product_id: "latag_pro_yearly",
      entitlement_ids: ["pro"],
      expiration_at_ms: Date.now() + 365 * 24 * 60 * 60 * 1000,
      period_type: "NORMAL",
    });

    expect(licenseInsert()!.values.sku).toBe("latag-pro-yearly");
    expect(paymentInsert()!.values.amount).toBe(1799);
  });

  test("an underscore monthly purchase is recorded as monthly at the monthly price", async () => {
    await post({
      type: "INITIAL_PURCHASE",
      app_user_id: USER,
      product_id: "latag_pro_monthly",
      entitlement_ids: ["pro"],
      expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
      period_type: "NORMAL",
    });

    expect(licenseInsert()!.values.sku).toBe("latag-pro-monthly");
    expect(paymentInsert()!.values.amount).toBe(199);
  });

  test("a Play base-plan suffix still resolves to the yearly SKU", async () => {
    await post({
      type: "INITIAL_PURCHASE",
      app_user_id: USER,
      product_id: "latag_pro_yearly:p1y",
      entitlement_ids: ["pro"],
      expiration_at_ms: Date.now() + 365 * 24 * 60 * 60 * 1000,
      period_type: "NORMAL",
    });

    expect(licenseInsert()!.values.sku).toBe("latag-pro-yearly");
    expect(paymentInsert()!.values.amount).toBe(1799);
  });

  test("an already-hyphenated product id passes through unchanged", async () => {
    await post({
      type: "INITIAL_PURCHASE",
      app_user_id: USER,
      product_id: "latag-pro-yearly",
      entitlement_ids: ["pro"],
      expiration_at_ms: Date.now() + 365 * 24 * 60 * 60 * 1000,
      period_type: "NORMAL",
    });

    expect(licenseInsert()!.values.sku).toBe("latag-pro-yearly");
  });

  test("a trial records the license but books no revenue", async () => {
    await post({
      type: "INITIAL_PURCHASE",
      app_user_id: USER,
      product_id: "latag_pro_yearly",
      entitlement_ids: ["pro"],
      expiration_at_ms: Date.now() + 14 * 24 * 60 * 60 * 1000,
      period_type: "TRIAL",
      is_trial_period: true,
    });

    expect(licenseInsert()!.values.sku).toBe("latag-pro-yearly");
    expect(paymentInsert()!.values.amount).toBe(0);
  });

  test("expiry is scoped to the normalized SKU, not the raw store id", async () => {
    await post({
      type: "EXPIRATION",
      app_user_id: USER,
      product_id: "latag_pro_yearly",
      entitlement_ids: ["pro"],
    });

    const update = captured.updates.find((u) => u.table === "licenses")!;
    expect(update.values.status).toBe("expired");
    expect(update.filters["eq:sku"]).toBe("latag-pro-yearly");
  });

  test("a billing issue marks past_due against the normalized SKU", async () => {
    await post({
      type: "BILLING_ISSUE",
      app_user_id: USER,
      product_id: "latag_pro_monthly",
      entitlement_ids: ["pro"],
    });

    const update = captured.updates.find((u) => u.table === "licenses")!;
    expect(update.values.status).toBe("past_due");
    expect(update.filters["eq:sku"]).toBe("latag-pro-monthly");
  });

  test("a non-Pro event writes nothing", async () => {
    await post({
      type: "INITIAL_PURCHASE",
      app_user_id: USER,
      product_id: "some_other_product",
      entitlement_ids: ["other"],
    });

    expect(captured.inserts).toHaveLength(0);
    expect(captured.updates).toHaveLength(0);
  });

  /**
   * RC says the "pro" entitlement is active but we cannot identify which
   * product it came from. Granting Pro is correct — the entitlement is
   * authoritative — but inventing a price would fabricate revenue.
   */
  test("an unidentifiable Pro product still grants Pro but books no amount", async () => {
    await post({
      type: "INITIAL_PURCHASE",
      app_user_id: USER,
      product_id: "latag_pro_experimental",
      entitlement_ids: ["pro"],
      expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
      period_type: "NORMAL",
    });

    expect(licenseInsert()).toBeDefined();
    expect(paymentInsert()).toBeUndefined();
  });
});
