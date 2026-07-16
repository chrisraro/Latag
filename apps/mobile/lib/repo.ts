import { eq, and } from "drizzle-orm";
import * as Crypto from "expo-crypto";
import { sessions, items, photos, type Session, type Item, type Photo } from "../db/schema";
import { specFieldsFor, type Department, type SpecKey } from "./catalog";
import { consumeLog } from "./entitlements";

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

export function addItem(db: AnyDb, input: AddItemInput): { item: Item; logsRemaining: number } {
  return db.transaction((tx: AnyDb) => {
    const logsRemaining = consumeLog(tx); // throws before insert when exhausted
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
  return db.select().from(items).where(eq(items.id, id)).all()[0];
}

export function addPhoto(db: AnyDb, input: { itemId: string; localUri: string; type: "front" | "back" | "tag" | "flaw" }): Photo {
  const row = { id: newId(), ...input };
  db.insert(photos).values(row).run();
  return db.select().from(photos).where(eq(photos.id, row.id)).all()[0];
}

/**
 * Replaces all existing photo rows for (itemId, type) with a single new row, transactionally.
 * Used by edit-mode re-shoots so a re-captured slot never leaves duplicate photo rows behind —
 * callers must delete the returned replacedUris (the old files) via deleteFiles.
 */
export function replacePhoto(db: AnyDb, input: { itemId: string; localUri: string; type: "front" | "back" | "tag" | "flaw" }): { photo: Photo; replacedUris: string[] } {
  return db.transaction((tx: AnyDb) => {
    const existing = tx.select().from(photos).where(and(eq(photos.itemId, input.itemId), eq(photos.type, input.type))).all();
    const replacedUris = existing.map((p: Photo) => p.localUri);
    tx.delete(photos).where(and(eq(photos.itemId, input.itemId), eq(photos.type, input.type))).run();
    const row = { id: newId(), ...input };
    tx.insert(photos).values(row).run();
    return { photo: tx.select().from(photos).where(eq(photos.id, row.id)).all()[0], replacedUris };
  });
}

export function markSold(db: AnyDb, id: string, soldPrice: number): Item {
  db.update(items).set({ status: "sold", soldPrice, soldAt: new Date() }).where(eq(items.id, id)).run();
  return db.select().from(items).where(eq(items.id, id)).all()[0];
}

export function unmarkSold(db: AnyDb, id: string): Item {
  db.update(items).set({ status: "available", soldPrice: null, soldAt: null }).where(eq(items.id, id)).run();
  return db.select().from(items).where(eq(items.id, id)).all()[0];
}

export function deleteItem(db: AnyDb, id: string): { photoUris: string[] } {
  return db.transaction((tx: AnyDb) => {
    const uris = tx.select().from(photos).where(eq(photos.itemId, id)).all().map((p: Photo) => p.localUri);
    tx.delete(photos).where(eq(photos.itemId, id)).run();
    tx.delete(items).where(eq(items.id, id)).run();
    return { photoUris: uris };
  });
}
