import * as Crypto from "expo-crypto";
import { userBrands, type UserBrand } from "../db/schema";
import seedBrands from "../data/brands.json";

export type BrandSuggestion = { name: string; source: "recent" | "custom" | "seed" };

type SeedEntry = { name: string; tier: "core" | "common" };
type AnyDb = any;

const newId = () => Crypto.randomUUID();
/** Case- and diacritic-insensitive key: trims, strips accents (NFD + combining-mark strip), lowercases. */
const nocase = (name: string) => name.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const az = (a: string, b: string) => nocase(a).localeCompare(nocase(b));

type Candidate = BrandSuggestion & { tier?: "core" | "common" };

/**
 * All pools flattened in priority order — recents (order kept), custom (A→Z),
 * seed core (A→Z), seed common (A→Z) — deduped nocase keeping the first
 * (highest-priority) occurrence.
 */
function candidatesFor(pools: { recents: string[]; custom: string[]; seed: SeedEntry[] }): Candidate[] {
  const seedTier = (tier: "core" | "common") =>
    pools.seed.filter((s) => s.tier === tier).slice().sort((a, b) => az(a.name, b.name))
      .map((s): Candidate => ({ name: s.name, source: "seed", tier: s.tier }));
  const ordered: Candidate[] = [
    ...pools.recents.map((name): Candidate => ({ name, source: "recent" })),
    ...pools.custom.slice().sort(az).map((name): Candidate => ({ name, source: "custom" })),
    ...seedTier("core"),
    ...seedTier("common"),
  ];
  const seen = new Set<string>();
  return ordered.filter((c) => {
    const key = nocase(c.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function suggestBrands(
  query: string,
  pools: { recents: string[]; custom: string[]; seed: SeedEntry[] },
  limit = 12,
): BrandSuggestion[] {
  const candidates = candidatesFor(pools);
  const q = nocase(query);
  const pick = (c: Candidate): BrandSuggestion => ({ name: c.name, source: c.source });
  if (!q) {
    // Browse mode: recents, custom, and core-tier seed only.
    return candidates.filter((c) => c.source !== "seed" || c.tier === "core").slice(0, limit).map(pick);
  }
  const prefix: Candidate[] = [];
  const substring: Candidate[] = [];
  for (const c of candidates) {
    const name = nocase(c.name);
    if (name.startsWith(q)) prefix.push(c);
    else if (name.includes(q)) substring.push(c);
  }
  return [...prefix, ...substring].slice(0, limit).map(pick);
}

/**
 * Trims, then dedupes case- and diacritic-insensitively against BOTH user_brands and the
 * bundled seed — returns the existing casing when a duplicate is found, so
 * callers can pick the canonical name instead of creating a variant.
 */
export function addUserBrand(db: AnyDb, name: string): { created: boolean; name: string } {
  const trimmed = name.trim();
  if (!trimmed) return { created: false, name: "" };
  const key = nocase(trimmed);
  const existing = (db.select().from(userBrands).all() as UserBrand[]).find((b) => nocase(b.name) === key);
  if (existing) return { created: false, name: existing.name };
  const seeded = (seedBrands as SeedEntry[]).find((b) => nocase(b.name) === key);
  if (seeded) return { created: false, name: seeded.name };
  db.insert(userBrands).values({ id: newId(), name: trimmed, createdAt: new Date() }).run();
  return { created: true, name: trimmed };
}

export function listUserBrands(db: AnyDb): string[] {
  return (db.select().from(userBrands).all() as UserBrand[]).map((b) => b.name).sort(az);
}
