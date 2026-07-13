import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";

export const sqlite = openDatabaseSync("latag.db", { enableChangeListener: true });
export const db = drizzle(sqlite, { schema });
