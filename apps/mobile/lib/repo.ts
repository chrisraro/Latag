import { eq, and, asc } from "drizzle-orm";
import * as Crypto from "expo-crypto";
import { sessions, items, photos, publishQueue, type Session, type Item, type Photo, type PublishQueueRow } from "../db/schema";
import { specFieldsFor, type Department, type SpecKey } from "./catalog";
import { ensureEntitlements, logsRemaining as remainingLogs } from "./entitlements";
// No cycle: shop-sync imports only db/schema, lib/catalog and lib/shop-api —
// never lib/repo — so this stays a plain static import.
import { kickSync } from "./shop-sync";

type AnyDb = any;
const newId = () => Crypto.randomUUID();

export function createSession(db: AnyDb, input: {
  name: string; type: "selector" | "bulto"; totalBaleCost?: number; location?: string;
  locationName?: string | null; lat?: number | null; lng?: number | null;
  scheduledAt?: Date | null; reminderOffsets?: number[] | null;
}): Session {
  const row = {
    id: newId(), name: input.name, type: input.type, totalBaleCost: input.totalBaleCost ?? 0,
    location: input.location ?? null,
    locationName: input.locationName ?? null, lat: input.lat ?? null, lng: input.lng ?? null,
    scheduledAt: input.scheduledAt ?? null,
    reminderOffsets: input.reminderOffsets ? JSON.stringify(input.reminderOffsets) : null,
    createdAt: new Date(),
  };
  db.insert(sessions).values(row).run();
  return db.select().from(sessions).where(eq(sessions.id, row.id)).all()[0];
}

export type SessionPatch = Partial<{
  name: string;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  scheduledAt: Date | null;
  reminderOffsets: number[] | null;          // stored as JSON text
  reminderNotificationIds: string[] | null;  // stored as JSON text
}>;

export function updateSession(db: AnyDb, id: string, patch: SessionPatch): Session {
  const set: Record<string, unknown> = { ...patch };
  if ("reminderOffsets" in patch) set.reminderOffsets = patch.reminderOffsets ? JSON.stringify(patch.reminderOffsets) : null;
  if ("reminderNotificationIds" in patch) set.reminderNotificationIds = patch.reminderNotificationIds ? JSON.stringify(patch.reminderNotificationIds) : null;
  db.update(sessions).set(set).where(eq(sessions.id, id)).run();
  return db.select().from(sessions).where(eq(sessions.id, id)).all()[0];
}

/**
 * Converts a scheduled session into a live one: clears scheduledAt/
 * reminderOffsets/reminderNotificationIds (location pin survives). Returns the
 * previously stored notification ids so the caller can cancelReminders them.
 */
export function startScheduledSession(db: AnyDb, id: string): { session: Session; notificationIds: string[] } {
  const existing = db.select().from(sessions).where(eq(sessions.id, id)).all()[0] as Session | undefined;
  const notificationIds = parseNotifIdsText(existing?.reminderNotificationIds ?? null);
  db.update(sessions).set({ scheduledAt: null, reminderOffsets: null, reminderNotificationIds: null }).where(eq(sessions.id, id)).run();
  return { session: db.select().from(sessions).where(eq(sessions.id, id)).all()[0], notificationIds };
}

/**
 * Deletes a session with the same cascade semantics as deleteItem: photo rows,
 * then item rows, then the session — transactionally. Returns the photo uris
 * (caller deletes files via deleteFiles) and any pending reminder notification
 * ids (caller cancels via cancelReminders).
 */
export function deleteSession(db: AnyDb, id: string): { photoUris: string[]; reminderNotificationIds: string[] } {
  return db.transaction((tx: AnyDb) => {
    const session = tx.select().from(sessions).where(eq(sessions.id, id)).all()[0] as Session | undefined;
    const reminderNotificationIds = parseNotifIdsText(session?.reminderNotificationIds ?? null);
    const sessionItems = tx.select().from(items).where(eq(items.sessionId, id)).all() as Item[];
    const photoUris: string[] = [];
    for (const item of sessionItems) {
      const uris = tx.select().from(photos).where(eq(photos.itemId, item.id)).all().map((p: Photo) => p.localUri);
      photoUris.push(...uris);
      tx.delete(photos).where(eq(photos.itemId, item.id)).run();
      // Deleting a batch deletes its items, so anything it had listed has to
      // come off the shop too — otherwise the storefront outlives the stock.
      queueRemovalInTx(tx, item, db);
    }
    tx.delete(items).where(eq(items.sessionId, id)).run();
    tx.delete(sessions).where(eq(sessions.id, id)).run();
    return { photoUris, reminderNotificationIds };
  });
}

