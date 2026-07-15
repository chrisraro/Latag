import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["selector", "bulto"] }).notNull(),
  totalBaleCost: real("total_bale_cost").default(0),
  location: text("location"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => sessions.id).notNull(),
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
  logsUsed: integer("logs_used").default(0).notNull(),
  pro: integer("pro", { mode: "boolean" }).default(false).notNull(),
  licenseReceipt: text("license_receipt"),
});

export type Session = typeof sessions.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type UserBrand = typeof userBrands.$inferSelect;
export type Entitlements = typeof entitlements.$inferSelect;
