import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { makeTestDb } from "./helpers/testDb";
import * as s from "../db/schema";

test("schema round-trips a session, item, photo, entitlements", () => {
  const { db } = makeTestDb();
  db.insert(s.sessions).values({ id: "s1", name: "Naga Run", type: "bulto", totalBaleCost: 10000, location: "Naga", createdAt: new Date() }).run();
  db.insert(s.items).values({ id: "i1", sessionId: "s1", brand: "Nike", category: "Tee", ptpInches: 21.5, lengthInches: 27, condition: "9/10", targetSellPrice: 350, createdAt: new Date() }).run();
  db.insert(s.photos).values({ id: "p1", itemId: "i1", localUri: "file:///x/a.jpg", type: "front" }).run();
  db.insert(s.entitlements).values({ id: 1 }).run();
  const item = db.select().from(s.items).all()[0];
  expect(item.status).toBe("available");
  expect(item.individualCost).toBe(0);
  expect(db.select().from(s.entitlements).all()[0].logsUsed).toBe(0);
});

test("old-shape item (no department/name/specs) gets department 'tops', null name and spec cols, ptp/length intact", () => {
  const { db } = makeTestDb();
  db.insert(s.sessions).values({ id: "s1", name: "Naga Run", type: "bulto", createdAt: new Date() }).run();
  db.insert(s.items).values({ id: "i1", sessionId: "s1", brand: "Nike", category: "Tee", ptpInches: 21.5, lengthInches: 27, condition: "9/10", targetSellPrice: 350, createdAt: new Date() }).run();
  const item = db.select().from(s.items).all()[0];
  expect(item.department).toBe("tops");
  expect(item.name).toBeNull();
  expect(item.sleeveInches).toBeNull();
  expect(item.waistInches).toBeNull();
  expect(item.inseamInches).toBeNull();
  expect(item.riseInches).toBeNull();
  expect(item.legOpeningInches).toBeNull();
  expect(item.shoeSizeUs).toBeNull();
  expect(item.insoleCm).toBeNull();
  expect(item.widthInches).toBeNull();
  expect(item.heightInches).toBeNull();
  expect(item.depthInches).toBeNull();
  expect(item.strapDropInches).toBeNull();
  expect(item.sizeNote).toBeNull();
  expect(item.ptpInches).toBe(21.5);
  expect(item.lengthInches).toBe(27);
});

test("bottoms item with null ptp/length and waist 32 inserts", () => {
  const { db } = makeTestDb();
  db.insert(s.sessions).values({ id: "s1", name: "Run", type: "selector", createdAt: new Date() }).run();
  db.insert(s.items).values({
    id: "i2", sessionId: "s1", brand: "Levi's", category: "Jeans", department: "bottoms",
    name: "501 Original", ptpInches: null, lengthInches: null, waistInches: 32, inseamInches: 30,
    condition: "8/10", targetSellPrice: 500, createdAt: new Date(),
  }).run();
  const item = db.select().from(s.items).all()[0];
  expect(item.department).toBe("bottoms");
  expect(item.name).toBe("501 Original");
  expect(item.ptpInches).toBeNull();
  expect(item.lengthInches).toBeNull();
  expect(item.waistInches).toBe(32);
  expect(item.inseamInches).toBe(30);
});

test("scheduled session with location pin and reminder offsets round-trips", () => {
  const { db } = makeTestDb();
  const scheduledAt = new Date(1800000000 * 1000);
  db.insert(s.sessions).values({
    id: "s2", name: "Planned Run", type: "selector", createdAt: new Date(),
    locationName: "Naga City Public Market", lat: 13.6218, lng: 123.1948,
    scheduledAt, reminderOffsets: "[0,60,1440]", reminderNotificationIds: '["n1","n2"]',
  }).run();
  const row = db.select().from(s.sessions).all()[0];
  expect(row.locationName).toBe("Naga City Public Market");
  expect(row.lat).toBe(13.6218);
  expect(row.lng).toBe(123.1948);
  expect(row.scheduledAt).toEqual(scheduledAt);
  expect(row.reminderOffsets).toBe("[0,60,1440]");
  expect(row.reminderNotificationIds).toBe('["n1","n2"]');
});

