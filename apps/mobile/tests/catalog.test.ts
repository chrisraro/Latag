import {
  DEPARTMENTS,
  typesFor,
  specFieldsFor,
  captionSpecLine,
  specRowsFor,
  type Department,
  type SpecKey,
} from "../lib/catalog";

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

/** Builds a fully-blank catalog item (all specs null) for a department, then applies overrides. */
function blank(department: Department, overrides: Partial<Record<SpecKey, number>> & { sizeNote?: string | null } = {}) {
  const base: any = { department, sizeNote: overrides.sizeNote ?? null };
  for (const k of SPEC_KEYS) base[k] = (overrides as any)[k] ?? null;
  return base;
}

describe("DEPARTMENTS", () => {
  test("has 6 entries, tops-first", () => {
    expect(DEPARTMENTS).toHaveLength(6);
    expect(DEPARTMENTS[0]).toEqual({ key: "tops", label: "Tops" });
    expect(DEPARTMENTS.map((d) => d.key)).toEqual([
      "tops",
      "bottoms",
      "dresses",
      "footwear",
      "bags",
      "accessories",
    ]);
  });
});

describe("typesFor", () => {
  test("tops", () =>
    expect(typesFor("tops")).toEqual([
      "Tee",
      "Polo",
      "Longsleeve",
      "Jersey",
      "Crewneck",
      "Sweater",
      "Hoodie",
      "Jacket",
    ]));
  test("bottoms exact array", () =>
    expect(typesFor("bottoms")).toEqual(["Jeans", "Trousers", "Cargo", "Shorts", "Skirt"]));
  test("dresses", () => expect(typesFor("dresses")).toEqual(["Dress", "Jumpsuit"]));
  test("footwear", () =>
    expect(typesFor("footwear")).toEqual(["Sneakers", "Boots", "Sandals", "Leather"]));
  test("bags", () =>
    expect(typesFor("bags")).toEqual(["Backpack", "Shoulder", "Tote", "Sling", "Duffel"]));
  test("accessories", () =>
    expect(typesFor("accessories")).toEqual(["Cap", "Belt", "Scarf", "Beanie", "Watch", "Eyewear"]));
});

describe("specFieldsFor", () => {
  test("tops: PTP, Length (key specs) then Sleeve (extra)", () => {
    const fields = specFieldsFor("tops");
    expect(fields.map((f) => f.key)).toEqual(["ptpInches", "lengthInches", "sleeveInches"]);
    expect(fields.map((f) => f.extra)).toEqual([false, false, true]);
    expect(fields[0]).toMatchObject({ key: "ptpInches", short: "PTP", unit: "in", wheel: { min: 14, max: 36, step: 0.5 } });
    expect(fields[1]).toMatchObject({ key: "lengthInches", short: "L", unit: "in", wheel: { min: 20, max: 36, step: 0.5 } });
    expect(fields[2]).toMatchObject({ key: "sleeveInches", short: "SL", unit: "in", wheel: { min: 5, max: 30, step: 0.5 } });
  });

  test("bottoms: Waist, Inseam (key) then Rise, Leg opening (extras)", () => {
    const fields = specFieldsFor("bottoms");
    expect(fields.map((f) => f.key)).toEqual(["waistInches", "inseamInches", "riseInches", "legOpeningInches"]);
    expect(fields.map((f) => f.extra)).toEqual([false, false, true, true]);
    expect(fields[0]).toMatchObject({ short: "W", unit: "in", wheel: { min: 24, max: 46, step: 1 } });
    expect(fields[1]).toMatchObject({ short: "INS", unit: "in", wheel: { min: 24, max: 36, step: 0.5 } });
    expect(fields[2]).toMatchObject({ short: "RISE", unit: "in", wheel: { min: 8, max: 16, step: 0.5 } });
    expect(fields[3]).toMatchObject({ short: "LEG", unit: "in", wheel: { min: 5, max: 12, step: 0.5 } });
  });

  test("dresses: PTP, Length (key) then Waist (extra)", () => {
    const fields = specFieldsFor("dresses");
    expect(fields.map((f) => f.key)).toEqual(["ptpInches", "lengthInches", "waistInches"]);
    expect(fields.map((f) => f.extra)).toEqual([false, false, true]);
    expect(fields[1]).toMatchObject({ wheel: { min: 30, max: 60, step: 0.5 } });
  });

  test("footwear: US size, Insole (key), no extras", () => {
    const fields = specFieldsFor("footwear");
    expect(fields.map((f) => f.key)).toEqual(["shoeSizeUs", "insoleCm"]);
    expect(fields.map((f) => f.extra)).toEqual([false, false]);
    expect(fields[0]).toMatchObject({ short: "US", unit: "US", wheel: { min: 4, max: 14, step: 0.5 } });
    expect(fields[1]).toMatchObject({ short: "CM", unit: "cm", wheel: { min: 20, max: 32, step: 0.5 } });
  });

  test("bags: Width, Height (key) then Depth, Strap drop (extras)", () => {
    const fields = specFieldsFor("bags");
    expect(fields.map((f) => f.key)).toEqual(["widthInches", "heightInches", "depthInches", "strapDropInches"]);
    expect(fields.map((f) => f.extra)).toEqual([false, false, true, true]);
    expect(fields[0]).toMatchObject({ short: "W", wheel: { min: 6, max: 30, step: 0.5 } });
    expect(fields[1]).toMatchObject({ short: "H", wheel: { min: 6, max: 24, step: 0.5 } });
    expect(fields[2]).toMatchObject({ short: "D", wheel: { min: 2, max: 12, step: 0.5 } });
    expect(fields[3]).toMatchObject({ short: "DROP", wheel: { min: 5, max: 30, step: 0.5 } });
  });

  test("accessories: no spec fields (one-size)", () => {
    expect(specFieldsFor("accessories")).toEqual([]);
  });
});

