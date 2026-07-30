import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parseSpecValue, SPEC_LABEL_TO_KEY, specRowsFor, typesFor, specFieldsFor } from "../lib/catalog";
import { restorePublishedItems } from "../lib/shop-restore";
import { supabase } from "../lib/supabase";
import { makeTestDb } from "./helpers/testDb";
import { items, photos } from "../db/schema";

jest.mock("../lib/supabase", () => ({
  supabase: { from: jest.fn() },
}));

const mockedSupabase = supabase as unknown as { from: jest.Mock };

type QueryResult = { data?: unknown; error?: unknown };

/**
 * Mirrors postgrest-js: every builder method returns the builder, the builder
 * itself is thenable, and single() resolves to the same result. Task 2 will
 * add a `.maybeSingle()` / `user_id` filter to the shops query — this chain
 * already forwards any method call, so it accommodates that without changes.
 */
function chain(result: QueryResult) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    single: jest.fn(async () => result),
    maybeSingle: jest.fn(async () => result),
    then: (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

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

// ---------------------------------------------------------------------------
// restorePublishedItems — device behaviour
// ---------------------------------------------------------------------------

const SHOP_ITEM = {
  id: "shop-item-1",
  item_local_id: "old-local-id-lost-on-wipe",
  code: "lt-7k2q9",
  brand: "Carhartt",
  name: "Detroit Jacket",
  department: "tops",
  category: "jacket",
  condition: "9/10",
  specs: [{ k: "Pit-to-pit", v: '21"' }, { k: "Length", v: '27"' }],
  price: 850,
  status: "available" as const,
  photo_urls: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
  sort_order: 3,
  published_at: "2026-01-01T00:00:00.000Z",
};

/** Points the two supabase.from() calls restorePublishedItems makes, in call
 *  order: the shop lookup, then the shop_items list. */
function mockRestoreQueries(shopItems: unknown[], shopRow: unknown = { id: "shop-1" }) {
  mockedSupabase.from
    .mockReturnValueOnce(chain({ data: shopRow, error: null }))
    .mockReturnValueOnce(chain({ data: shopItems, error: null }));
}

describe("restorePublishedItems", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("restores a published item into the local db", async () => {
    const { db } = makeTestDb();
    mockRestoreQueries([SHOP_ITEM]);

    const result = await restorePublishedItems(db);

    expect(result).toEqual({ restored: 1, skipped: 0 });
    const rows = db.select().from(items).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].shopCode).toBe("LT-7K2Q9");
    expect(rows[0].brand).toBe("Carhartt");
    expect(rows[0].ptpInches).toBe(21);
    expect(db.select().from(photos).all()).toHaveLength(2);
  });

  // THE regression test. On device there is no global `crypto` — Hermes does
  // not provide one and nothing in this app installs a polyfill. Before the
  // fix, `crypto.randomUUID()` threw inside the per-item try/catch and the
  // whole restore silently reported zero restored (defect A).
  describe("with no global crypto (the actual device environment)", () => {
    let savedCrypto: Crypto;

    beforeEach(() => {
      savedCrypto = globalThis.crypto;
      // @ts-expect-error - simulating Hermes, which never defines this global
      delete globalThis.crypto;
    });

    afterEach(() => {
      globalThis.crypto = savedCrypto;
    });

    test("still restores a published item using expo-crypto, not the global", async () => {
      const { db } = makeTestDb();
      mockRestoreQueries([SHOP_ITEM]);

      const result = await restorePublishedItems(db);

      expect(result).toEqual({ restored: 1, skipped: 0 });
      expect(db.select().from(items).all()).toHaveLength(1);
    });
  });

  test("skips an item whose shopCode already exists locally (idempotent)", async () => {
    const { db } = makeTestDb();
    db.insert(items)
      .values({
        id: "local-1",
        sessionId: null,
        brand: "Carhartt",
        name: "Detroit Jacket",
        department: "tops",
        category: "jacket",
        condition: "9/10",
        individualCost: 0,
        targetSellPrice: 850,
        status: "available",
        createdAt: new Date(),
        shopCode: "LT-7K2Q9",
      })
      .run();
    mockRestoreQueries([SHOP_ITEM]);

    const result = await restorePublishedItems(db);

    expect(result).toEqual({ restored: 0, skipped: 1 });
    expect(db.select().from(items).all()).toHaveLength(1);
  });

  test("shop lookup error -> nothing restored, never throws", async () => {
    const { db } = makeTestDb();
    mockedSupabase.from.mockReturnValueOnce(chain({ data: null, error: { message: "boom" } }));

    await expect(restorePublishedItems(db)).resolves.toEqual({ restored: 0, skipped: 0 });
  });

  test("no shop row at all -> nothing restored, never throws", async () => {
    const { db } = makeTestDb();
    mockedSupabase.from.mockReturnValueOnce(chain({ data: null, error: null }));

    await expect(restorePublishedItems(db)).resolves.toEqual({ restored: 0, skipped: 0 });
  });
});

// ---------------------------------------------------------------------------
// Guard: the bare global `crypto.randomUUID` must never come back
// ---------------------------------------------------------------------------

/**
 * Every other module mints ids via `Crypto.randomUUID()` from expo-crypto
 * (lib/repo.ts, lib/brands.ts, lib/media.ts) because Hermes has no global
 * `crypto`. This test makes that convention enforceable: it fails the moment
 * anyone reintroduces the bare global, instead of waiting for a silent no-op
 * on a real device to surface it again.
 */
describe("guard: no source file uses the bare global crypto.randomUUID", () => {
  const MOBILE_ROOT = join(__dirname, "..");
  const SCANNED_DIRS = ["lib", "app", "hooks", "components", "db"];
  const BARE_GLOBAL = /\bcrypto\.randomUUID\b/;

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  }

  function withoutComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments, incl. JSDoc
      .replace(/\/\/.*$/gm, "");        // line comments
  }

  test("no reference outside a comment", () => {
    const files = SCANNED_DIRS.flatMap((d) => walk(join(MOBILE_ROOT, d)));
    const offenders = files.filter((f) => BARE_GLOBAL.test(withoutComments(readFileSync(f, "utf8"))));
    expect(offenders.map((f) => f.replace(MOBILE_ROOT, ""))).toEqual([]);
  });
});
