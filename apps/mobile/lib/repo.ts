import { eq, and } from "drizzle-orm";
import * as Crypto from "expo-crypto";
import { sessions, items, photos, type Session, type Item, type Photo } from "../db/schema";
import { consumeLog } from "./entitlements";

type AnyDb = any;
const newId = () => Crypto.randomUUID();

export function createSession(db: AnyDb, input: { name: string; type: "selector" | "bulto"; totalBaleCost?: number; location?: string }): Session {
  const row = { id: newId(), name: input.name, type: input.type, totalBaleCost: input.totalBaleCost ?? 0, location: input.location ?? null, createdAt: new Date() };
  db.insert(sessions).values(row).run();
  return db.select().from(sessions).where(eq(sessions.id, row.id)).all()[0];
}

export type AddItemInput = {
  sessionId: string; brand: string; category: string; ptpInches: number; lengthInches: number;
  condition: string; individualCost?: number; targetSellPrice: number;
};

export function addItem(db: AnyDb, input: AddItemInput): { item: Item; logsRemaining: number } {
  return db.transaction((tx: AnyDb) => {
    const logsRemaining = consumeLog(tx); // throws before insert when exhausted
    const row = {
      id: newId(), sessionId: input.sessionId, brand: input.brand, category: input.category,
      ptpInches: input.ptpInches, lengthInches: input.lengthInches, condition: input.condition,
      individualCost: input.individualCost ?? 0, targetSellPrice: input.targetSellPrice, createdAt: new Date(),
    };
    tx.insert(items).values(row).run();
    return { item: tx.select().from(items).where(eq(items.id, row.id)).all()[0], logsRemaining };
  });
}

export function updateItem(db: AnyDb, id: string, patch: Partial<Omit<AddItemInput, "sessionId">>): Item {
  db.update(items).set(patch).where(eq(items.id, id)).run();
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