describe("captionSpecLine", () => {
  test("tops: PTP + Length", () => {
    const item = blank("tops", { ptpInches: 22, lengthInches: 27 });
    expect(captionSpecLine(item)).toBe(`PTP 22" · L 27"`);
  });

  test("dresses: PTP + Length (waist extra not shown)", () => {
    const item = blank("dresses", { ptpInches: 34, lengthInches: 45, waistInches: 30 });
    expect(captionSpecLine(item)).toBe(`PTP 34" · L 45"`);
  });

  test("tops: nothing set → empty string", () => {
    expect(captionSpecLine(blank("tops"))).toBe("");
  });

  test("bottoms: without rise", () => {
    const item = blank("bottoms", { waistInches: 32, inseamInches: 30 });
    expect(captionSpecLine(item)).toBe(`W 32" · INS 30"`);
  });

  test("bottoms: with rise", () => {
    const item = blank("bottoms", { waistInches: 32, inseamInches: 30, riseInches: 10.5 });
    expect(captionSpecLine(item)).toBe(`W 32" · INS 30" · RISE 10.5"`);
  });

  test("footwear: US size + insole cm", () => {
    const item = blank("footwear", { shoeSizeUs: 9.5, insoleCm: 25.5 });
    expect(captionSpecLine(item)).toBe(`US 9.5 · 25.5 cm`);
  });

  test("bags: width + height only", () => {
    const item = blank("bags", { widthInches: 14, heightInches: 11 });
    expect(captionSpecLine(item)).toBe(`W 14" · H 11"`);
  });

  test("bags: width + height + depth + strap drop", () => {
    const item = blank("bags", { widthInches: 14, heightInches: 11, depthInches: 5, strapDropInches: 20 });
    expect(captionSpecLine(item)).toBe(`W 14" · H 11" · D 5" · DROP 20"`);
  });

  test("accessories: sizeNote passthrough", () => {
    const item = blank("accessories", { sizeNote: "Adjustable strap" });
    expect(captionSpecLine(item)).toBe("Adjustable strap");
  });

  test("accessories: fallback to One size", () => {
    expect(captionSpecLine(blank("accessories"))).toBe("One size");
  });

  test("accessories: blank sizeNote also falls back to One size", () => {
    expect(captionSpecLine(blank("accessories", { sizeNote: "   " }))).toBe("One size");
  });
});

describe("specRowsFor", () => {
  test("tops: skips nulls, full labels", () => {
    const item = blank("tops", { ptpInches: 22, lengthInches: 27 });
    expect(specRowsFor(item)).toEqual([
      { k: "Pit-to-pit", v: `22"` },
      { k: "Length", v: `27"` },
    ]);
  });

  test("tops: includes sleeve extra when set", () => {
    const item = blank("tops", { ptpInches: 22, lengthInches: 27, sleeveInches: 24.5 });
    expect(specRowsFor(item)).toEqual([
      { k: "Pit-to-pit", v: `22"` },
      { k: "Length", v: `27"` },
      { k: "Sleeve", v: `24.5"` },
    ]);
  });

  test("bottoms: waist + inseam, full labels, rise skipped when null", () => {
    const item = blank("bottoms", { waistInches: 32, inseamInches: 30 });
    expect(specRowsFor(item)).toEqual([
      { k: "Waist", v: `32"` },
      { k: "Inseam", v: `30"` },
    ]);
  });

  test("bottoms: rise + leg opening included when set", () => {
    const item = blank("bottoms", { waistInches: 32, inseamInches: 30, riseInches: 10.5, legOpeningInches: 8 });
    expect(specRowsFor(item)).toEqual([
      { k: "Waist", v: `32"` },
      { k: "Inseam", v: `30"` },
      { k: "Rise", v: `10.5"` },
      { k: "Leg opening", v: `8"` },
    ]);
  });

  test("footwear: US size + Insole full labels", () => {
    const item = blank("footwear", { shoeSizeUs: 9.5, insoleCm: 25.5 });
    expect(specRowsFor(item)).toEqual([
      { k: "US size", v: "9.5" },
      { k: "Insole", v: "25.5 cm" },
    ]);
  });

  test("footwear: partial specs — only set ones appear", () => {
    const item = blank("footwear", { shoeSizeUs: 10 });
    expect(specRowsFor(item)).toEqual([{ k: "US size", v: "10" }]);
  });

  test("bags: all four when set", () => {
    const item = blank("bags", { widthInches: 14, heightInches: 11, depthInches: 5, strapDropInches: 20 });
    expect(specRowsFor(item)).toEqual([
      { k: "Width", v: `14"` },
      { k: "Height", v: `11"` },
      { k: "Depth", v: `5"` },
      { k: "Strap drop", v: `20"` },
    ]);
  });

  test("accessories: always empty rows (one-size handled via sizeNote/caption, not rows)", () => {
    expect(specRowsFor(blank("accessories", { sizeNote: "Adjustable" }))).toEqual([]);
  });

  test("dresses: waist extra row uses full label", () => {
    const item = blank("dresses", { ptpInches: 34, lengthInches: 45, waistInches: 30 });
    expect(specRowsFor(item)).toEqual([
      { k: "Pit-to-pit", v: `34"` },
      { k: "Length", v: `45"` },
      { k: "Waist", v: `30"` },
    ]);
  });
});
