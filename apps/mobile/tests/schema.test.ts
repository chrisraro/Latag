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
  expect(db.select().from(s.entitlements).all()[0].pro).toBe(false);
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

test("publish_queue accepts a row and defaults attempts to 0", () => {
  const { db } = makeTestDb();
  const createdAt = new Date(1800000000 * 1000);
  db.insert(s.publishQueue).values({ id: "q1", itemId: "i1", op: "upsert", createdAt }).run();
  const row = db.select().from(s.publishQueue).all()[0];
  expect(row.itemId).toBe("i1");
  expect(row.op).toBe("upsert");
  expect(row.attempts).toBe(0);
  expect(row.lastError).toBeNull();
  expect(row.createdAt).toEqual(createdAt);
});

test("a freshly logged item is unpublished: publishedAt and shopCode both null", () => {
  const { db } = makeTestDb();
  db.insert(s.sessions).values({ id: "s1", name: "Run", type: "selector", createdAt: new Date() }).run();
  db.insert(s.items).values({ id: "i1", sessionId: "s1", brand: "Nike", category: "Tee", condition: "9/10", targetSellPrice: 350, createdAt: new Date() }).run();
  const item = db.select().from(s.items).all()[0];
  expect(item.publishedAt).toBeNull();
  expect(item.shopCode).toBeNull();
});

test("published item round-trips publishedAt + shopCode", () => {
  const { db } = makeTestDb();
  const publishedAt = new Date(1800000000 * 1000);
  db.insert(s.sessions).values({ id: "s1", name: "Run", type: "selector", createdAt: new Date() }).run();
  db.insert(s.items).values({ id: "i1", sessionId: "s1", brand: "Nike", category: "Tee", condition: "9/10", targetSellPrice: 350, createdAt: new Date(), publishedAt, shopCode: "LT-7K2Q9" }).run();
  const item = db.select().from(s.items).all()[0];
  expect(item.publishedAt).toEqual(publishedAt);
  expect(item.shopCode).toBe("LT-7K2Q9");
});

