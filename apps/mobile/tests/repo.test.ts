import { eq } from "drizzle-orm";
import { makeTestDb } from "./helpers/testDb";
import { createSession, addItem, updateItem, addPhoto, replacePhoto, markSold, unmarkSold, deleteItem, updateSession, startScheduledSession, deleteSession } from "../lib/repo";
import { ensureEntitlements, FREE_LOG_LIMIT, FreeTierExhaustedError } from "../lib/entitlements";
import { parseOffsets } from "../lib/schedule";
import { items, photos, sessions } from "../db/schema";

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
test("updateItem without department derives it from the existing row to accept an own-department spec key", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, {
    sessionId: s.id, brand: "Levi's", department: "bottoms", category: "Jeans",
    waistInches: 30, inseamInches: 30, condition: "9/10", targetSellPrice: 500,
  });
  const updated = updateItem(db, item.id, { waistInches: 34 });
  expect(updated.waistInches).toBe(34);
  expect(updated.ptpInches).toBeNull();
});
test("updateItem without department rejects a cross-department spec key, forcing it null", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, {
    sessionId: s.id, brand: "Levi's", department: "bottoms", category: "Jeans",
    waistInches: 32, inseamInches: 30, condition: "9/10", targetSellPrice: 500,
  });
  const updated = updateItem(db, item.id, { ptpInches: 20 });
  expect(updated.ptpInches).toBeNull();
  expect(updated.waistInches).toBe(32); // untouched sibling field survives
});
test("updateItem without department also gates a sizeNote-only patch by the derived department", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const shoe = addItem(db, {
    sessionId: s.id, brand: "Nike", department: "footwear", category: "Sneakers",
    shoeSizeUs: 9, insoleCm: 26, condition: "9/10", targetSellPrice: 500,
  }).item;
  const updatedShoe = updateItem(db, shoe.id, { sizeNote: "Wide fit" });
  expect(updatedShoe.sizeNote).toBe("Wide fit");

  const jeans = addItem(db, {
    sessionId: s.id, brand: "Levi's", department: "bottoms", category: "Jeans",
    waistInches: 32, inseamInches: 30, condition: "9/10", targetSellPrice: 500,
  }).item;
  const updatedJeans = updateItem(db, jeans.id, { sizeNote: "ignored" });
  expect(updatedJeans.sizeNote).toBeNull();
});
test("addItem nulls sizeNote for departments other than accessories/footwear", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, { sessionId: s.id, ...base, sizeNote: "should be ignored" });
  expect(item.sizeNote).toBeNull();
});
test("addItem keeps sizeNote for footwear and accessories", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector" });
  const shoe = addItem(db, {
    sessionId: s.id, brand: "Nike", department: "footwear", category: "Sneakers",
    shoeSizeUs: 9, insoleCm: 26, condition: "9/10", targetSellPrice: 500, sizeNote: "Wide fit",
  }).item;
  expect(shoe.sizeNote).toBe("Wide fit");
  const cap = addItem(db, {
    sessionId: s.id, brand: "New Era", department: "accessories", category: "Cap",
    condition: "9/10", targetSellPrice: 300, sizeNote: "One size",
  }).item;
  expect(cap.sizeNote).toBe("One size");
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
test("createSession accepts location + schedule fields; offsets stored as JSON text", () => {
  const { db } = makeTestDb();
  const when = new Date("2026-07-18T06:30:00");
  const s = createSession(db, {
    name: "Sat run", type: "selector",
    locationName: "Bagong Silang Market", lat: 14.777, lng: 121.043,
    scheduledAt: when, reminderOffsets: [0, 30],
  });
  expect(s.locationName).toBe("Bagong Silang Market");
  expect(s.lat).toBe(14.777);
  expect(s.lng).toBe(121.043);
  expect(s.scheduledAt?.getTime()).toBe(when.getTime());
  expect(parseOffsets(s.reminderOffsets)).toEqual([0, 30]);
  expect(s.reminderNotificationIds).toBeNull();
});
test("createSession without new fields leaves them all null (legacy path unchanged)", () => {
  const { db } = makeTestDb();
  const s = createSession(db, { name: "Run", type: "selector" });
  expect(s.locationName).toBeNull();
  expect(s.lat).toBeNull();
  expect(s.lng).toBeNull();
  expect(s.scheduledAt).toBeNull();
  expect(s.reminderOffsets).toBeNull();
});
test("updateSession patches fields, serializes arrays, and clears via null", () => {
  const { db } = makeTestDb();
  const s = createSession(db, { name: "Run", type: "selector", scheduledAt: new Date("2026-07-18T06:30:00"), reminderOffsets: [30] });
  const when = new Date("2026-07-19T07:00:00");
  const updated = updateSession(db, s.id, {
    name: "Sunday run", locationName: "Anonas", lat: 14.62, lng: 121.06,
    scheduledAt: when, reminderOffsets: [0, 60, 1440], reminderNotificationIds: ["n1", "n2"],
  });
  expect(updated.name).toBe("Sunday run");
  expect(updated.locationName).toBe("Anonas");
  expect(updated.scheduledAt?.getTime()).toBe(when.getTime());
  expect(parseOffsets(updated.reminderOffsets)).toEqual([0, 60, 1440]);
  expect(JSON.parse(updated.reminderNotificationIds!)).toEqual(["n1", "n2"]);
  const cleared = updateSession(db, s.id, { scheduledAt: null, reminderOffsets: null, reminderNotificationIds: null });
  expect(cleared.scheduledAt).toBeNull();
  expect(cleared.reminderOffsets).toBeNull();
  expect(cleared.reminderNotificationIds).toBeNull();
  expect(cleared.locationName).toBe("Anonas"); // untouched fields survive
});
test("startScheduledSession clears schedule, keeps location, returns old notif ids", () => {
  const { db } = makeTestDb();
  const s = createSession(db, {
    name: "Sat run", type: "selector",
    locationName: "Bagong Silang", lat: 14.7, lng: 121.0,
    scheduledAt: new Date("2026-07-18T06:30:00"), reminderOffsets: [0, 30],
  });
  updateSession(db, s.id, { reminderNotificationIds: ["a", "b"] });
  const { session, notificationIds } = startScheduledSession(db, s.id);
  expect(notificationIds).toEqual(["a", "b"]);
  expect(session.scheduledAt).toBeNull();
  expect(session.reminderOffsets).toBeNull();
  expect(session.reminderNotificationIds).toBeNull();
  expect(session.locationName).toBe("Bagong Silang");
  expect(session.lat).toBe(14.7);
  expect(session.lng).toBe(121.0);
});
test("startScheduledSession tolerates a session with no reminders", () => {
  const { db } = makeTestDb();
  const s = createSession(db, { name: "Run", type: "selector", scheduledAt: new Date("2026-07-18T06:30:00") });
  const { session, notificationIds } = startScheduledSession(db, s.id);
  expect(notificationIds).toEqual([]);
  expect(session.scheduledAt).toBeNull();
});
test("deleteSession cascades items + photos, returns photo uris and notif ids", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  const s = createSession(db, { name: "Run", type: "selector", scheduledAt: new Date("2026-07-18T06:30:00") });
  updateSession(db, s.id, { reminderNotificationIds: ["n1"] });
  const { item } = addItem(db, { sessionId: s.id, ...base });
  addPhoto(db, { itemId: item.id, localUri: "file:///m/a.jpg", type: "front" });
  const keep = createSession(db, { name: "Other", type: "selector" });
  const { photoUris, reminderNotificationIds } = deleteSession(db, s.id);
  expect(photoUris).toEqual(["file:///m/a.jpg"]);
  expect(reminderNotificationIds).toEqual(["n1"]);
  expect(db.select().from(sessions).all().map((r) => r.id)).toEqual([keep.id]);
  expect(db.select().from(items).all()).toHaveLength(0);
  expect(db.select().from(photos).all()).toHaveLength(0);
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
