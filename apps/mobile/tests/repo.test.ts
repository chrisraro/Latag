import { makeTestDb } from "./helpers/testDb";
import { createSession, addItem, updateItem, addPhoto, markSold, unmarkSold, deleteItem } from "../lib/repo";
import { ensureEntitlements, FREE_LOG_LIMIT, FreeTierExhaustedError } from "../lib/entitlements";
import { items, photos } from "../db/schema";

const base = { brand: "Nike", category: "Tee", ptpInches: 21.5, lengthInches: 27, condition: "9/10", targetSellPrice: 350 };

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