test("unscheduled session leaves all location/schedule columns null", () => {
  const { db } = makeTestDb();
  db.insert(s.sessions).values({ id: "s3", name: "Plain Run", type: "bulto", createdAt: new Date() }).run();
  const row = db.select().from(s.sessions).all()[0];
  expect(row.locationName).toBeNull();
  expect(row.lat).toBeNull();
  expect(row.lng).toBeNull();
  expect(row.scheduledAt).toBeNull();
  expect(row.reminderOffsets).toBeNull();
  expect(row.reminderNotificationIds).toBeNull();
});

test("user_brands accepts a row", () => {
  const { db } = makeTestDb();
  db.insert(s.userBrands).values({ id: "b1", name: "Osaka Vintage", createdAt: new Date() }).run();
  const row = db.select().from(s.userBrands).all()[0];
  expect(row.name).toBe("Osaka Vintage");
  expect(row.createdAt).toBeInstanceOf(Date);
});

test("migration rebuild preserves pre-existing item rows (zero data loss)", () => {
  const drizzleDir = path.join(__dirname, "..", "drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const tags: string[] = journal.entries.map((e) => e.tag);
  expect(tags.length).toBeGreaterThanOrEqual(3); // 0000 + E1 + E2 sessions migration

  const sqlite = new Database(":memory:");
  // Apply the initial migration only, then seed an old-shape row.
  sqlite.exec(fs.readFileSync(path.join(drizzleDir, `${tags[0]}.sql`), "utf8"));
  sqlite.prepare(
    "INSERT INTO sessions (id, name, type, total_bale_cost, location, created_at) VALUES ('s1', 'Old Run', 'bulto', 10000, 'Naga', 1700000000)"
  ).run();
  sqlite.prepare(
    "INSERT INTO items (id, session_id, brand, category, ptp_inches, length_inches, condition, individual_cost, target_sell_price, status, sold_price, sold_at, created_at) VALUES ('i1', 's1', 'Carhartt', 'Jacket', 24.5, 29, '9/10', 120, 950, 'sold', 900, 1700000100, 1700000000)"
  ).run();
  // A child photos row must also survive the items table rebuild, with item_id intact.
  sqlite.prepare(
    "INSERT INTO photos (id, item_id, local_uri, type) VALUES ('p1', 'i1', 'file:///x/a.jpg', 'front')"
  ).run();
  // Apply the remaining migrations over live data.
  for (const tag of tags.slice(1)) {
    sqlite.exec(fs.readFileSync(path.join(drizzleDir, `${tag}.sql`), "utf8"));
  }
  const row = sqlite.prepare("SELECT * FROM items WHERE id = 'i1'").get() as Record<string, unknown>;
  expect(row.brand).toBe("Carhartt");
  expect(row.category).toBe("Jacket");
  expect(row.ptp_inches).toBe(24.5);
  expect(row.length_inches).toBe(29);
  expect(row.condition).toBe("9/10");
  expect(row.individual_cost).toBe(120);
  expect(row.target_sell_price).toBe(950);
  expect(row.status).toBe("sold");
  expect(row.sold_price).toBe(900);
  expect(row.sold_at).toBe(1700000100);
  expect(row.created_at).toBe(1700000000);
  expect(row.department).toBe("tops");
  expect(row.name).toBeNull();
  expect(row.waist_inches).toBeNull();
  expect(sqlite.prepare("SELECT count(*) AS c FROM user_brands").get()).toEqual({ c: 0 });
  const photoRow = sqlite.prepare("SELECT * FROM photos WHERE id = 'p1'").get() as Record<string, unknown>;
  expect(photoRow.item_id).toBe("i1");
  expect(photoRow.local_uri).toBe("file:///x/a.jpg");
  // Old-shape session row survives the E2 sessions migration: legacy fields intact, new cols null.
  const sessionRow = sqlite.prepare("SELECT * FROM sessions WHERE id = 's1'").get() as Record<string, unknown>;
  expect(sessionRow.name).toBe("Old Run");
  expect(sessionRow.type).toBe("bulto");
  expect(sessionRow.total_bale_cost).toBe(10000);
  expect(sessionRow.location).toBe("Naga");
  expect(sessionRow.created_at).toBe(1700000000);
  expect(sessionRow.location_name).toBeNull();
  expect(sessionRow.lat).toBeNull();
  expect(sessionRow.lng).toBeNull();
  expect(sessionRow.scheduled_at).toBeNull();
  expect(sessionRow.reminder_offsets).toBeNull();
  expect(sessionRow.reminder_notification_ids).toBeNull();
  sqlite.close();
});
