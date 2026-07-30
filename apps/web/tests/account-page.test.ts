import { describe, expect, test, vi, beforeEach } from "vitest";
import { PRO_COMP, PRO_LIFETIME, PRO_MONTHLY, PRO_YEARLY } from "@latag/licensing";

/**
 * /account is the web portal's own "is this user Pro?" surface, and Wave 1's
 * Terms page now promises a comped or grandfathered grant "keeps working" —
 * so this page must resolve entitlement exactly the way /api/license does
 * (fa1e335), not with a second, divergent implementation.
 *
 * Rather than rendering through react-dom (no jsdom/testing-library in this
 * project — see other tests, which mock data and assert on return values),
 * this walks the plain React-element tree `AccountPage()` returns. JSX never
 * invokes child components — `<Badge>PRO — Active</Badge>` is just an object
 * `{ type: Badge, props: { children: "PRO — Active" } }` — so this is a safe,
 * dependency-free way to assert on what text the page would actually render,
 * without needing to execute FeedbackForm/DeleteAccountForm's own hooks.
 */

type ReactNodeLike = unknown;

function collectText(node: ReactNodeLike): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (typeof node === "object" && node !== null && "props" in (node as Record<string, unknown>)) {
    const props = (node as { props?: { children?: unknown } }).props;
    if (props && "children" in props) return collectText(props.children);
  }
  return "";
}

let mockUser: { id: string; email: string } | null = { id: "user-1", email: "a@b.com" };
let licenseRows: Record<string, unknown>[] = [];
let feedbackRows: Record<string, unknown>[] = [];

/** Records the exact `.eq("sku", ...)` the pricing query issues (if any), so a
 *  test can assert the account page asks for the MONTHLY sku specifically —
 *  the displayed label is hardcoded "/month", so the fetched row must match. */
let pricingEqSku: string | null = null;

const PRICE_BY_SKU: Record<string, { price: number; currency: string }> = {
  [PRO_MONTHLY]: { price: 199, currency: "PHP" },
  [PRO_YEARLY]: { price: 1799, currency: "PHP" },
};

/**
 * A real, filtering-aware stand-in for a PostgREST query builder — a chain
 * that ignores `.eq()`/`.in()` filters (just returning canned data regardless
 * of what was asked for) would let the query-scoping bugs this suite exists
 * to catch (B1: wrong SKU set; B3: wrong/no ordering) sail through unnoticed.
 * `.then()` resolves the filtered set; `.maybeSingle()` reproduces PostgREST's
 * real behavior of erroring on more than one row.
 */
function makeRowsChain(getRows: () => Record<string, unknown>[]) {
  const inFilters: { col: string; vals: unknown[] }[] = [];
  const eqFilters: { col: string; val: unknown }[] = [];

  function filtered(): Record<string, unknown>[] {
    let rows = getRows();
    for (const f of inFilters) rows = rows.filter((r) => (f.vals as unknown[]).includes(r[f.col]));
    for (const f of eqFilters) rows = rows.filter((r) => r[f.col] === f.val);
    return rows;
  }

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      eqFilters.push({ col, val });
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      inFilters.push({ col, vals });
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => {
      const rows = filtered();
      if (rows.length > 1) {
        return Promise.resolve({ data: null, error: { message: "multiple (or no) rows returned" } });
      }
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    then: (onResolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: filtered(), error: null }).then(onResolve),
  };
  return chain;
}

/**
 * Same query-builder shape, but resolves against a single-object-per-sku
 * price table rather than a row array — mirrors the real `pricing` table,
 * where `sku` is the lookup key. Filters are applied the same way (`.eq`
 * narrows to one sku, `.in` narrows to a set); when more than one sku
 * survives with no explicit order, this picks the LAST match — the same
 * "whatever the unordered set happens to yield" nondeterminism the real bug
 * exhibited (an `.in(PRO_SKUS)` query surfacing the yearly row).
 */
function makePricingChain() {
  const inFilters: { col: string; vals: unknown[] }[] = [];
  const eqFilters: { col: string; val: unknown }[] = [];

  function matchedSkus(): string[] {
    let skus = Object.keys(PRICE_BY_SKU);
    for (const f of inFilters) if (f.col === "sku") skus = skus.filter((s) => (f.vals as string[]).includes(s));
    for (const f of eqFilters) if (f.col === "sku") skus = skus.filter((s) => s === f.val);
    return skus;
  }

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      if (col === "sku") pricingEqSku = val as string;
      eqFilters.push({ col, val });
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      inFilters.push({ col, vals });
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => {
      const skus = matchedSkus();
      const row = skus.length > 0 ? PRICE_BY_SKU[skus[skus.length - 1]] : null;
      return Promise.resolve({ data: row, error: null });
    },
    then: (onResolve: (v: unknown) => unknown) => {
      const skus = matchedSkus();
      const row = skus.length > 0 ? PRICE_BY_SKU[skus[skus.length - 1]] : null;
      return Promise.resolve({ data: row, error: null }).then(onResolve);
    },
  };
  return chain;
}

