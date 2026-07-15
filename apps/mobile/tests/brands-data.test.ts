import brands from "../data/brands.json";

type BrandEntry = { name: string; tier: "core" | "common" };

test("brands.json is an array", () => expect(Array.isArray(brands)).toBe(true));

test("brands.json has 400-650 entries", () => {
  expect((brands as BrandEntry[]).length).toBeGreaterThanOrEqual(400);
  expect((brands as BrandEntry[]).length).toBeLessThanOrEqual(650);
});

test("every entry has a non-empty trimmed name", () => {
  for (const b of brands as BrandEntry[]) {
    expect(typeof b.name).toBe("string");
    expect(b.name.trim().length).toBeGreaterThan(0);
    expect(b.name).toBe(b.name.trim());
  }
});

test("every entry has tier core or common", () => {
  for (const b of brands as BrandEntry[]) {
    expect(["core", "common"]).toContain(b.tier);
  }
});

test("names are unique case-insensitively", () => {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const b of brands as BrandEntry[]) {
    const key = b.name.toLowerCase();
    if (seen.has(key)) dupes.push(b.name);
    seen.add(key);
  }
  expect(dupes).toEqual([]);
});

test("no name longer than 40 chars", () => {
  for (const b of brands as BrandEntry[]) {
    expect(b.name.length).toBeLessThanOrEqual(40);
  }
});

test("core tier is roughly ~120 entries (80-160)", () => {
  const coreCount = (brands as BrandEntry[]).filter((b) => b.tier === "core").length;
  expect(coreCount).toBeGreaterThanOrEqual(80);
  expect(coreCount).toBeLessThanOrEqual(160);
});
