/** Nominatim forward geocoding — the ONLY sanctioned network in lib/ besides
 *  supabase/license/auth/updates. Degrades silently: any failure → [] so the
 *  LocationPicker never blocks on network. Policy: ≥1s debounce (caller-side),
 *  User-Agent "latag-app", "Search © OpenStreetMap" attribution in the picker. */

const SEARCH_BASE = "https://nominatim.openstreetmap.org/search";
const TIMEOUT_MS = 6_000;

export type Place = { name: string; lat: number; lng: number };

/** /search?q=…&format=json&limit=5&countrycodes=ph — manual encoding (Hermes URLSearchParams is partial). */
export function buildSearchUrl(q: string): string {
  return `${SEARCH_BASE}?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=ph`;
}

/** Tolerant Nominatim JSON → places. display_name shortened to its first 3 comma
 *  segments (full names run to 7+ segments of region/postcode noise). Garbage → []. */
export function parseResults(json: unknown): Place[] {
  if (!Array.isArray(json)) return [];
  const out: Place[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const { display_name, lat, lon } = row as Record<string, unknown>;
    if (typeof display_name !== "string" || !display_name) continue;
    const latN = Number(lat);
    const lngN = Number(lon);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) continue;
    const name = display_name
      .split(",")
      .slice(0, 3)
      .map((s) => s.trim())
      .join(", ");
    out.push({ name, lat: latN, lng: lngN });
  }
  return out;
}

/** Fetch with UA header and a 6s abort; NEVER throws — offline/timeout/HTTP error → []. */
export async function searchPlaces(q: string): Promise<Place[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(buildSearchUrl(q), {
      headers: { "User-Agent": "latag-app" },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    return parseResults(await res.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
