import { asc, eq } from "drizzle-orm";
import { items, photos, publishQueue, type Item, type Photo, type PublishQueueRow } from "../db/schema";
import type { LatagDb } from "../db/client";
import { specRowsFor, type CatalogItem } from "./catalog";
import {
  deleteShopItem,
  uploadItemPhotos,
  upsertShopItem,
  type ShopItemUpsert,
  type ShopResult,
} from "./shop-api";

/**
 * The storefront outbox drain.
 *
 * `drainQueue` is a pure state machine over injected deps — no database, no
 * network, no clock — so every retry rule below is testable in isolation.
 * `syncPublishQueue` is the one impure wiring point: it binds the local db and
 * lib/shop-api to those deps and is what app/_layout fires on launch and on
 * foreground. Nothing here ever throws; publishing must never be able to take
 * the logging loop down with it.
 */

/** After five honest tries a row stops burning battery. It is never deleted —
 *  the Shop tab surfaces it so the seller can see something is stuck. */
export const MAX_ATTEMPTS = 5;

export type DrainDeps = {
  list: () => PublishQueueRow[];
  upsert: (r: PublishQueueRow) => Promise<ShopResult<null>>;
  remove: (r: PublishQueueRow) => Promise<ShopResult<null>>;
  done: (id: string) => void;
  fail: (id: string, msg: string) => void;
};

/**
 * `processed` counts rows an operation actually ran for, so it always equals
 * `succeeded + failed`. `gaveUp` counts rows skipped at MAX_ATTEMPTS. A row
 * left untouched by an auth halt is in none of them — no attempt was spent.
 */
export type DrainSummary = { processed: number; succeeded: number; failed: number; gaveUp: number };

const EMPTY: DrainSummary = { processed: 0, succeeded: 0, failed: 0, gaveUp: 0 };

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" && m.length > 0 ? m : "Sync failed";
}

/**
 * Walks the queue oldest-first. Success removes the row; failure records the
 * attempt and moves on to the next item so one stuck photo can't hold up the
 * rest of the shop. A `reason:"auth"` result stops the whole drain untouched —
 * signed out means every remaining row would fail for the same reason, and
 * burning five attempts each would quietly strand the seller's stock.
 */
export async function drainQueue(deps: DrainDeps): Promise<DrainSummary> {
  const summary: DrainSummary = { ...EMPTY };

  let rows: PublishQueueRow[];
  try {
    rows = deps.list() ?? [];
  } catch {
    return summary;
  }

  for (const row of rows) {
    if (row.attempts >= MAX_ATTEMPTS) {
      summary.gaveUp += 1;
      continue;
    }

    let result: ShopResult<null>;
    try {
      result = row.op === "delete" ? await deps.remove(row) : await deps.upsert(row);
    } catch (e) {
      result = { ok: false, reason: "error", message: errorMessage(e) };
    }

    if (!result.ok && result.reason === "auth") return summary;

    summary.processed += 1;
    if (result.ok) {
      summary.succeeded += 1;
      try { deps.done(row.id); } catch { /* the row simply drains again next time */ }
    } else {
      summary.failed += 1;
      try { deps.fail(row.id, result.message); } catch { /* same */ }
    }
  }

  return summary;
}

/** Honest, quiet pending count for the Shop tab. Silent when there's nothing to say. */
export function pendingLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return n === 1 ? "1 change pending" : `${Math.floor(n)} changes pending`;
}

// ---------------------------------------------------------------------------
// Local row -> published payload
// ---------------------------------------------------------------------------

/** Buyers see the garment front-first; the flaw shot goes last, never hidden. */
const SLOT_ORDER: Record<Photo["type"], number> = { front: 0, back: 1, tag: 2, flaw: 3 };

/**
 * PRIVACY BOUNDARY (spec §1/§3). Every field is named explicitly — this is
 * never a spread of the item row, so `individualCost`, `soldPrice`, `sessionId`
 * and the session's location simply have no path to the network. `specs` comes
 * from `specRowsFor`, which only ever emits catalog measurement fields.
 */
export function toShopItemUpsert(item: Item, photoUrls: string[]): ShopItemUpsert {
  // M1: an ORDERED ARRAY, not a jsonb object — Postgres orders jsonb object
  // keys by length-then-bytes, which would scramble "Waist · Inseam" into
  // "Rise · Waist" on the buyer's page. specRowsFor's own order survives verbatim.
  const specs = specRowsFor(item as unknown as CatalogItem);

  return {
    itemLocalId: item.id,
    code: item.shopCode ?? "",
    brand: item.brand,
    name: item.name ?? null,
    department: item.department,
    category: item.category,
    condition: item.condition,
    specs,
    price: Math.max(0, Math.round(item.targetSellPrice)),
    status: item.status === "sold" ? "sold" : "available",
    photoUrls,
    // Newest listing first on the shop page; stable because publishedAt is.
    sortOrder: item.publishedAt ? Math.floor(item.publishedAt.getTime() / 1000) : 0,
  };
}

// ---------------------------------------------------------------------------
// Photo upload marker
// ---------------------------------------------------------------------------

/**
 * A seller editing a price on mobile data must not re-send four full JPEGs.
 * `items.photoSync` remembers the photo set that last reached storage, so an
 * upsert whose photos are unchanged skips the upload and still publishes the
 * row. The marker is written only after an upload actually succeeds, and
 * cleared whenever those objects stop being ours (a delete wipes the folder;
 * signing out changes whose folder it is).
 */
export type PhotoSync = { key: string; urls: string[] };

/**
 * Identity of a photo set. Order, content and count all matter — each is a
 * reason the uploaded photos would be wrong. Serialised rather than joined on
 * a separator so a URI that happens to contain that separator cannot
 * impersonate two photos and skip an upload that was needed.
 */
