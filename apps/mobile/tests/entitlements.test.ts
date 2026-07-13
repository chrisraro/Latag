import { makeTestDb } from "./helpers/testDb";
import { FREE_LOG_LIMIT, ensureEntitlements, logsRemaining, consumeLog, FreeTierExhaustedError } from "../lib/entitlements";
import { entitlements } from "../db/schema";
import { eq } from "drizzle-orm";

test("ensureEntitlements is idempotent and starts at 0 used", () => {
  const { db } = makeTestDb();
  const e1 = ensureEntitlements(db);
  const e2 = ensureEntitlements(db);
  expect(e1.logsUsed).toBe(0);
  expect(e2.id).toBe(1);
});
test("consumeLog counts down to the wall and throws at 0", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  for (let i = 1; i <= FREE_LOG_LIMIT; i++) expect(consumeLog(db)).toBe(FREE_LOG_LIMIT - i);
  expect(() => consumeLog(db)).toThrow(FreeTierExhaustedError);
});
test("pro accounts never exhaust", () => {
  const { db } = makeTestDb();
  ensureEntitlements(db);
  db.update(entitlements).set({ pro: true, logsUsed: 999 }).where(eq(entitlements.id, 1)).run();
  expect(consumeLog(db)).toBe(Infinity);
  expect(logsRemaining(db.select().from(entitlements).all()[0])).toBe(Infinity);
});
