import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "../../db/schema";
import path from "node:path";

export type DB = BaseSQLiteDatabase<"sync", any, typeof schema>;

export function makeTestDb(): { db: DB } {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, "../../drizzle") });
  return { db: db as unknown as DB };
}
