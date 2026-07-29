import { expect, test, vi, beforeEach, describe } from "vitest";

// Mock the Supabase admin client
const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();

// Build the chainable mock: select().eq().in().in().maybeSingle()
const mockChain = {
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  maybeSingle: () => mockMaybeSingle(),
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

// Mock NextResponse
vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      json: data,
      status: init?.status ?? 200,
    }),
  },
}));

describe("GET /api/license", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LICENSE_SIGNING_SECRET = "test-secret";
  });

  test("returns 401 when no auth header and no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { GET } = await import("../app/api/license/route");
    const request = new Request("http://localhost/api/license");
    const result = await GET(request as any);

    expect(result.status).toBe(401);
  });

  test("returns 404 when user has no active license", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { GET } = await import("../app/api/license/route");
    const request = new Request("http://localhost/api/license", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const result = await GET(request as any);

    expect(result.status).toBe(404);
  });

  test("returns 200 with license when user has active license", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    // Use a future date to avoid the expiry check
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    mockMaybeSingle.mockResolvedValue({
      data: {
        sku: "latag-pro-monthly",
        status: "active",
        granted_at: "2024-01-01T00:00:00Z",
        expires_at: futureDate,
      },
      error: null,
    });

    const { GET } = await import("../app/api/license/route");
    const request = new Request("http://localhost/api/license", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const result = await GET(request as any);

    expect(result.status).toBe(200);
  });
});
