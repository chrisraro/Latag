import { expect, test, vi, beforeEach, describe } from "vitest";
import { PRO_COMP, ENTITLING_SKUS } from "@latag/licensing";

let adminEmail: string | undefined;

/** Captured DB calls, so we can assert on *what* was written, not just that it succeeded. */
const captured = {
  inserts: [] as { table: string; values: Record<string, unknown> }[],
  updates: [] as { table: string; values: Record<string, unknown>; filters: Record<string, unknown> }[],
};

vi.mock("../lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    auth: { getUser: vi.fn() },
    from: (table: string) => ({
      insert: (values: Record<string, unknown>) => {
        captured.inserts.push({ table, values });
        return Promise.resolve({ error: null });
      },
      update: (values: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const entry = { table, values, filters };
        captured.updates.push(entry);
        // Chainable filter builder that records every constraint and is awaitable.
        const chain: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            filters[`eq:${col}`] = val;
            return chain;
          },
          in: (col: string, vals: unknown) => {
            filters[`in:${col}`] = vals;
            return chain;
          },
          then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
        };
        return chain;
      },
    }),
  }),
}));

vi.mock("../lib/supabase/server", () => ({
  createServerSupabase: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: adminEmail ? { email: adminEmail } : null } }),
    },
  }),
}));

vi.mock("../lib/admin-gate", () => ({
  isAdminEmail: (email: string | undefined) => email === "admin@test.com",
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const USER = "550e8400-e29b-41d4-a716-446655440000";

describe("admin Pro grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.inserts = [];
    captured.updates = [];
    adminEmail = "admin@test.com";
  });

  /**
   * Admin grants are comps, not sales. Issuing a *purchasable* SKU would make
   * a free grant indistinguishable from a paying subscriber in the licenses
   * table, and would collide with the real subscription a user later buys.
   */
  test("grantPro issues the comp SKU, not a purchasable subscription SKU", async () => {
    const { grantPro } = await import("../app/admin/actions");
    const result = await grantPro(USER);

    expect(result.error).toBeUndefined();
    const insert = captured.inserts.find((i) => i.table === "licenses");
    expect(insert).toBeDefined();
    expect(insert!.values.sku).toBe(PRO_COMP);
    expect(insert!.values.user_id).toBe(USER);
    expect(insert!.values.status).toBe("active");
  });

  /**
   * The production user's row is `latag-pro-lifetime`. A revoke scoped to
   * purchasable SKUs silently no-ops on it — the admin sees success while the
   * user keeps Pro forever.
   */
  test("revokePro covers every entitling SKU, including comps and legacy grants", async () => {
    const { revokePro } = await import("../app/admin/actions");
    const result = await revokePro(USER);

    expect(result.error).toBeUndefined();
    const update = captured.updates.find((u) => u.table === "licenses");
    expect(update).toBeDefined();
    expect(update!.values.status).toBe("revoked");

    const skuFilter = update!.filters["in:sku"] as string[];
    expect(skuFilter).toBeDefined();
    for (const sku of ENTITLING_SKUS) {
      expect(skuFilter).toContain(sku);
    }
  });

  test("revokePro is still scoped to the target user and active rows only", async () => {
    const { revokePro } = await import("../app/admin/actions");
    await revokePro(USER);

    const update = captured.updates.find((u) => u.table === "licenses")!;
    expect(update.filters["eq:user_id"]).toBe(USER);
    expect(update.filters["eq:status"]).toBe("active");
  });

  test("a non-admin cannot grant, and nothing is written", async () => {
    adminEmail = undefined;
    const { grantPro } = await import("../app/admin/actions");
    const result = await grantPro(USER);

    expect(result.error).toBe("forbidden");
    expect(captured.inserts).toHaveLength(0);
  });
});
