import { expect, test, vi, beforeEach, describe } from "vitest";

// Track admin email for the mock
let adminEmail: string | undefined;

// Mock the Supabase clients
vi.mock("../lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    auth: { getUser: vi.fn() },
    from: (table: string) => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("../lib/supabase/server", () => ({
  createServerSupabase: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: adminEmail ? { email: adminEmail } : null },
        }),
    },
  }),
}));

vi.mock("../lib/admin-gate", () => ({
  isAdminEmail: (email: string | undefined, _adminEmails: string | undefined) => {
    if (!email) return false;
    return email === "admin@test.com";
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminEmail = "admin@test.com"; // default to admin
  });

  describe("grantPro", () => {
    test("rejects non-admin users", async () => {
      adminEmail = undefined;
      const { grantPro } = await import("../app/admin/actions");
      const result = await grantPro("550e8400-e29b-41d4-a716-446655440000");
      expect(result.error).toBe("forbidden");
    });

    test("rejects invalid UUID format", async () => {
      const { grantPro } = await import("../app/admin/actions");
      const result = await grantPro("not-a-uuid");
      expect(result.error).toBe("invalid user id");
    });

    test("accepts valid UUID from admin", async () => {
      const { grantPro } = await import("../app/admin/actions");
      const result = await grantPro("550e8400-e29b-41d4-a716-446655440000");
      expect(result.error).toBeUndefined();
    });
  });

  describe("revokePro", () => {
    test("rejects non-admin users", async () => {
      adminEmail = undefined;
      const { revokePro } = await import("../app/admin/actions");
      const result = await revokePro("550e8400-e29b-41d4-a716-446655440000");
      expect(result.error).toBe("forbidden");
    });

    test("accepts valid UUID from admin", async () => {
      const { revokePro } = await import("../app/admin/actions");
      const result = await revokePro("550e8400-e29b-41d4-a716-446655440000");
      expect(result.error).toBeUndefined();
    });
  });

  describe("updatePrice", () => {
    test("rejects non-admin users", async () => {
      adminEmail = undefined;
      const { updatePrice } = await import("../app/admin/actions");
      const result = await updatePrice("latag-pro-monthly", 19900);
      expect(result.error).toBe("forbidden");
    });

    test("rejects invalid price (negative)", async () => {
      const { updatePrice } = await import("../app/admin/actions");
      const result = await updatePrice("latag-pro-monthly", -100);
      expect(result.error).toBe("price must be a whole number ≥ 1");
    });

    test("rejects invalid price (decimal)", async () => {
      const { updatePrice } = await import("../app/admin/actions");
      const result = await updatePrice("latag-pro-monthly", 199.5);
      expect(result.error).toBe("price must be a whole number ≥ 1");
    });

    test("accepts valid price from admin", async () => {
      const { updatePrice } = await import("../app/admin/actions");
      const result = await updatePrice("latag-pro-monthly", 19900);
      expect(result.error).toBeUndefined();
    });
  });

  describe("setFeedbackStatus", () => {
    test("rejects non-admin users", async () => {
      adminEmail = undefined;
      const { setFeedbackStatus } = await import("../app/admin/actions");
      const result = await setFeedbackStatus("550e8400-e29b-41d4-a716-446655440000", "reviewed");
      expect(result.error).toBe("forbidden");
    });

    test("rejects invalid status", async () => {
      const { setFeedbackStatus } = await import("../app/admin/actions");
      const result = await setFeedbackStatus("550e8400-e29b-41d4-a716-446655440000", "invalid");
      expect(result.error).toBe("invalid status");
    });

    test("accepts valid status from admin", async () => {
      const { setFeedbackStatus } = await import("../app/admin/actions");
      const result = await setFeedbackStatus("550e8400-e29b-41d4-a716-446655440000", "reviewed");
      expect(result.error).toBeUndefined();
    });
  });

  describe("setFlag", () => {
    test("rejects non-admin users", async () => {
      adminEmail = undefined;
      const { setFlag } = await import("../app/admin/actions");
      const result = await setFlag("test-flag", true);
      expect(result.error).toBe("forbidden");
    });

    test("accepts valid flag from admin", async () => {
      const { setFlag } = await import("../app/admin/actions");
      const result = await setFlag("test-flag", true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("addFlag", () => {
    test("rejects non-admin users", async () => {
      adminEmail = undefined;
      const { addFlag } = await import("../app/admin/actions");
      const result = await addFlag("test-flag", "Test notes");
      expect(result.error).toBe("forbidden");
    });

    test("rejects invalid key format", async () => {
      const { addFlag } = await import("../app/admin/actions");
      const result = await addFlag("INVALID KEY!", "Test notes");
      expect(result.error).toBe("key must be 1-64 lowercase letters, numbers, - or _");
    });

    test("accepts valid key from admin", async () => {
      const { addFlag } = await import("../app/admin/actions");
      const result = await addFlag("test-flag", "Test notes");
      expect(result.error).toBeUndefined();
    });
  });
});
