import { eq, sql } from "drizzle-orm";
import { entitlements, type Entitlements } from "../db/schema";

export const FREE_LOG_LIMIT = 20;

export class FreeTierExhaustedError extends Error {
  constructor() { super("Free tier exhausted: 20 lifetime logs used"); this.name = "FreeTierExhaustedError"; }
}

// db is any sync drizzle sqlite database that includes the entitlements table.
type AnyDb = any;

export function ensureEntitlements(db: AnyDb): Entitlements {
  db.insert(entitlements).values({ id: 1 }).onConflictDoNothing().run();
  return db.select().from(entitlements).where(eq(entitlements.id, 1)).all()[0];
}

export function logsRemaining(e: Entitlements): number {
  return e.pro ? Infinity : Math.max(0, FREE_LOG_LIMIT - e.logsUsed);
}

export function consumeLog(db: AnyDb): number {
  const e = ensureEntitlements(db);
  if (e.pro) return Infinity;
  if (e.logsUsed >= FREE_LOG_LIMIT) throw new FreeTierExhaustedError();
  db.update(entitlements).set({ logsUsed: sql`${entitlements.logsUsed} + 1` }).where(eq(entitlements.id, 1)).run();
  return FREE_LOG_LIMIT - (e.logsUsed + 1);
}
