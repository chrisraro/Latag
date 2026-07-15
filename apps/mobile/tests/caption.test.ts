import { formatCaption, type CaptionItem } from "../lib/caption";
import type { SpecKey } from "../lib/catalog";

const SPEC_KEYS: SpecKey[] = [
  "ptpInches",
  "lengthInches",
  "sleeveInches",
  "waistInches",
  "inseamInches",
  "riseInches",
  "legOpeningInches",
  "shoeSizeUs",
  "insoleCm",
  "widthInches",
  "heightInches",
  "depthInches",
  "strapDropInches",
];

/** Caption fixture: all specs null unless overridden — mirrors a post-E1 item row. */
function ci(overrides: Partial<CaptionItem>): CaptionItem {
  const base: any = {
    brand: "Stüssy", name: null, department: "tops", sizeNote: null,
    condition: "9/10", targetSellPrice: 550,
  };
  for (const k of SPEC_KEYS) base[k] = null;
  return { ...base, ...overrides };
}

test("tops caption matches blueprint template (spec line via captionSpecLine)", () => {
  const out = formatCaption([
    ci({ ptpInches: 21, lengthInches: 27 }),
    ci({ brand: "Carhartt", ptpInches: 24, lengthInches: 28.5, condition: "10/10", targetSellPrice: 1250 }),
  ]);
  expect(out).toBe(
    `👕 Stüssy\n📏 Size: (PTP 21" · L 27")\n✨ Condition: 9/10\n💸 ₱550\n📍 Comment "Mine" to claim\n---\n` +
    `👕 Carhartt\n📏 Size: (PTP 24" · L 28.5")\n✨ Condition: 10/10\n💸 ₱1,250\n📍 Comment "Mine" to claim\n---`
  );
});

test("title line is Brand · Name when name is set", () => {
  const out = formatCaption([
    ci({ brand: "Carhartt", name: "Detroit Jacket", ptpInches: 24, lengthInches: 28.5 }),
  ]);
  expect(out.split("\n")[0]).toBe("👕 Carhartt · Detroit Jacket");
});

test("bottoms spec line renders waist/inseam", () => {
  const out = formatCaption([
    ci({ brand: "Levi's", department: "bottoms", waistInches: 32, inseamInches: 30 }),
  ]);
  expect(out.split("\n")[1]).toBe(`📏 Size: (W 32" · INS 30")`);
});

test("footwear spec line renders US size + insole cm", () => {
  const out = formatCaption([
    ci({ brand: "Nike", department: "footwear", shoeSizeUs: 9.5, insoleCm: 25.5 }),
  ]);
  expect(out.split("\n")[1]).toBe("📏 Size: (US 9.5 · 25.5 cm)");
});

test("accessories spec line uses sizeNote, falls back to One size", () => {
  const withNote = formatCaption([ci({ brand: "NY Yankees", department: "accessories", sizeNote: "7 1/4" })]);
  expect(withNote.split("\n")[1]).toBe("📏 Size: (7 1/4)");
  const without = formatCaption([ci({ brand: "NY Yankees", department: "accessories" })]);
  expect(without.split("\n")[1]).toBe("📏 Size: (One size)");
});

test("size line omitted when no specs set", () => {
  const out = formatCaption([ci({})]);
  expect(out).toBe(`👕 Stüssy\n✨ Condition: 9/10\n💸 ₱550\n📍 Comment "Mine" to claim\n---`);
});

test("empty selection → empty string", () => expect(formatCaption([])).toBe(""));
