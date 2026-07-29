import { eq } from "drizzle-orm";
import { entitlements, type Entitlements } from "../db/schema";
import type { LatagDb } from "../db/client";

/**
 * Ensures the single-row entitlements table exists.
 * Idempotent — safe to call multiple times.
 */
export function ensureEntitlements(db: LatagDb): Entitlements {
  db.insert(entitlements).values({ id: 1 }).onConflictDoNothing().run();
  return db.select().from(entitlements).where(eq(entitlements.id, 1)).all()[0];
}
