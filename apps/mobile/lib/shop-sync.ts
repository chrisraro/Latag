import { asc, eq } from "drizzle-orm";
import { items, photos, publishQueue, type Item, type Photo, type PublishQueueRow } from "../db/schema";
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
  const specs: Record<string, number | string | null> = {};
  for (const { k, v } of specRowsFor(item as unknown as CatalogItem)) specs[k] = v;

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
// Real deps
// ---------------------------------------------------------------------------

type AnyDb = any;

function orderedLocalUris(db: AnyDb, itemId: string): string[] {
  const rows = db.select().from(photos).where(eq(photos.itemId, itemId)).all() as Photo[];
  return [...rows]
    .sort((a, b) => (SLOT_ORDER[a.type] ?? 9) - (SLOT_ORDER[b.type] ?? 9))
    .map((p) => p.localUri);
}

export function makeSyncDeps(db: AnyDb): DrainDeps {
  return {
    list: () => db.select().from(publishQueue).orderBy(asc(publishQueue.createdAt)).all(),

    upsert: async (r) => {
      const item = db.select().from(items).where(eq(items.id, r.itemId)).all()[0] as Item | undefined;
      // The item was deleted or unpublished after this row was queued (or the
      // toggle never minted a code). There is nothing to publish, and retrying
      // forever would poison the queue — treat it as satisfied.
      if (!item || !item.publishedAt || !item.shopCode) return { ok: true, data: null };

      const uploaded = await uploadItemPhotos(item.id, orderedLocalUris(db, item.id));
      if (!uploaded.ok) return uploaded;
      return upsertShopItem(toShopItemUpsert(item, uploaded.data));
    },

    // item_local_id is the local item id, which survives the local row's deletion.
    remove: (r) => deleteShopItem(r.itemId),

    done: (id) => { db.delete(publishQueue).where(eq(publishQueue.id, id)).run(); },

    fail: (id, msg) => {
      const row = db.select().from(publishQueue).where(eq(publishQueue.id, id)).all()[0] as PublishQueueRow | undefined;
      if (!row) return;
      db.update(publishQueue).set({ attempts: row.attempts + 1, lastError: msg }).where(eq(publishQueue.id, id)).run();
    },
  };
}

/** Fire-and-forget entry point for app/_layout: drain whatever is pending. */
export async function syncPublishQueue(db: AnyDb): Promise<DrainSummary> {
  try {
    return await drainQueue(makeSyncDeps(db));
  } catch {
    return { ...EMPTY };
  }
}
