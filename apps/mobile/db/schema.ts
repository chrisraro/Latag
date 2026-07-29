import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["selector", "bulto"] }).notNull(),
  totalBaleCost: real("total_bale_cost").default(0),
  location: text("location"), // legacy free-text; new code reads/writes locationName
  locationName: text("location_name"),
  lat: real("lat"),
  lng: real("lng"),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  reminderOffsets: text("reminder_offsets"),               // JSON array of minutes, e.g. "[0,60,1440]"
  reminderNotificationIds: text("reminder_notification_ids"), // JSON array of strings
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => sessions.id),
  brand: text("brand").notNull(),
  name: text("name"),
  department: text("department").notNull().default("tops"),
  category: text("category").notNull(),
  ptpInches: real("ptp_inches"),
  lengthInches: real("length_inches"),
  sleeveInches: real("sleeve_inches"),
  waistInches: real("waist_inches"),
  inseamInches: real("inseam_inches"),
  riseInches: real("rise_inches"),
  legOpeningInches: real("leg_opening_inches"),
  shoeSizeUs: real("shoe_size_us"),
  insoleCm: real("insole_cm"),
  widthInches: real("width_inches"),
  heightInches: real("height_inches"),
  depthInches: real("depth_inches"),
  strapDropInches: real("strap_drop_inches"),
  sizeNote: text("size_note"),
  condition: text("condition").notNull(),
  individualCost: real("individual_cost").default(0).notNull(),
  targetSellPrice: real("target_sell_price").notNull(),
  status: text("status", { enum: ["available", "sold"] }).default("available").notNull(),
  soldPrice: real("sold_price"),
  soldAt: integer("sold_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // Storefront (F2). null publishedAt = not published. shopCode is the LT-XXXXX
  // buyers quote; it is minted once and never changes for the life of the item.
  publishedAt: integer("published_at", { mode: "timestamp" }),
  shopCode: text("shop_code"),
  // Which photo set was last successfully uploaded to storage, as JSON
  // {"k":<ordered local URIs>,"u":[public urls]} — see lib/shop-sync. Null means
  // "nothing up there", so the next publish uploads. Never read as truth about
  // the item itself; it exists only to keep a price edit off mobile data.
  photoSync: text("photo_sync"),
});

/**
 * Outbox for storefront sync: one pending row per item, drained by lib/shop-sync.
 * Publishing never blocks the logging loop — the UI writes here and moves on.
 */
export const publishQueue = sqliteTable("publish_queue", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  op: text("op", { enum: ["upsert", "delete"] }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  itemId: text("item_id").references(() => items.id).notNull(),
  localUri: text("local_uri").notNull(),
  type: text("type", { enum: ["front", "back", "tag", "flaw"] }).notNull(),
});

export const userBrands = sqliteTable("user_brands", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const entitlements = sqliteTable("entitlements", {
  id: integer("id").primaryKey(),               // always 1 — single row
  pro: integer("pro", { mode: "boolean" }).default(false).notNull(),
  licenseReceipt: text("license_receipt"),
});

export type Session = typeof sessions.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type UserBrand = typeof userBrands.$inferSelect;
export type Entitlements = typeof entitlements.$inferSelect;
export type PublishQueueRow = typeof publishQueue.$inferSelect;