vi.mock("../lib/supabase/server", () => ({
  createServerSupabase: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: mockUser } }) },
    from: (table: string) => {
      if (table === "licenses") return makeRowsChain(() => licenseRows);
      if (table === "pricing") return makePricingChain();
      if (table === "feedback") return makeRowsChain(() => feedbackRows);
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`unexpected redirect to ${path}`);
  },
}));

// account/actions.ts (imported by the page for the sign-out form action) pulls
// in createAdminSupabase, which imports the `server-only` marker package.
// That package throws outside a real Next server-component bundle (it has no
// "react-server" condition under plain vitest), so it must be mocked the same
// way admin-pro-grants.test.ts and license-route.test.ts already do.
vi.mock("../lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    auth: { admin: { deleteUser: vi.fn() } },
    from: () => ({
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Map()) }));

async function renderAccountPage(): Promise<string> {
  const { default: AccountPage } = await import("../app/account/page");
  const tree = await AccountPage();
  return collectText(tree);
}

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

describe("/account entitlement display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockUser = { id: "user-1", email: "a@b.com" };
    licenseRows = [];
    feedbackRows = [];
    pricingEqSku = null;
  });

  test("a comped user sees Pro, not Free", async () => {
    licenseRows = [
      { id: "l1", user_id: "user-1", sku: PRO_COMP, status: "active", granted_at: "2026-07-01T00:00:00Z", expires_at: null },
    ];
    const text = await renderAccountPage();
    expect(text).toContain("PRO — Active");
    expect(text).not.toContain("Free — unlimited inventory");
  });

  test("a grandfathered lifetime user sees Pro, not Free", async () => {
    licenseRows = [
      { id: "l1", user_id: "user-1", sku: PRO_LIFETIME, status: "active", granted_at: "2026-07-27T08:25:32Z", expires_at: null },
    ];
    const text = await renderAccountPage();
    expect(text).toContain("PRO — Active");
    expect(text).not.toContain("Free — unlimited inventory");
  });

  test("a user with TWO entitling rows (comp + subscription) resolves without erroring", async () => {
    licenseRows = [
      { id: "l1", user_id: "user-1", sku: PRO_COMP, status: "active", granted_at: "2026-07-01T00:00:00Z", expires_at: null },
      { id: "l2", user_id: "user-1", sku: PRO_MONTHLY, status: "active", granted_at: "2026-07-20T00:00:00Z", expires_at: FUTURE },
    ];
    // Must not throw (this is exactly what a real `.maybeSingle()` over two
    // rows would do — PostgREST errors, `license` becomes null, page says Free).
    const text = await renderAccountPage();
    expect(text).toContain("PRO — Active");
  });

  test("a purely monthly subscriber (single row) still sees Pro", async () => {
    licenseRows = [
      { id: "l1", user_id: "user-1", sku: PRO_MONTHLY, status: "active", granted_at: "2026-07-20T00:00:00Z", expires_at: FUTURE },
    ];
    const text = await renderAccountPage();
    expect(text).toContain("PRO — Active");
  });

  /**
   * Wave 3 whole-wave review, M2: the licenses query previously had no
   * `.eq("user_id", user.id)` and relied solely on RLS to scope results —
   * unlike `/api/license` (app/api/license/route.ts), which scopes
   * explicitly. This test's mock query builder actually applies `.eq()`
   * filters (see `makeRowsChain` above), so a row belonging to a DIFFERENT
   * user must not surface here even though it entitles Pro — proving the
   * page's own query does the scoping rather than depending entirely on the
   * mock/RLS layer to have filtered it out already.
   */
  test("an entitling row belonging to a DIFFERENT user does not make this user Pro", async () => {
    licenseRows = [
      { id: "l1", user_id: "someone-else", sku: PRO_LIFETIME, status: "active", granted_at: "2026-07-27T08:25:32Z", expires_at: null },
    ];
    const text = await renderAccountPage();
    expect(text).toContain("Free — unlimited inventory");
    expect(text).not.toContain("PRO — Active");
  });

  test("a Free user (no entitling rows) sees the monthly price labelled monthly, not the yearly price", async () => {
    licenseRows = [];
    const text = await renderAccountPage();
    expect(text).toContain("Free — unlimited inventory");
    // ₱199 is the MONTHLY price; ₱1,799 is yearly. If the query isn't scoped to
    // the monthly SKU specifically, an arbitrary row can win and mislabel the
    // yearly price as "/month".
    expect(text).toContain("199");
    expect(text).not.toContain("1,799");
    expect(pricingEqSku).toBe(PRO_MONTHLY);
  });
});
