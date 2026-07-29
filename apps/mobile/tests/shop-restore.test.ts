import { parseSpecValue, SPEC_LABEL_TO_KEY, specRowsFor, typesFor, specFieldsFor } from "../lib/catalog";

// ---------------------------------------------------------------------------
// Spec parsing tests
// ---------------------------------------------------------------------------

describe("parseSpecValue", () => {
  test('parses "21"', () => {
    expect(parseSpecValue('21"')).toBe(21);
  });

  test('parses "21.5"', () => {
    expect(parseSpecValue('21.5"')).toBe(21.5);
  });

  test("parses US size", () => {
    expect(parseSpecValue("US 9.5")).toBe(9.5);
  });

  test("parses cm", () => {
    expect(parseSpecValue("25.5 cm")).toBe(25.5);
  });

  test("parses plain number", () => {
    expect(parseSpecValue("32")).toBe(32);
  });

  test("returns null for garbage", () => {
    expect(parseSpecValue("abc")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseSpecValue("")).toBeNull();
  });
});

describe("SPEC_LABEL_TO_KEY", () => {
  test("maps all expected labels", () => {
    expect(SPEC_LABEL_TO_KEY["Pit-to-pit"]).toBe("ptpInches");
    expect(SPEC_LABEL_TO_KEY["Length"]).toBe("lengthInches");
    expect(SPEC_LABEL_TO_KEY["Sleeve"]).toBe("sleeveInches");
    expect(SPEC_LABEL_TO_KEY["Waist"]).toBe("waistInches");
    expect(SPEC_LABEL_TO_KEY["Inseam"]).toBe("inseamInches");
    expect(SPEC_LABEL_TO_KEY["Rise"]).toBe("riseInches");
    expect(SPEC_LABEL_TO_KEY["Leg opening"]).toBe("legOpeningInches");
    expect(SPEC_LABEL_TO_KEY["US size"]).toBe("shoeSizeUs");
    expect(SPEC_LABEL_TO_KEY["Insole"]).toBe("insoleCm");
    expect(SPEC_LABEL_TO_KEY["Width"]).toBe("widthInches");
    expect(SPEC_LABEL_TO_KEY["Height"]).toBe("heightInches");
    expect(SPEC_LABEL_TO_KEY["Depth"]).toBe("depthInches");
    expect(SPEC_LABEL_TO_KEY["Strap drop"]).toBe("strapDropInches");
  });

  test("has 13 entries (one per spec)", () => {
    expect(Object.keys(SPEC_LABEL_TO_KEY)).toHaveLength(13);
  });
});

// ---------------------------------------------------------------------------
// Catalog query tests
// ---------------------------------------------------------------------------

describe("typesFor", () => {
  test("returns types for tops", () => {
    expect(typesFor("tops")).toContain("Tee");
    expect(typesFor("tops")).toContain("Hoodie");
  });

  test("returns types for footwear", () => {
    expect(typesFor("footwear")).toContain("Sneakers");
    expect(typesFor("footwear")).toContain("Boots");
  });
});

describe("specFieldsFor", () => {
  test("tops has 3 required specs", () => {
    const fields = specFieldsFor("tops");
    expect(fields).toHaveLength(3);
    expect(fields[0].key).toBe("ptpInches");
    expect(fields[1].key).toBe("lengthInches");
    expect(fields[2].key).toBe("sleeveInches");
    expect(fields[2].extra).toBe(true);
  });

  test("accessories has no specs", () => {
    expect(specFieldsFor("accessories")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Roundtrip test: specRowsFor → parseSpecs
// ---------------------------------------------------------------------------

describe("spec roundtrip", () => {
  test("tops specs roundtrip through label→key parse", () => {
    const item = {
      department: "tops" as const,
      sizeNote: null,
      ptpInches: 21,
      lengthInches: 27,
      sleeveInches: 8,
      waistInches: null,
      inseamInches: null,
      riseInches: null,
      legOpeningInches: null,
      shoeSizeUs: null,
      insoleCm: null,
      widthInches: null,
      heightInches: null,
      depthInches: null,
      strapDropInches: null,
    };

    const rows = specRowsFor(item);
    expect(rows).toEqual([
      { k: "Pit-to-pit", v: '21"' },
      { k: "Length", v: '27"' },
      { k: "Sleeve", v: '8"' },
    ]);

    // Simulate what shop-restore does: parse each row back
    const parsed: Record<string, number> = {};
    for (const { k, v } of rows) {
      const key = SPEC_LABEL_TO_KEY[k];
      if (key) {
        const num = parseSpecValue(v);
        if (num !== null) parsed[key] = num;
      }
    }

    expect(parsed.ptpInches).toBe(21);
    expect(parsed.lengthInches).toBe(27);
    expect(parsed.sleeveInches).toBe(8);
  });

  test("bottoms specs roundtrip", () => {
    const item = {
      department: "bottoms" as const,
      sizeNote: null,
      ptpInches: null,
      lengthInches: null,
      sleeveInches: null,
      waistInches: 32,
      inseamInches: 30,
      riseInches: 10,
      legOpeningInches: 7,
      shoeSizeUs: null,
      insoleCm: null,
      widthInches: null,
      heightInches: null,
      depthInches: null,
      strapDropInches: null,
    };

    const rows = specRowsFor(item);
    const parsed: Record<string, number> = {};
    for (const { k, v } of rows) {
      const key = SPEC_LABEL_TO_KEY[k];
      if (key) {
        const num = parseSpecValue(v);
        if (num !== null) parsed[key] = num;
      }
    }

    expect(parsed.waistInches).toBe(32);
    expect(parsed.inseamInches).toBe(30);
    expect(parsed.riseInches).toBe(10);
    expect(parsed.legOpeningInches).toBe(7);
  });

  test("footwear specs roundtrip (US + cm)", () => {
    const item = {
      department: "footwear" as const,
      sizeNote: null,
      ptpInches: null,
      lengthInches: null,
      sleeveInches: null,
      waistInches: null,
      inseamInches: null,
      riseInches: null,
      legOpeningInches: null,
      shoeSizeUs: 9.5,
      insoleCm: 27.5,
      widthInches: null,
      heightInches: null,
      depthInches: null,
      strapDropInches: null,
    };

    const rows = specRowsFor(item);
    const parsed: Record<string, number> = {};
    for (const { k, v } of rows) {
      const key = SPEC_LABEL_TO_KEY[k];
      if (key) {
        const num = parseSpecValue(v);
        if (num !== null) parsed[key] = num;
      }
    }

    expect(parsed.shoeSizeUs).toBe(9.5);
    expect(parsed.insoleCm).toBe(27.5);
  });
});
