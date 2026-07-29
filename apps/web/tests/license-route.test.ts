import { expect, test, vi, beforeEach, describe } from "vitest";

// Mock the Supabase admin client.
const mockGetUser = vi.fn();
const mockRows = vi.fn();

/**
 * PostgREST query builders are thenables: every filter returns the builder and
 * awaiting it yields `{ data, error }`. The route selects the *set* of
 * entitling licenses rather than `.maybeSingle()`, because a user can legitimately
 * hold more than one (e.g. an admin comp plus a paid subscription) and
 * `maybeSingle` turns that into an error.
 */
const mockChain = {
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  then: (resolve: (v: unknown) => unknown) => Promise.resolve(mockRows()).then(resolve),
};

vi.mock("../lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    auth: { getUser: mockGetUser },
    from: (_table: string) => ({
      select: (..._args: unknown[]) => mockChain,
      update: (_data: unknown) => ({
        eq: (..._args: unknown[]) => Promise.resolve({ error: null }),
      }),
    }),
  }),
}));

vi.mock("../lib/supabase/server", () => ({
  createServerSupabase: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  }),
}));

vi.mock("../lib/licensing", () => ({
  issueReceipt: (_payload: unknown, _secret: string) => "latag1.test.receipt",
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      json: data,
      status: init?.status ?? 200,
    }),
  },
}));

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function authedRequest() {
  return new Request("http://localhost/api/license", {
    headers: { Authorization: "Bearer valid-token" },
  }) as never;
}

/** Shape the mocked `NextResponse.json` actually returns. */
type JsonResponse = { status: number; json: { license: Record<string, unknown> | null; receipt?: string } };

async function callGet(): Promise<JsonResponse> {
  const { GET } = await import("../app/api/license/route");
  return (await GET(authedRequest())) as unknown as JsonResponse;
}

describe("GET /api/license", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LICENSE_SIGNING_SECRET = "test-secret";
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockRows.mockResolvedValue({ data: [], error: null });
  });

  test("returns 401 when no auth header and no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { GET } = await import("../app/api/license/route");
    const result = await GET(new Request("http://localhost/api/license") as never);
    expect(result.status).toBe(401);
  });

  test("returns 404 when the user has no license at all", async () => {
    mockRows.mockResolvedValue({ data: [], error: null });
    expect((await callGet()).status).toBe(404);
  });

  test("returns 500 when the licenses query errors", async () => {
    mockRows.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await callGet()).status).toBe(500);
  });

  test("returns 200 for an active monthly subscription", async () => {
    mockRows.mockResolvedValue({
      data: [{ id: "l1", sku: "latag-pro-monthly", status: "active", granted_at: "2026-01-01T00:00:00Z", expires_at: FUTURE }],
      error: null,
    });
    const result = await callGet();
    expect(result.status).toBe(200);
    expect(result.json.license!.sku).toBe("latag-pro-monthly");
  });

  /**
   * The regression that locked out the real production user: their row was
   * granted as `latag-pro-lifetime` before subscriptions existed, and the
   * lookup filtered on purchasable SKUs only.
   */
  test("returns 200 for a grandfathered lifetime grant with no expiry", async () => {
    mockRows.mockResolvedValue({
      data: [{ id: "l1", sku: "latag-pro-lifetime", status: "active", granted_at: "2026-07-27T08:25:32Z", expires_at: null }],
      error: null,
    });
    const result = await callGet();
    expect(result.status).toBe(200);
    expect(result.json.license!.sku).toBe("latag-pro-lifetime");
    expect(result.json.license!.expiresAt).toBeNull();
    expect(result.json.receipt).toBeTruthy();
  });

  test("returns 200 for an admin comp grant", async () => {
    mockRows.mockResolvedValue({
      data: [{ id: "l1", sku: "latag-pro-comp", status: "active", granted_at: "2026-07-27T08:25:32Z", expires_at: null }],
      error: null,
    });
    const result = await callGet();
    expect(result.status).toBe(200);
    expect(result.json.license!.sku).toBe("latag-pro-comp");
  });

  test("a user holding both a comp and a subscription still resolves (no error)", async () => {
    mockRows.mockResolvedValue({
      data: [
        { id: "l1", sku: "latag-pro-comp", status: "active", granted_at: "2026-07-01T00:00:00Z", expires_at: null },
        { id: "l2", sku: "latag-pro-monthly", status: "active", granted_at: "2026-07-20T00:00:00Z", expires_at: FUTURE },
      ],
      error: null,
    });
    const result = await callGet();
    expect(result.status).toBe(200);
  });

  test("an active row whose expiry has passed does not grant Pro", async () => {
    mockRows.mockResolvedValue({
      data: [{ id: "l1", sku: "latag-pro-monthly", status: "active", granted_at: "2026-01-01T00:00:00Z", expires_at: PAST }],
      error: null,
    });
    expect((await callGet()).status).toBe(404);
  });

  test("an expired subscription does not mask a still-valid comp", async () => {
    mockRows.mockResolvedValue({
      data: [
        { id: "l1", sku: "latag-pro-monthly", status: "active", granted_at: "2026-01-01T00:00:00Z", expires_at: PAST },
        { id: "l2", sku: "latag-pro-comp", status: "active", granted_at: "2026-07-01T00:00:00Z", expires_at: null },
      ],
      error: null,
    });
    const result = await callGet();
    expect(result.status).toBe(200);
    expect(result.json.license!.sku).toBe("latag-pro-comp");
  });

  test("past_due keeps Pro unlocked during the grace period", async () => {
    mockRows.mockResolvedValue({
      data: [{ id: "l1", sku: "latag-pro-monthly", status: "past_due", granted_at: "2026-01-01T00:00:00Z", expires_at: FUTURE }],
      error: null,
    });
    const result = await callGet();
    expect(result.status).toBe(200);
    expect(result.json.license!.status).toBe("past_due");
  });

  test("returns 500 when the signing secret is absent", async () => {
    delete process.env.LICENSE_SIGNING_SECRET;
    mockRows.mockResolvedValue({
      data: [{ id: "l1", sku: "latag-pro-comp", status: "active", granted_at: "2026-07-01T00:00:00Z", expires_at: null }],
      error: null,
    });
    expect((await callGet()).status).toBe(500);
  });
});
