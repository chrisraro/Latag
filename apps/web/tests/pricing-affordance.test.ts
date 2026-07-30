import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { Pricing } from "../components/Pricing";

/**
 * Wave 3 Task 6, items 2-3.
 *
 * (2) `detailed` used to gate a branch claiming "Cancel anytime in your
 * account settings" — false (cancellation is store-side, per
 * app/terms/page.tsx) and dead code, since the only call site
 * (app/page.tsx's `<Pricing />`) never passed `detailed`. The whole branch
 * and prop are removed rather than reworded.
 *
 * (3) The Monthly/Yearly cards applied `cursor-pointer` and
 * `hover:border-acid/60` unconditionally, plus a `role`/`tabIndex` that were
 * already correctly gated on `onSelect` — but the *visual* affordance wasn't,
 * so a card looked clickable even when nothing would happen on click (the
 * only real call site passes no `onSelect`). Same false-affordance class of
 * bug Wave 1 fixed in onboarding.
 *
 * No react-dom/jsdom in this project (see other tests) — Pricing is a plain
 * function component, so calling it directly returns a plain React-element
 * tree that can be walked without rendering.
 */

type ReactNodeLike = unknown;

/** Collects every `className` string found anywhere in a plain React-element tree. */
function collectClassNames(node: ReactNodeLike): string[] {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") {
    return [];
  }
  if (Array.isArray(node)) return node.flatMap(collectClassNames);
  if (typeof node !== "object") return [];
  const el = node as { props?: Record<string, unknown> };
  if (!el.props) return [];
  const found: string[] = [];
  if (typeof el.props.className === "string") found.push(el.props.className);
  if ("children" in el.props) found.push(...collectClassNames(el.props.children));
  return found;
}

/** Collects every `role` prop value found anywhere in a plain React-element tree. */
function collectRoles(node: ReactNodeLike): unknown[] {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") {
    return [];
  }
  if (Array.isArray(node)) return node.flatMap(collectRoles);
  if (typeof node !== "object") return [];
  const el = node as { props?: Record<string, unknown> };
  if (!el.props) return [];
  const found: unknown[] = [];
  if ("role" in el.props) found.push(el.props.role);
  if ("children" in el.props) found.push(...collectRoles(el.props.children));
  return found;
}

const ROOT = join(__dirname, "..");

describe("Pricing dead-code / false-claim regression guard", () => {
  test("the source no longer accepts a `detailed` prop", () => {
    const source = readFileSync(join(ROOT, "components", "Pricing.tsx"), "utf8");
    expect(source).not.toMatch(/\bdetailed\b/);
  });

  test("the source no longer claims cancellation happens in account settings", () => {
    const source = readFileSync(join(ROOT, "components", "Pricing.tsx"), "utf8");
    expect(source.toLowerCase()).not.toContain("cancel anytime in your account settings");
  });
});

describe("Pricing card affordance is gated on onSelect", () => {
  test("without onSelect, no card looks or behaves clickable", () => {
    const tree = Pricing({});
    const classes = collectClassNames(tree).join(" ");
    expect(classes).not.toContain("cursor-pointer");
    expect(classes).not.toContain("hover:border-acid/60");
    const roles = collectRoles(tree);
    expect(roles.every((r) => r === undefined)).toBe(true);
  });

  test("with onSelect, both Monthly and Yearly cards are interactive-styled and focusable", () => {
    const tree = Pricing({ onSelect: () => {} });
    const classes = collectClassNames(tree).join(" ");
    expect(classes).toContain("cursor-pointer");
    expect(classes).toContain("hover:border-acid/60");
    const roles = collectRoles(tree).filter((r) => r === "button");
    expect(roles).toHaveLength(2);
  });
});
