import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy"; // SDK 57: legacy submodule, matching lib/media.ts
import { supabase } from "./supabase";

/**
 * Every Supabase call the storefront makes lives here — the only new network
 * surface in F2 besides the queue drain that calls into it.
 *
 * PRIVACY BOUNDARY (spec §1/§3): `shop_items` has no column for cost, profit,
 * location, or batch, and the payloads below are built field-by-field from an
 * explicit type — never a spread of an item row. Adding a field here is the
 * only way to leak one, so don't.
 *
 * Nothing in this module throws. Every export resolves to a `ShopResult` so
 * the publish queue can retry and the UI can stay offline-first.
 */

export const SHOP_PHOTOS_BUCKET = "shop-photos";
export const MAX_ITEM_PHOTOS = 4;

const HANDLE_RE = /^[a-z0-9-]{3,20}$/;
const HANDLE_MAX = 20;

export type ShopProfile = {
  handle: string;
  displayName: string;
  bio: string | null;
  contactMessenger: string | null;
  contactInstagram: string | null;
  contactEmail: string | null;
  showSold: boolean;
  /** The whole page's on/off switch. `shops.is_published` is what the public
   *  RLS policy reads, so false makes the shop 404 for every buyer while
   *  leaving each item's own published state untouched. */
  isPublished: boolean;
};

export type ShopFailReason = "auth" | "taken" | "network" | "error";

export type ShopResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: ShopFailReason; message: string };

/** Buyer-facing fields only. There is deliberately no cost/profit/location/batch member. */
export type ShopItemUpsert = {
  itemLocalId: string;
  code: string;
  brand: string;
  name: string | null;
  department: string;
  category: string;
  condition: string;
  // M1: an ORDERED ARRAY (not a jsonb object) — see toShopItemUpsert in shop-sync.ts.
  specs: { k: string; v: string }[];
  price: number;
  status: "available" | "sold";
  photoUrls: string[];
  sortOrder: number;
};

// ---------------------------------------------------------------------------
// Result plumbing
// ---------------------------------------------------------------------------

const NETWORK_RE = /network|fetch|timeout|econn|offline|socket|unreachable/i;

type AnyError = {
  code?: string;
  message?: string;
  name?: string;
  status?: number;
};

/** Maps anything thrown or returned in `error` onto a ShopResult failure. */
function fail(err: unknown, fallback = "Something went wrong"): { ok: false; reason: ShopFailReason; message: string } {
  const e = (err ?? {}) as AnyError;
  const message = typeof e.message === "string" && e.message.length > 0 ? e.message : fallback;

  // 23505 = postgres unique_violation. On `shops` that is always the handle.
  if (e.code === "23505") return { ok: false, reason: "taken", message };
  if (e.status === 401 || e.status === 403 || e.code === "PGRST301") {
    return { ok: false, reason: "auth", message };
  }
  if (e.name === "TypeError" || e.name === "AuthRetryableFetchError" || e.status === 0 || NETWORK_RE.test(message)) {
    return { ok: false, reason: "network", message };
  }
  return { ok: false, reason: "error", message };
}

function invalid(message: string): { ok: false; reason: ShopFailReason; message: string } {
  return { ok: false, reason: "error", message };
}

const NO_SESSION = {
  ok: false as const,
  reason: "auth" as const,
  message: "Not signed in",
};

/** Wraps a body so no export can ever reject. */
async function guard<T>(body: () => Promise<ShopResult<T>>): Promise<ShopResult<T>> {
  try {
    return await body();
  } catch (e) {
    return fail(e);
  }
}

/** Exported so other modules that read the caller's own rows (e.g.
 *  lib/shop-restore.ts) scope their queries the same way `getMyShop` does,
 *  rather than re-deriving the session lookup. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

/** Lowercase, spaces to dashes, drop everything else, clamp to 20. */
export function normalizeHandle(raw: string): string {
  return (raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, HANDLE_MAX);
}

export function isValidHandle(h: string): boolean {
  return HANDLE_RE.test(h ?? "");
}