test("migration rebuild preserves pre-existing item rows (zero data loss)", () => {
  const drizzleDir = path.join(__dirname, "..", "drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const tags: string[] = journal.entries.map((e) => e.tag);
  expect(tags.length).toBeGreaterThanOrEqual(4); // 0000 + E1 + E2 sessions + F2 publish state

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
  // F2: the pre-existing item survives 0003 as an unpublished row, and the
  // publish queue table exists and accepts a row.
  expect(row.published_at).toBeNull();
  expect(row.shop_code).toBeNull();
  // The photo-upload marker starts empty, so the first publish of a legacy row uploads.
  expect(row.photo_sync).toBeNull();
  sqlite.prepare(
    "INSERT INTO publish_queue (id, item_id, op, created_at) VALUES ('q1', 'i1', 'upsert', 1700000200)"
  ).run();
  const queued = sqlite.prepare("SELECT * FROM publish_queue WHERE id = 'q1'").get() as Record<string, unknown>;
  expect(queued.item_id).toBe("i1");
  expect(queued.op).toBe("upsert");
  expect(queued.attempts).toBe(0);
  expect(queued.last_error).toBeNull();
  sqlite.close();
});

test("G2 T1: session_id-nullable rebuild preserves a fully populated item + child rows (zero data loss)", () => {
  const drizzleDir = path.join(__dirname, "..", "drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const tags: string[] = journal.entries.map((e) => e.tag);
  // Today's head is 0000..0004 (5 migrations). G2 T1 adds the session_id-nullable
  // rebuild as a 6th — this assertion is the RED: it fails until that migration exists.
  expect(tags.length).toBeGreaterThanOrEqual(6);

  const sqlite = new Database(":memory:");
  // Apply every migration up to today's head — i.e. the shape the item table has
  // on a real device right now, BEFORE the session_id rebuild.
  const headTags = tags.slice(0, 5);
  for (const tag of headTags) {
    sqlite.exec(fs.readFileSync(path.join(drizzleDir, `${tag}.sql`), "utf8"));
  }

  const createdAt = 1700000000;
  const soldAt = 1700000100;
  const publishedAt = 1700000200;
  const queuedAt = 1700000300;

  sqlite.prepare(
    "INSERT INTO sessions (id, name, type, total_bale_cost, location, created_at) VALUES ('s1', 'Naga Run', 'bulto', 10000, 'Naga', ?)"
  ).run(createdAt);

  // Every column that exists at today's head, fully populated — nothing left null
  // except columns that are mutually exclusive by department (n/a here, all set).
  sqlite.prepare(`
    INSERT INTO items (
      id, session_id, brand, name, department, category,
      ptp_inches, length_inches, sleeve_inches, waist_inches, inseam_inches, rise_inches,
      leg_opening_inches, shoe_size_us, insole_cm, width_inches, height_inches, depth_inches,
      strap_drop_inches, size_note, condition, individual_cost, target_sell_price, status,
      sold_price, sold_at, created_at, published_at, shop_code, photo_sync
    ) VALUES (
      'i1', 's1', 'Carhartt', 'Detroit Jacket', 'tops', 'Jacket',
      24.5, 29, 25.5, 40, 31, 11,
      20, 10.5, 27.5, 12, 8, 4,
      1.5, 'Wide fit', '9/10', 120, 950, 'sold',
      900, ?, ?, ?, 'LT-7K2Q9', '{"k":["file:///a.jpg"],"u":["https://x/a.jpg"]}'
    )
  `).run(soldAt, createdAt, publishedAt);

  sqlite.prepare(
    "INSERT INTO photos (id, item_id, local_uri, type) VALUES ('p1', 'i1', 'file:///x/a.jpg', 'front')"
  ).run();
  sqlite.prepare(
    "INSERT INTO publish_queue (id, item_id, op, attempts, last_error, created_at) VALUES ('q1', 'i1', 'upsert', 2, 'timeout', ?)"
  ).run(queuedAt);

  // Apply the remaining migrations, including the session_id-nullable rebuild.
  for (const tag of tags.slice(5)) {
    sqlite.exec(fs.readFileSync(path.join(drizzleDir, `${tag}.sql`), "utf8"));
  }

  const row = sqlite.prepare("SELECT * FROM items WHERE id = 'i1'").get() as Record<string, unknown>;
  expect(row.session_id).toBe("s1");
  expect(row.brand).toBe("Carhartt");
  expect(row.name).toBe("Detroit Jacket");
  expect(row.department).toBe("tops");
  expect(row.category).toBe("Jacket");
  expect(row.ptp_inches).toBe(24.5);
  expect(row.length_inches).toBe(29);
  expect(row.sleeve_inches).toBe(25.5);
  expect(row.waist_inches).toBe(40);
  expect(row.inseam_inches).toBe(31);
  expect(row.rise_inches).toBe(11);
  expect(row.leg_opening_inches).toBe(20);
  expect(row.shoe_size_us).toBe(10.5);
  expect(row.insole_cm).toBe(27.5);
  expect(row.width_inches).toBe(12);
  expect(row.height_inches).toBe(8);
  expect(row.depth_inches).toBe(4);
  expect(row.strap_drop_inches).toBe(1.5);
  expect(row.size_note).toBe("Wide fit");
  expect(row.condition).toBe("9/10");
  expect(row.individual_cost).toBe(120);
  expect(row.target_sell_price).toBe(950);
  expect(row.status).toBe("sold");
  expect(row.sold_price).toBe(900);
  expect(row.sold_at).toBe(soldAt);
  expect(row.created_at).toBe(createdAt);
  expect(row.published_at).toBe(publishedAt);
  expect(row.shop_code).toBe("LT-7K2Q9");
  expect(row.photo_sync).toBe('{"k":["file:///a.jpg"],"u":["https://x/a.jpg"]}');

  const photoRow = sqlite.prepare("SELECT * FROM photos WHERE id = 'p1'").get() as Record<string, unknown>;
  expect(photoRow.item_id).toBe("i1");
  expect(photoRow.local_uri).toBe("file:///x/a.jpg");
  expect(photoRow.type).toBe("front");

  const queueRow = sqlite.prepare("SELECT * FROM publish_queue WHERE id = 'q1'").get() as Record<string, unknown>;
  expect(queueRow.item_id).toBe("i1");
  expect(queueRow.op).toBe("upsert");
  expect(queueRow.attempts).toBe(2);
  expect(queueRow.last_error).toBe("timeout");
  expect(queueRow.created_at).toBe(queuedAt);

  // The rebuilt table must still accept a NULL session_id — that's the entire
  // point of this migration.
  sqlite.prepare(
    "INSERT INTO items (id, session_id, brand, department, category, condition, individual_cost, target_sell_price, status, created_at) VALUES ('i2', NULL, 'Loose Brand', 'tops', 'Tee', '9/10', 0, 200, 'available', ?)"
  ).run(createdAt);
  const looseRow = sqlite.prepare("SELECT * FROM items WHERE id = 'i2'").get() as Record<string, unknown>;
  expect(looseRow.session_id).toBeNull();

  sqlite.close();
});
