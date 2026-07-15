import { eq } from "drizzle-orm";
import { makeTestDb } from "./helpers/testDb";
import { createSession, addItem, updateItem, addPhoto, replacePhoto, markSold, unmarkSold, deleteItem } from "../lib/repo";
import { ensureEntitlements, FREE_LOG_LIMIT, FreeTierExhaustedError } from "../lib/entitlements";
import { items, photos } from "../db/schema";

const base = { brand: "Nike", department: "tops" as const, category: "Tee", ptpInches: 21.5, lengthInches: 27, condition: "9/10", targetSellPrice: 350 };

test("create session → add item consumes a log", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item, logsRemaining } = addItem(db, { sessionId: s.id, ...base, individualCost: 60 });
  expect(item.status).toBe("available");
  expect(logsRemaining).toBe(FREE_LOG_LIMIT - 1);
});
test("exhausted tier blocks insert atomically", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "bulto", totalBaleCost: 10000 });
  for (let i = 0; i < FREE_LOG_LIMIT; i++) addItem(db, { sessionId: s.id, ...base });
  expect(() => addItem(db, { sessionId: s.id, ...base })).toThrow(FreeTierExhaustedError);
  expect(db.select().from(items).all()).toHaveLength(FREE_LOG_LIMIT);
});
test("edits are free; sold flow records and clears price+date", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, { sessionId: s.id, ...base });
  updateItem(db, item.id, { targetSellPrice: 400 });
  const soldItem = markSold(db, item.id, 380);
  expect(soldItem.status).toBe("sold");
  expect(soldItem.soldPrice).toBe(380);
  expect(soldItem.soldAt).toBeInstanceOf(Date);
  const undone = unmarkSold(db, item.id);
  expect(undone.status).toBe("available");
  expect(undone.soldPrice).toBeNull();
});
test("deleteItem removes rows, returns photo uris, never refunds logs", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item, logsRemaining: before } = addItem(db, { sessionId: s.id, ...base });
  addPhoto(db, { itemId: item.id, localUri: "file:///m/a.jpg", type: "front" });
  const { photoUris } = deleteItem(db, item.id);
  expect(photoUris).toEqual(["file:///m/a.jpg"]);
  expect(db.select().from(items).all()).toHaveLength(0);
  expect(db.select().from(photos).all()).toHaveLength(0);
  const after = addItem(db, { sessionId: s.id, ...base }).logsRemaining;
  expect(after).toBe(before - 1); // no refund happened
});
test("replacePhoto swaps a single slot's row without leaving duplicates", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, { sessionId: s.id, ...base });
  addPhoto(db, { itemId: item.id, localUri: "file:///m/front-old.jpg", type: "front" });
  const { photo, replacedUris } = replacePhoto(db, { itemId: item.id, localUri: "file:///m/front-new.jpg", type: "front" });
  const frontRows = db.select().from(photos).where(eq(photos.itemId, item.id)).all().filter((p) => p.type === "front");
  expect(frontRows).toHaveLength(1);
  expect(frontRows[0].localUri).toBe("file:///m/front-new.jpg");
  expect(photo.localUri).toBe("file:///m/front-new.jpg");
  expect(replacedUris).toEqual(["file:///m/front-old.jpg"]);
});
test("addItem writes only the department's own specs — cross-department fields stored null", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, {
    sessionId: s.id, brand: "Levi's", department: "bottoms", category: "Jeans",
    waistInches: 32, inseamInches: 30, ptpInches: 22, // ptp is bogus for bottoms — must not be stored
    condition: "9/10", targetSellPrice: 500,
  });
  expect(item.department).toBe("bottoms");
  expect(item.waistInches).toBe(32);
  expect(item.inseamInches).toBe(30);
  expect(item.ptpInches).toBeNull();
});
test("updateItem department switch nulls the previous department's specs", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, {
    sessionId: s.id, brand: "Levi's", department: "bottoms", category: "Jeans",
    waistInches: 32, inseamInches: 30, condition: "9/10", targetSellPrice: 500,
  });
  expect(item.waistInches).toBe(32); // precondition: specs really were stored before the switch
  expect(item.inseamInches).toBe(30);
  const updated = updateItem(db, item.id, {
    department: "footwear", category: "Sneakers", shoeSizeUs: 9.5, insoleCm: 25.5, sizeNote: "Wide fit",
  });
  expect(updated.department).toBe("footwear");
  expect(updated.shoeSizeUs).toBe(9.5);
  expect(updated.insoleCm).toBe(25.5);
  expect(updated.waistInches).toBeNull();
  expect(updated.inseamInches).toBeNull();
  expect(updated.sizeNote).toBe("Wide fit");
});
test("updateItem without a department change leaves existing specs untouched", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, { sessionId: s.id, ...base });
  const updated = updateItem(db, item.id, { targetSellPrice: 400 });
  expect(updated.ptpInches).toBe(21.5);
  expect(updated.lengthInches).toBe(27);
});
test("item name: stored trimmed; whitespace-only becomes null on add and edit", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const blank = addItem(db, { sessionId: s.id, ...base, name: "  " }).item;
  expect(blank.name).toBeNull();
  const named = addItem(db, { sessionId: s.id, ...base, name: " Detroit Jacket " }).item;
  expect(named.name).toBe("Detroit Jacket");
  const cleared = updateItem(db, named.id, { name: "   " });
  expect(cleared.name).toBeNull();
});
test("replacePhoto on a type with no existing row behaves like addPhoto", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, { sessionId: s.id, ...base });
  const { photo, replacedUris } = replacePhoto(db, { itemId: item.id, localUri: "file:///m/back.jpg", type: "back" });
  expect(replacedUris).toEqual([]);
  expect(photo.localUri).toBe("file:///m/back.jpg");
  expect(db.select().from(photos).where(eq(photos.itemId, item.id)).all()).toHaveLength(1);
});