/**
 * Sellers type "@juan" or paste a whole profile URL. Both mean the username,
 * which is all m.me / ig.me / mailto need — so accept either and store the
 * bare handle. Deliberately does NOT touch case: Messenger usernames are
 * case-insensitive but emails are not, and this runs over both.
 */
export function normalizeContactHandle(raw: string): string {
  return (raw ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?(m\.me|ig\.me\/m|instagram\.com|facebook\.com|fb\.com)\//i, "")
    .replace(/^@+/, "")
    .replace(/\/+$/, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Public links
// ---------------------------------------------------------------------------

export const SHOP_ORIGIN = "https://latag.vercel.app";
/** Display-only: the scheme is noise on a screen the seller reads aloud. */
export const SHOP_URL_PREFIX = "latag.vercel.app/shop/";

export function shopUrl(handle: string): string {
  return `${SHOP_ORIGIN}/shop/${normalizeHandle(handle)}`;
}

export function shopUrlLabel(handle: string): string {
  return `${SHOP_URL_PREFIX}${normalizeHandle(handle)}`;
}

/**
 * One listing's own page. The last segment is the item's `code` verbatim
 * (`LT-XXXXX`, uppercase as stored on `shop_items.code`) so the same six
 * characters work as a URL, as a spoken reference, and as the inquiry fallback.
 * A code-less item has no page yet — the link degrades to the shop rather than
 * to a 404.
 */
export function shopItemUrl(handle: string, code: string | null | undefined): string {
  const base = shopUrl(handle);
  const segment = (code ?? "").trim().toUpperCase();
  return segment ? `${base}/${segment}` : base;
}

// ---------------------------------------------------------------------------
// Last-known profile
// ---------------------------------------------------------------------------

const SHOP_CACHE_KEY = "latag.shop.profile";

/**
 * The shop link has to be readable in a market with no signal, so the last
 * profile we successfully loaded is kept on the phone. It is a convenience
 * copy, never the source of truth — every write still goes through Supabase.
 */
export async function cacheShop(p: ShopProfile | null): Promise<void> {
  try {
    if (p) await AsyncStorage.setItem(SHOP_CACHE_KEY, JSON.stringify(p));
    else await AsyncStorage.removeItem(SHOP_CACHE_KEY);
  } catch {
    // A cache that fails to write is not an error worth surfacing.
  }
}

export async function cachedShop(): Promise<ShopProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(SHOP_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ShopProfile>;
    if (typeof p?.handle !== "string" || typeof p?.displayName !== "string") return null;
    return {
      handle: p.handle,
      displayName: p.displayName,
      bio: p.bio ?? null,
      contactMessenger: p.contactMessenger ?? null,
      contactInstagram: p.contactInstagram ?? null,
      contactEmail: p.contactEmail ?? null,
      showSold: p.showSold === true,
      // Caches written before this switch existed describe a live shop.
      isPublished: p.isPublished !== false,
    };
  } catch {
    return null;
  }
}

/**
 * True when nobody else holds the handle. The seller's own current handle
 * always reads as available so re-saving an unchanged profile isn't blocked.
 * Advisory only — the unique index is the real arbiter (see saveMyShop).
 */
export async function checkHandleAvailable(h: string): Promise<ShopResult<boolean>> {
  return guard(async () => {
    const handle = normalizeHandle(h);
    if (!isValidHandle(handle)) return { ok: true, data: false };

    const myId = await currentUserId();
    const { data, error } = await supabase
      .from("shops")
      .select("id,user_id")
      .eq("handle", handle)
      .maybeSingle();

    if (error) return fail(error);
    if (!data) return { ok: true, data: true };
    return { ok: true, data: myId != null && (data as { user_id: string }).user_id === myId };
  });
}

// ---------------------------------------------------------------------------
// Shop profile
// ---------------------------------------------------------------------------

const SHOP_COLUMNS = "handle,display_name,bio,contact_messenger,contact_instagram,contact_email,show_sold,is_published";

type ShopRow = {
  handle: string;
  display_name: string;
  bio: string | null;
  contact_messenger: string | null;
  contact_instagram: string | null;
  contact_email: string | null;
  show_sold: boolean;
  is_published: boolean;
};

function toProfile(row: ShopRow): ShopProfile {
  return {
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio ?? null,
    contactMessenger: row.contact_messenger ?? null,
    contactInstagram: row.contact_instagram ?? null,
    contactEmail: row.contact_email ?? null,
    showSold: row.show_sold === true,
    // The column is `not null default true`; only an explicit false is off.
    isPublished: row.is_published !== false,
  };
}

/** Trims to null so blank contact fields don't render as empty strings on the web. */
function blankToNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

export async function getMyShop(): Promise<ShopResult<ShopProfile | null>> {
  return guard(async () => {
    const userId = await currentUserId();
    if (!userId) return NO_SESSION;

    const { data, error } = await supabase
      .from("shops")
      .select(SHOP_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return fail(error);
    return { ok: true, data: data ? toProfile(data as unknown as ShopRow) : null };
  });
}

export async function saveMyShop(p: ShopProfile): Promise<ShopResult<ShopProfile>> {
  return guard(async () => {
    const handle = normalizeHandle(p.handle);
    if (!isValidHandle(handle)) {
      return invalid("Handle must be 3-20 characters: letters, numbers, dashes");
    }
    const displayName = (p.displayName ?? "").trim();
    if (displayName.length === 0) return invalid("Add a shop name buyers will recognise");

    const userId = await currentUserId();
    if (!userId) return NO_SESSION;

    const { data, error } = await supabase
      .from("shops")
      .upsert(
        {
          user_id: userId,
          handle,
          display_name: displayName,
          bio: blankToNull(p.bio),
          contact_messenger: blankToNull(p.contactMessenger),
          contact_instagram: blankToNull(p.contactInstagram),
          contact_email: blankToNull(p.contactEmail),
          show_sold: p.showSold === true,
          is_published: p.isPublished !== false,
        },
        { onConflict: "user_id" },
      )
      .select(SHOP_COLUMNS)
      .single();

    if (error) return fail(error);
    if (!data) return invalid("Shop saved but could not be read back");
    return { ok: true, data: toProfile(data as unknown as ShopRow) };
  });
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = /* @__PURE__ */ (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < B64_ALPHABET.length; i++) t[B64_ALPHABET.charCodeAt(i)] = i;
  return t;
})();

/**
 * base64 -> ArrayBuffer, which is what supabase-js storage `upload` accepts as
 * a FileBody (verified against @supabase/storage-js 2.110.3). Hand-rolled
 * because mobile is JS-only for OTA — no new dependency may be added.
 * Padding and any whitespace the encoder inserted are ignored.
 */
export function decodeBase64(base64: string): ArrayBuffer {
  const clean = (base64 ?? "").replace(/[^A-Za-z0-9+/]/g, "");
  const len = clean.length;
  const byteLength = (len * 3) >> 2;
  const bytes = new Uint8Array(byteLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = B64_LOOKUP[clean.charCodeAt(i)];
    const c1 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c2 = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const c3 = B64_LOOKUP[clean.charCodeAt(i + 3)];
    if (p < byteLength) bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (p < byteLength) bytes[p++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    if (p < byteLength) bytes[p++] = ((c2 & 0x03) << 6) | c3;
  }
  return bytes.buffer;
}

/**
 * Uploads the already-compressed local photos to {user_id}/{itemId}/{index}.jpg.
 * Deterministic paths + `upsert: true` make this idempotent: a retried publish
 * overwrites the same objects instead of duplicating them.
 */
export async function uploadItemPhotos(itemId: string, localUris: string[]): Promise<ShopResult<string[]>> {
  return guard(async () => {
    const uris = (localUris ?? []).slice(0, MAX_ITEM_PHOTOS);
    if (uris.length === 0) return { ok: true, data: [] };

    const userId = await currentUserId();
    if (!userId) return NO_SESSION;

    const bucket = supabase.storage.from(SHOP_PHOTOS_BUCKET);
    const urls: string[] = [];

    // Sequential on purpose: preserves photo order and keeps only one decoded
    // image in memory at a time on low-end Android.
    for (let i = 0; i < uris.length; i++) {
      const path = `${userId}/${itemId}/${i}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(uris[i], { encoding: "base64" });
      const { error } = await bucket.upload(path, decodeBase64(base64), {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (error) return fail(error);
      urls.push(bucket.getPublicUrl(path).data.publicUrl);
    }

    // ORPHAN CLEANUP (I2a): objects are written at indices 0..n-1 only, so a
    // published item shrinking from e.g. 4 photos to 2 would otherwise leave
    // 2.jpg/3.jpg publicly readable forever. Best-effort — cleanup must never
    // fail a publish that already succeeded.
    try {
      const folder = `${userId}/${itemId}`;
      const listed = await bucket.list(folder);
      const orphans = (listed.data ?? [])
        .filter((f: { name: string }) => {
          const idx = parseInt(f.name, 10);
          return Number.isInteger(idx) && idx >= uris.length;
        })
        .map((f: { name: string }) => `${folder}/${f.name}`);
      if (orphans.length > 0) await bucket.remove(orphans);
    } catch {
      // ignored on purpose
    }

    return { ok: true, data: urls };
  });
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

async function myShopId(userId: string): Promise<{ ok: true; id: string | null } | { ok: false; err: unknown }> {
  const { data, error } = await supabase.from("shops").select("id").eq("user_id", userId).maybeSingle();
  if (error) return { ok: false, err: error };
  return { ok: true, id: data ? (data as { id: string }).id : null };
}

export async function upsertShopItem(row: ShopItemUpsert): Promise<ShopResult<null>> {
  return guard(async () => {
    const userId = await currentUserId();
    if (!userId) return NO_SESSION;

    const shop = await myShopId(userId);
    if (!shop.ok) return fail(shop.err);
    if (!shop.id) return invalid("Set up your shop before publishing");

    // Explicit field list — the privacy boundary. Never spread an item row here.
    const { error } = await supabase.from("shop_items").upsert(
      {
        shop_id: shop.id,
        item_local_id: row.itemLocalId,
        code: row.code,
        brand: row.brand,
        name: row.name ?? null,
        department: row.department,
        category: row.category,
        condition: row.condition,
        specs: row.specs ?? [],
        price: row.price,
        status: row.status,
        photo_urls: row.photoUrls ?? [],
        sort_order: row.sortOrder ?? 0,
      },
      { onConflict: "shop_id,item_local_id" },
    );

    if (error) return fail(error);
    return { ok: true, data: null };
  });
}

/** Removes the published row, then its photo folder. Safe to run twice. */
export async function deleteShopItem(itemLocalId: string): Promise<ShopResult<null>> {
  return guard(async () => {
    const userId = await currentUserId();
    if (!userId) return NO_SESSION;

    const shop = await myShopId(userId);
    if (!shop.ok) return fail(shop.err);
    // No shop means nothing was ever published — the delete is already satisfied.
    if (!shop.id) return { ok: true, data: null };

    const { error } = await supabase
      .from("shop_items")
      .delete()
      .eq("shop_id", shop.id)
      .eq("item_local_id", itemLocalId);

    if (error) return fail(error);

    // Best-effort: the row is gone, so the item is already off the shop. Leftover
    // bytes must not fail the queue op or it would retry forever.
    try {
      const folder = `${userId}/${itemLocalId}`;
      const bucket = supabase.storage.from(SHOP_PHOTOS_BUCKET);
      const listed = await bucket.list(folder);
      const names = (listed.data ?? []).map((f: { name: string }) => `${folder}/${f.name}`);
      if (names.length > 0) await bucket.remove(names);
    } catch {
      // ignored on purpose
    }

    return { ok: true, data: null };
  });
}
