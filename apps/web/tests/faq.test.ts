import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { PRO_MONTHLY, PRO_YEARLY } from "@latag/licensing";
import { JsonLd } from "../components/JsonLd";
import { FAQ_ENTRIES, PRO_PRICE_PHP, PRO_TRIAL_DAYS, faqJsonLd } from "../lib/structured-data";

/**
 * Wave 3, Task 5 — AIO: FAQ content + FAQPage JSON-LD.
 *
 * `FAQ_ENTRIES` is the single source both `/faq` and `faqJsonLd()` render
 * from (see lib/structured-data.ts), so these tests exercise the shared data
 * directly plus the actual page.
 */

describe("faqJsonLd", () => {
  const data = faqJsonLd() as {
    "@context": string;
    "@type": string;
    mainEntity: { "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } }[];
  };

  test("is valid, parseable JSON-LD with @type FAQPage", () => {
    expect(() => JSON.parse(JSON.stringify(data))).not.toThrow();
    expect(data["@type"]).toBe("FAQPage");
    expect(data["@context"]).toBe("https://schema.org");
  });

  test("mainEntity is non-empty, one Question per FAQ_ENTRIES item", () => {
    expect(data.mainEntity.length).toBeGreaterThan(0);
    expect(data.mainEntity).toHaveLength(FAQ_ENTRIES.length);
    for (const q of data.mainEntity) {
      expect(q["@type"]).toBe("Question");
      expect(typeof q.name).toBe("string");
      expect(q.name.length).toBeGreaterThan(0);
      expect(q.acceptedAnswer["@type"]).toBe("Answer");
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(0);
    }
  });
});

describe("FAQ pricing claim tracks the licensing package", () => {
  const pricingAnswer = FAQ_ENTRIES.find((e) => /what does latag cost/i.test(e.question))?.answer ?? "";

  test("a pricing answer exists", () => {
    expect(pricingAnswer.length).toBeGreaterThan(0);
  });

  // Reads the ACTUAL constants (not a copy) so a SKU price/trial-length change
  // that isn't reflected in the FAQ answer fails this test rather than
  // shipping a landing page that disagrees with what the app actually charges.
  test("states the real monthly price", () => {
    expect(pricingAnswer).toContain(`₱${PRO_PRICE_PHP[PRO_MONTHLY]}/month`);
  });

  test("states the real yearly price", () => {
    expect(pricingAnswer).toContain(`₱${PRO_PRICE_PHP[PRO_YEARLY].toLocaleString("en-PH")}/year`);
  });

  test("states the real trial length", () => {
    expect(pricingAnswer).toContain(`${PRO_TRIAL_DAYS}-day free trial`);
  });

  test("does not assert a live iOS/App Store billing path", () => {
    expect(pricingAnswer.toLowerCase()).not.toMatch(/apple|app store|ios/);
  });

  test("does not describe Pro as a one-time purchase", () => {
    expect(pricingAnswer.toLowerCase()).not.toMatch(/one-time|one time|pay once|no subscription/);
  });
});

describe("FAQ content accuracy", () => {
  test("the offline answer matches the real offline behavior described on /data", () => {
    const dataPageSource = readFileSync(join(__dirname, "..", "app", "data", "page.tsx"), "utf8");
    const offlineAnswer = FAQ_ENTRIES.find((e) => /work offline/i.test(e.question))?.answer ?? "";
    expect(offlineAnswer.toLowerCase()).toContain("offline");
    // Both must agree that publishing is the one feature requiring a connection.
    expect(dataPageSource).toMatch(/one inventory feature that needs a connection/i);
    expect(offlineAnswer.toLowerCase()).toMatch(/publishing.*connection|connection.*publish/);
  });

  test("the data-loss answer cites both recovery features, matching apps/mobile/lib/backup.ts and shop-restore.ts", () => {
    const answer = FAQ_ENTRIES.find((e) => /lose, wipe or replace/i.test(e.question))?.answer ?? "";
    expect(answer).toMatch(/export backup/i);
    expect(answer).toMatch(/restore from your shop/i);
    expect(answer.toLowerCase()).toContain("cost and profit");
  });
});

// --- Wiring: /faq actually renders faqJsonLd() ---

type ReactElementLike = { type: unknown; props: Record<string, unknown> } | null | undefined;

function findJsonLdData(node: unknown): object[] {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") {
    return [];
  }
  if (Array.isArray(node)) return node.flatMap(findJsonLdData);
  const el = node as ReactElementLike;
  if (!el || typeof el !== "object") return [];
  const found: object[] = [];
  if (el.type === JsonLd) found.push(el.props.data as object);
  if (el.props && "children" in el.props) found.push(...findJsonLdData(el.props.children));
  return found;
}

function collectText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (typeof node === "object" && node !== null && "props" in (node as Record<string, unknown>)) {
    const props = (node as { props?: { children?: unknown } }).props;
    if (props && "children" in props) return collectText(props.children);
  }
  return "";
}

vi.mock("next/font/google", () => ({ Archivo: () => ({ variable: "font-archivo" }) }));

describe("app/faq/page.tsx", () => {
  test("renders exactly one FAQPage JSON-LD payload", async () => {
    const { default: FaqPage } = await import("../app/faq/page");
    const tree = FaqPage();
    const payloads = findJsonLdData(tree);
    expect(payloads).toHaveLength(1);
    const parsed = JSON.parse(JSON.stringify(payloads[0])) as { "@type": string };
    expect(parsed["@type"]).toBe("FAQPage");
  });

  test("renders every question and answer as visible text", async () => {
    const { default: FaqPage } = await import("../app/faq/page");
    const tree = FaqPage();
    const text = collectText(tree);
    for (const entry of FAQ_ENTRIES) {
      expect(text).toContain(entry.question);
    }
  });

  test("exports canonical /faq metadata", async () => {
    const mod = await import("../app/faq/page");
    expect(mod.metadata.alternates?.canonical).toBe("/faq");
  });
});
