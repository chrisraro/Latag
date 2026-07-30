import { describe, expect, test, vi } from "vitest";
import type { Metadata } from "next";

/**
 * SEO foundations (Wave 3, Task 3): every marketing/legal route must set
 * `alternates.canonical`, the root description must fit a SERP snippet, and
 * the root layout must carry `twitter` metadata and a `viewport.themeColor`.
 *
 * `app/layout.tsx` imports `next/font/google`, which requires the real
 * Next.js compiler and throws under plain Vitest — mocked here the same way
 * the shop tests mock server-only modules they don't exercise.
 */
vi.mock("next/font/google", () => ({ Archivo: () => ({ variable: "font-archivo" }) }));

// app/account/page.tsx pulls in ./actions -> lib/supabase/admin, which does
// `import "server-only"` at module scope — that package throws outside a
// real RSC bundle. Mocked exactly as tests/account-page.test.ts does, purely
// so the module can be imported for its `metadata` export.
vi.mock("../lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    auth: { admin: { deleteUser: vi.fn() } },
    from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  }),
}));
vi.mock("../lib/supabase/server", () => ({
  createServerSupabase: () => ({ auth: { getUser: () => Promise.resolve({ data: { user: null } }) } }),
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`unexpected redirect to ${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Map()), cookies: () => Promise.resolve({ get: () => undefined, set: () => {} }) }));

type RouteCase = { label: string; importPath: string; canonical: string };

const ROUTES: RouteCase[] = [
  { label: "app/layout.tsx", importPath: "../app/layout", canonical: "/" },
  { label: "app/page.tsx", importPath: "../app/page", canonical: "/" },
  { label: "app/pro/page.tsx", importPath: "../app/pro/page", canonical: "/pro" },
  { label: "app/account/page.tsx", importPath: "../app/account/page", canonical: "/account" },
  { label: "app/account/sign-in/layout.tsx", importPath: "../app/account/sign-in/layout", canonical: "/account/sign-in" },
  { label: "app/data/page.tsx", importPath: "../app/data/page", canonical: "/data" },
  { label: "app/privacy/page.tsx", importPath: "../app/privacy/page", canonical: "/privacy" },
  { label: "app/terms/page.tsx", importPath: "../app/terms/page", canonical: "/terms" },
];

describe("alternates.canonical on every marketing/legal route", () => {
  for (const route of ROUTES) {
    test(`${route.label} exports alternates.canonical === "${route.canonical}"`, async () => {
      const mod = (await import(route.importPath)) as { metadata?: Metadata };
      expect(mod.metadata, `${route.label} must export a static \`metadata\` object`).toBeDefined();
      expect(mod.metadata!.alternates?.canonical).toBe(route.canonical);
    });
  }
});

describe("root layout meta description", () => {
  test("fits inside Google's ~155-character SERP snippet", async () => {
    const { metadata } = (await import("../app/layout")) as { metadata: Metadata };
    const description = metadata.description as string;
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(155);
  });

  test("describes Latag as offline/inventory + storefront for ukay resellers, free with paid Pro", async () => {
    const { metadata } = (await import("../app/layout")) as { metadata: Metadata };
    const description = (metadata.description as string).toLowerCase();
    expect(description).toMatch(/offline/);
    expect(description).toMatch(/ukay/);
    expect(description).toMatch(/free/);
    expect(description).toMatch(/pro/);
  });
});

describe("root layout twitter card metadata", () => {
  test("sets twitter.card to summary_large_image", async () => {
    const { metadata } = (await import("../app/layout")) as { metadata: Metadata };
    expect(metadata.twitter).toBeDefined();
    expect((metadata.twitter as { card?: string }).card).toBe("summary_large_image");
  });
});

describe("root layout viewport", () => {
  test("exports viewport.themeColor as the dark OLED black from DESIGN.md", async () => {
    const mod = (await import("../app/layout")) as { viewport?: { themeColor?: string } };
    expect(mod.viewport).toBeDefined();
    expect(mod.viewport!.themeColor).toBe("#000000");
  });
});
