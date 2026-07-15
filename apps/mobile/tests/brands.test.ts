import { makeTestDb } from "./helpers/testDb";
import { suggestBrands, addUserBrand, listUserBrands, type BrandSuggestion } from "../lib/brands";

const seed = [
  { name: "Adidas", tier: "core" as const },
  { name: "Carhartt", tier: "core" as const },
  { name: "Cartier", tier: "common" as const },
  { name: "Nike", tier: "core" as const },
  { name: "Oscar de la Renta", tier: "common" as const },
  { name: "Uniqlo", tier: "core" as const },
];

const pools = (over: Partial<{ recents: string[]; custom: string[]; seed: typeof seed }> = {}) => ({
  recents: [] as string[],
  custom: [] as string[],
  seed,
  ...over,
});

test("empty query: recents in order, then custom A→Z, then core seed A→Z; common tier excluded", () => {
  const got = suggestBrands("", pools({ recents: ["Uniqlo", "Levi's"], custom: ["Zara Custom", "Beams Boy"] }));
  expect(got).toEqual<BrandSuggestion[]>([
    { name: "Uniqlo", source: "recent" },
    { name: "Levi's", source: "recent" },
    { name: "Beams Boy", source: "custom" },
    { name: "Zara Custom", source: "custom" },
    { name: "Adidas", source: "seed" },
    { name: "Carhartt", source: "seed" },
    { name: "Nike", source: "seed" },
  ]);
});

test("empty query caps at limit (explicit and default 12)", () => {
  const bigSeed = Array.from({ length: 20 }, (_, i) => ({ name: `Brand ${String.fromCharCode(65 + i)}`, tier: "core" as const }));
  expect(suggestBrands("", pools({ seed: bigSeed }))).toHaveLength(12);
  const three = suggestBrands("", pools({ recents: ["One", "Two"], custom: ["Alpha"] , seed: bigSeed }), 3);
  expect(three).toEqual<BrandSuggestion[]>([
    { name: "One", source: "recent" },
    { name: "Two", source: "recent" },
    { name: "Alpha", source: "custom" },
  ]);
});

test("query: prefix matches beat substring matches, case-insensitively", () => {
  const got = suggestBrands("CAR", pools());
  expect(got).toEqual<BrandSuggestion[]>([
    { name: "Carhartt", source: "seed" }, // prefix, core
    { name: "Cartier", source: "seed" }, // prefix, common
    { name: "Oscar de la Renta", source: "seed" }, // substring only
  ]);
});

test("query: within a match group, recents > custom > seed-core > seed-common", () => {
  const got = suggestBrands("car", pools({ recents: ["Cargo Works"], custom: ["Carousell Finds"] }));
  expect(got).toEqual<BrandSuggestion[]>([
    { name: "Cargo Works", source: "recent" },
    { name: "Carousell Finds", source: "custom" },
    { name: "Carhartt", source: "seed" },
    { name: "Cartier", source: "seed" },
    { name: "Oscar de la Renta", source: "seed" },
  ]);
});

test("dedupe by nocase name keeps the highest-priority source", () => {
  const got = suggestBrands("nik", pools({ recents: ["nike"] }));
  expect(got).toEqual<BrandSuggestion[]>([{ name: "nike", source: "recent" }]);
  const empty = suggestBrands("", pools({ recents: ["nike"] }));
  expect(empty.filter((s) => s.name.toLowerCase() === "nike")).toEqual([{ name: "nike", source: "recent" }]);
});

test("query respects limit after ranking", () => {
  const got = suggestBrands("car", pools({ recents: ["Cargo Works"], custom: ["Carousell Finds"] }), 2);
  expect(got).toEqual<BrandSuggestion[]>([
    { name: "Cargo Works", source: "recent" },
    { name: "Carousell Finds", source: "custom" },
  ]);
});

test("addUserBrand trims and creates, then dedupes nocase against user_brands", () => {
  const { db } = makeTestDb();
  expect(addUserBrand(db, "  Mossimo Manila  ")).toEqual({ created: true, name: "Mossimo Manila" });
  expect(addUserBrand(db, "MOSSIMO MANILA")).toEqual({ created: false, name: "Mossimo Manila" });
  expect(listUserBrands(db)).toEqual(["Mossimo Manila"]);
});

test("addUserBrand dedupes nocase against the bundled seed, returning seed casing", () => {
  const { db } = makeTestDb();
  expect(addUserBrand(db, "nike")).toEqual({ created: false, name: "Nike" }); // Nike is in data/brands.json
  expect(listUserBrands(db)).toEqual([]);
});

test("addUserBrand rejects whitespace-only names without inserting", () => {
  const { db } = makeTestDb();
  expect(addUserBrand(db, "   ")).toEqual({ created: false, name: "" });
  expect(listUserBrands(db)).toEqual([]);
});

test("listUserBrands returns names A→Z case-insensitively", () => {
  const { db } = makeTestDb();
  addUserBrand(db, "Zeitgeist Vintage");
  addUserBrand(db, "aardvark supply");
  addUserBrand(db, "Manila Thrift Co");
  expect(listUserBrands(db)).toEqual(["aardvark supply", "Manila Thrift Co", "Zeitgeist Vintage"]);
});