/** Local tolerant JSON-array-of-strings parse (mirrors lib/notifications.parseNotifIds
 *  without importing the expo-notifications module into pure repo code). */
function parseNotifIdsText(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export type AddItemInput = {
  sessionId: string; brand: string; name?: string | null; department: Department; category: string;
  condition: string; individualCost?: number; targetSellPrice: number; sizeNote?: string | null;
} & Partial<Record<SpecKey, number | null>>;

// Exhaustive by construction: Record<SpecKey, null> fails tsc if a SpecKey is ever added without updating this map.
const SPEC_NULLS: Record<SpecKey, null> = {
  ptpInches: null, lengthInches: null, sleeveInches: null,
  waistInches: null, inseamInches: null, riseInches: null, legOpeningInches: null,
  shoeSizeUs: null, insoleCm: null,
  widthInches: null, heightInches: null, depthInches: null, strapDropInches: null,
};
const SPEC_KEYS = Object.keys(SPEC_NULLS) as SpecKey[];

/** sizeNote is a free-text field only meaningful for footwear (width label) and accessories (one-size note). */
function sizeNoteFor(department: Department, sizeNote: string | null | undefined): string | null {
  return department === "accessories" || department === "footwear" ? sizeNote ?? null : null;
}

/**
 * Maps ALL 13 spec columns to value-or-null: the department's own fields (per specFieldsFor)
 * take the input value, every other measurement column is nulled — so switching department
 * on edit can never leave stale specs behind. sizeNote rides along the same guard: kept only
 * for the departments that use it (footwear, accessories), nulled everywhere else.
 */
function specColumnValues(
  department: Department,
  input: Partial<Record<SpecKey, number | null>> & { sizeNote?: string | null },
): Record<SpecKey, number | null> & { sizeNote: string | null } {
  const values: Record<SpecKey, number | null> = { ...SPEC_NULLS };
  for (const field of specFieldsFor(department)) values[field.key] = input[field.key] ?? null;
  return { ...values, sizeNote: sizeNoteFor(department, input.sizeNote) };
}

/** Optional item name: trimmed, and whitespace-only/empty collapses to null. */
function trimmedName(name: string | null | undefined): string | null {
  const t = name?.trim();
  return t ? t : null;
}

/** Logging is uncapped since F1 — `logsRemaining` is reported, never enforced.
 *  The entitlements row (and its logs_used column) is left untouched here;
 *  `consumeLog` stays in lib/entitlements for the Pro gates F2 introduces. */
export function addItem(db: AnyDb, input: AddItemInput): { item: Item; logsRemaining: number } {
  return db.transaction((tx: AnyDb) => {
    const logsRemaining = remainingLogs(ensureEntitlements(tx));
    const row = {
      id: newId(), sessionId: input.sessionId, brand: input.brand, name: trimmedName(input.name),
      department: input.department, category: input.category,
      ...specColumnValues(input.department, input),
      condition: input.condition, individualCost: input.individualCost ?? 0,
      targetSellPrice: input.targetSellPrice, createdAt: new Date(),
    };
    tx.insert(items).values(row).run();
    return { item: tx.select().from(items).where(eq(items.id, row.id)).all()[0], logsRemaining };
  });
}

export function updateItem(db: AnyDb, id: string, patch: Partial<Omit<AddItemInput, "sessionId">>): Item {
  const set: Record<string, unknown> = { ...patch };
  if (patch.department) {
    // Explicit department switch: full reset — every spec column (and sizeNote) is
    // recomputed from scratch so no stale cross-department value can survive.
    Object.assign(set, specColumnValues(patch.department, patch));
  } else {
    // No department in the patch: a spec key or sizeNote could still belong to a
    // different department than the item's own (e.g. a caller bug, or a future UI
    // that doesn't resend department). Derive the department from the existing row
    // and guard those keys individually — untouched sibling fields are left alone.
    const patchSpecKeys = SPEC_KEYS.filter((k) => k in patch);
    const patchHasSizeNote = "sizeNote" in patch;
    if (patchSpecKeys.length > 0 || patchHasSizeNote) {
      const existing = db.select().from(items).where(eq(items.id, id)).all()[0] as Item | undefined;
      if (existing) {
        const department = existing.department as Department;
        const validKeys = new Set(specFieldsFor(department).map((f) => f.key));
        for (const k of patchSpecKeys) set[k] = validKeys.has(k) ? patch[k] : null;
        if (patchHasSizeNote) set.sizeNote = sizeNoteFor(department, patch.sizeNote);
      }
    }
  }
  if ("name" in patch) set.name = trimmedName(patch.name);
  db.update(items).set(set).where(eq(items.id, id)).run();
  const updated = db.select().from(items).where(eq(items.id, id)).all()[0] as Item;
  syncIfPublished(db, updated, "upsert");
  return updated;
}

/**
 * AUTO-SYNC (spec §3, review I1): a re-shoot changes what a published listing
 * shows buyers, so it enqueues exactly like any other edit — otherwise the old
 * photo stays public until some unrelated change happens to touch the queue.
 */
export function addPhoto(db: AnyDb, input: { itemId: string; localUri: string; type: "front" | "back" | "tag" | "flaw" }): Photo {
  const row = { id: newId(), ...input };
  db.insert(photos).values(row).run();
  const item = db.select().from(items).where(eq(items.id, input.itemId)).all()[0] as Item | undefined;
  syncIfPublished(db, item, "upsert");
  return db.select().from(photos).where(eq(photos.id, row.id)).all()[0];
}

/**
 * Replaces all existing photo rows for (itemId, type) with a single new row, transactionally.
 * Used by edit-mode re-shoots so a re-captured slot never leaves duplicate photo rows behind —
 * callers must delete the returned replacedUris (the old files) via deleteFiles.
 *
 * AUTO-SYNC (review I1): the item is looked up inside this same transaction so
 * a re-shoot on a published item enqueues an upsert exactly like addPhoto does.
 */
export function replacePhoto(db: AnyDb, input: { itemId: string; localUri: string; type: "front" | "back" | "tag" | "flaw" }): { photo: Photo; replacedUris: string[] } {
  return db.transaction((tx: AnyDb) => {
    const existing = tx.select().from(photos).where(and(eq(photos.itemId, input.itemId), eq(photos.type, input.type))).all();
    const replacedUris = existing.map((p: Photo) => p.localUri);
    tx.delete(photos).where(and(eq(photos.itemId, input.itemId), eq(photos.type, input.type))).run();
    const row = { id: newId(), ...input };
    tx.insert(photos).values(row).run();
    const item = tx.select().from(items).where(eq(items.id, input.itemId)).all()[0] as Item | undefined;
    queueUpsertInTx(tx, item, db);
    return { photo: tx.select().from(photos).where(eq(photos.id, row.id)).all()[0], replacedUris };
  });
}

export function markSold(db: AnyDb, id: string, soldPrice: number): Item {
  db.update(items).set({ status: "sold", soldPrice, soldAt: new Date() }).where(eq(items.id, id)).run();
  const sold = db.select().from(items).where(eq(items.id, id)).all()[0] as Item;
  // The listing follows the sale: it flips to SOLD, or leaves the shop entirely
  // when the seller keeps show_sold off. Either way the buyer stops being told
  // something is available when it isn't.
  syncIfPublished(db, sold, "upsert");
  return sold;
}

export function unmarkSold(db: AnyDb, id: string): Item {
  db.update(items).set({ status: "available", soldPrice: null, soldAt: null }).where(eq(items.id, id)).run();
  const available = db.select().from(items).where(eq(items.id, id)).all()[0] as Item;
  syncIfPublished(db, available, "upsert");
  return available;
}

export function deleteItem(db: AnyDb, id: string): { photoUris: string[] } {
  return db.transaction((tx: AnyDb) => {
    const item = tx.select().from(items).where(eq(items.id, id)).all()[0] as Item | undefined;
    const uris = tx.select().from(photos).where(eq(photos.itemId, id)).all().map((p: Photo) => p.localUri);
    tx.delete(photos).where(eq(photos.itemId, id)).run();
    tx.delete(items).where(eq(items.id, id)).run();
    // Queued before the row is gone but drained long after: the queue carries
    // the item's local id, which is all deleteShopItem needs.
    queueRemovalInTx(tx, item, db);
    return { photoUris: uris };
  });
}

// ------------------------------------------------------------ storefront publish state

/** Ambiguous glyphs (0/O, 1/I/L) are excluded so a buyer can read a code aloud
 *  off a photo without ever getting it wrong. */
const SHOP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SHOP_CODE_LENGTH = 5;
/** Re-rolls this many times before giving up on a 5-char code (M2). */
const SHOP_CODE_MAX_ATTEMPTS = 10;

/** Rejection sampling keeps every character equally likely (a plain byte % 31
 *  would over-weight the first eight letters of the alphabet). */
function randomCode(length: number): string {
  const limit = Math.floor(256 / SHOP_CODE_ALPHABET.length) * SHOP_CODE_ALPHABET.length;
  let code = "";
  while (code.length < length) {
    for (const byte of Crypto.getRandomBytes(length)) {
      if (byte >= limit) continue;
      code += SHOP_CODE_ALPHABET[byte % SHOP_CODE_ALPHABET.length];
      if (code.length === length) break;
    }
  }
  return code;
}

function shopCodeTaken(db: AnyDb, code: string): boolean {
  return db.select().from(items).where(eq(items.shopCode, code)).all().length > 0;
}

/**
 * Mints a buyer-facing item code, `LT-` + 5 unambiguous characters, checked
 * against the LOCAL items table (M2): without this, a colliding code hits
 * `shop_items_shop_id_code_key` on the network, the queue row retries 5x and
 * gives up, and the UI's own advice — toggle off/on — reuses the exact same
 * colliding code, stranding the item forever. A collision here re-rolls; if
 * the whole 5-char space is somehow still colliding after
 * SHOP_CODE_MAX_ATTEMPTS tries, a longer code is minted instead of looping.
 */
export function generateShopCode(db: AnyDb): string {
  for (let attempt = 0; attempt < SHOP_CODE_MAX_ATTEMPTS; attempt++) {
    const code = `LT-${randomCode(SHOP_CODE_LENGTH)}`;
    if (!shopCodeTaken(db, code)) return code;
  }
  for (;;) {
    const code = `LT-${randomCode(SHOP_CODE_LENGTH + 2)}`;
    if (!shopCodeTaken(db, code)) return code;
  }
}

/** Queue rows are drained oldest-first, so two enqueues inside the same
 *  millisecond must still order by insertion. This keeps createdAt strictly
 *  increasing within a run; across launches wall-clock time already is. */
let lastEnqueuedMs = 0;
function nextEnqueueTime(): Date {
  lastEnqueuedMs = Math.max(Date.now(), lastEnqueuedMs + 1);
  return new Date(lastEnqueuedMs);
}

/**
 * Queues a storefront sync for one item, replacing any row already pending for
 * it — last write wins, so an edit-then-unpublish burst collapses to the single
 * operation that reflects reality. Attempts and the last error reset with it.
 */
export function enqueuePublish(db: AnyDb, itemId: string, op: "upsert" | "delete"): PublishQueueRow {
  return db.transaction((tx: AnyDb) => writeQueueRow(tx, itemId, op));
}

/** The queue write itself, run on whatever handle the caller holds: a fresh
 *  transaction from `enqueuePublish`, or an already-open `tx` when the caller
 *  is mid-transaction (deleteItem/deleteSession) — drizzle cannot nest one. */
function writeQueueRow(exec: AnyDb, itemId: string, op: "upsert" | "delete"): PublishQueueRow {
  exec.delete(publishQueue).where(eq(publishQueue.itemId, itemId)).run();
  const row = { id: newId(), itemId, op, attempts: 0, lastError: null, createdAt: nextEnqueueTime() };
  exec.insert(publishQueue).values(row).run();
  return exec.select().from(publishQueue).where(eq(publishQueue.id, row.id)).all()[0];
}

/**
 * AUTO-SYNC (spec §3). A published item is two things at once — a local row and
 * a public listing — so every mutation has to reach the storefront or the shop
 * starts lying about price, size or availability. Unpublished items are purely
 * local and must never enqueue anything: an item the seller never opted in for
 * has no path to the network at all.
 *
 * `item` is the row as it stands after the write; `publishedAt` on it is the
 * single opt-in flag.
 */
function syncIfPublished(db: AnyDb, item: Item | undefined, op: "upsert" | "delete"): void {
  if (!item?.publishedAt) return;
  enqueuePublish(db, item.id, op);
  // C1: nudge the drain immediately instead of waiting for the next launch or
  // foreground — otherwise a published item can sit stale (or, unpublished,
  // stay PUBLICLY LIVE) until the app happens to background and reopen.
  kickSync(db);
}

/** Same rule for deletions, except the caller is already inside a transaction
 *  (and holds the row it is about to destroy), so the queue write joins it.
 *  `db` (not `tx`) is what's handed to kickSync: its async continuation runs
 *  after this transaction returns, so it must hold a handle good for then. */
function queueRemovalInTx(tx: AnyDb, item: Item | undefined, db: AnyDb): void {
  if (!item?.publishedAt) return;
  writeQueueRow(tx, item.id, "delete");
  kickSync(db);
}

/** Same shape as queueRemovalInTx but for an upsert queued from inside an
 *  already-open transaction (replacePhoto) — see its comment for why `db`. */
function queueUpsertInTx(tx: AnyDb, item: Item | undefined, db: AnyDb): void {
  if (!item?.publishedAt) return;
  writeQueueRow(tx, item.id, "upsert");
  kickSync(db);
}

/** Removes a drained row. Called only after the network op succeeded. */
export function dequeuePublish(db: AnyDb, id: string): void {
  db.delete(publishQueue).where(eq(publishQueue.id, id)).run();
}

/** Pending sync rows, oldest first. */
export function listPublishQueue(db: AnyDb): PublishQueueRow[] {
  return db.select().from(publishQueue).orderBy(asc(publishQueue.createdAt)).all();
}

/** Records a failed attempt. The row stays queued — nothing is ever lost. */
export function bumpAttempt(db: AnyDb, id: string, error: string): void {
  const row = db.select().from(publishQueue).where(eq(publishQueue.id, id)).all()[0] as PublishQueueRow | undefined;
  if (!row) return;
  db.update(publishQueue).set({ attempts: row.attempts + 1, lastError: error }).where(eq(publishQueue.id, id)).run();
}

/**
 * Flags an item as live on the storefront. The caller owns the code: pass the
 * item's existing shopCode to keep it stable, or a fresh generateShopCode().
 */
export function markPublished(db: AnyDb, itemId: string, code: string): Item {
  db.update(items).set({ publishedAt: new Date(), shopCode: code }).where(eq(items.id, itemId)).run();
  return db.select().from(items).where(eq(items.id, itemId)).all()[0];
}

/** Takes an item off the storefront locally; the queue carries the removal. */
/**
 * Unpublishing clears publishedAt but DELIBERATELY keeps shopCode: a buyer may
 * still be holding the old code from a screenshot or a message thread, so the
 * code must identify the same item forever. Republishing reuses it.
 */
export function markUnpublished(db: AnyDb, itemId: string): Item {
  db.update(items).set({ publishedAt: null }).where(eq(items.id, itemId)).run();
  return db.select().from(items).where(eq(items.id, itemId)).all()[0];
}