export function photoSetKey(localUris: string[]): string {
  return JSON.stringify(localUris ?? []);
}

/** Reads the marker defensively: anything unparseable means "upload again",
 *  which is only ever slower, never wrong. */
export function readPhotoSync(raw: string | null | undefined): PhotoSync | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { k?: unknown; u?: unknown };
    if (typeof p?.k !== "string" || !Array.isArray(p.u)) return null;
    if (!p.u.every((u) => typeof u === "string")) return null;
    return { key: p.k, urls: p.u as string[] };
  } catch {
    return null;
  }
}

export function writePhotoSync(s: PhotoSync): string {
  return JSON.stringify({ k: s.key, u: s.urls });
}

// ---------------------------------------------------------------------------
// Real deps
// ---------------------------------------------------------------------------

function orderedLocalUris(db: LatagDb, itemId: string): string[] {
  const rows = db.select().from(photos).where(eq(photos.itemId, itemId)).all() as Photo[];
  return [...rows]
    .sort((a, b) => (SLOT_ORDER[a.type] ?? 9) - (SLOT_ORDER[b.type] ?? 9))
    .map((p) => p.localUri);
}

function setPhotoSync(db: LatagDb, itemId: string, value: string | null): void {
  try {
    db.update(items).set({ photoSync: value }).where(eq(items.id, itemId)).run();
  } catch {
    // A marker that fails to write only costs a redundant upload next time.
  }
}

/**
 * Forgets every recorded upload. The URLs are scoped to one account's storage
 * folder, so after a sign-out they may no longer be ours to reuse — the next
 * publish must upload afresh rather than point buyers at someone else's bytes.
 */
export function forgetUploadedPhotos(db: LatagDb): void {
  try {
    db.update(items).set({ photoSync: null }).run();
  } catch {
    // Same contract as the rest of this module: nothing here may throw.
  }
}

export function makeSyncDeps(db: LatagDb): DrainDeps {
  return {
    list: () => db.select().from(publishQueue).orderBy(asc(publishQueue.createdAt)).all(),

    upsert: async (r) => {
      const item = db.select().from(items).where(eq(items.id, r.itemId)).all()[0] as Item | undefined;
      // The item was deleted or unpublished after this row was queued (or the
      // toggle never minted a code). There is nothing to publish, and retrying
      // forever would poison the queue — treat it as satisfied.
      if (!item || !item.publishedAt || !item.shopCode) return { ok: true, data: null };

      // Photos are the expensive part of a publish — up to four full JPEGs over
      // a market's mobile data. A price or status edit changes none of them, so
      // an unchanged set reuses the URLs already recorded and uploads nothing.
      const uris = orderedLocalUris(db, item.id);
      const key = photoSetKey(uris);
      const known = readPhotoSync(item.photoSync);

      let photoUrls: string[];
      if (known && known.key === key) {
        photoUrls = known.urls;
      } else {
        const uploaded = await uploadItemPhotos(item.id, uris);
        if (!uploaded.ok) return uploaded;
        photoUrls = uploaded.data;
        // Recorded before the row upsert: the bytes are already up there, so a
        // failed upsert must not buy a second upload on its retry.
        setPhotoSync(db, item.id, writePhotoSync({ key, urls: photoUrls }));
      }

      return upsertShopItem(toShopItemUpsert(item, photoUrls));
    },

    // item_local_id is the local item id, which survives the local row's deletion.
    remove: async (r) => {
      const res = await deleteShopItem(r.itemId);
      // deleteShopItem also empties the item's storage folder, so the recorded
      // URLs now point at nothing. Forgetting them is what makes a later
      // re-publish upload again instead of listing broken images.
      if (res.ok) setPhotoSync(db, r.itemId, null);
      return res;
    },

    done: (id) => { db.delete(publishQueue).where(eq(publishQueue.id, id)).run(); },

    fail: (id, msg) => {
      const row = db.select().from(publishQueue).where(eq(publishQueue.id, id)).all()[0] as PublishQueueRow | undefined;
      if (!row) return;
      db.update(publishQueue).set({ attempts: row.attempts + 1, lastError: msg }).where(eq(publishQueue.id, id)).run();
    },
  };
}

/** Fire-and-forget entry point for app/_layout: drain whatever is pending. */
export async function syncPublishQueue(db: LatagDb): Promise<DrainSummary> {
  try {
    return await drainQueue(makeSyncDeps(db));
  } catch {
    return { ...EMPTY };
  }
}

// ---------------------------------------------------------------------------
// Immediate-nudge entry point (C1)
// ---------------------------------------------------------------------------

let inFlight: Promise<DrainSummary> | null = null;

/**
 * Fire-and-forget nudge after an enqueue (spec §3): without this, publishing
 * or unpublishing only syncs on the next app launch or foreground, so a
 * seller who toggles OFF and sees "Removed from shop" would have a listing
 * that stays publicly live until the app happens to background/reopen.
 * Overlap-guarded so rapid toggles can't stack drains; never throws, never
 * blocks the caller — same offline-first contract as syncPublishQueue.
 */
export function kickSync(db: LatagDb): void {
  if (inFlight) return;
  // Deferred onto a microtask, NOT started inline. repo.ts enqueues from
  // inside db.transaction(...), and drainQueue reads the queue synchronously
  // before its first await — so an inline start would read rows from within
  // the caller's still-open transaction and could act on a row that a
  // rollback then erases. The microtask runs once the synchronous stack
  // (including the commit) has unwound.
  inFlight = Promise.resolve()
    .then(() => syncPublishQueue(db))
    .finally(() => { inFlight = null; });
}
