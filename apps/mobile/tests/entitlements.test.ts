import { makeTestDb } from "./helpers/testDb";
import { ensureEntitlements } from "../lib/entitlements";
import { entitlements } from "../db/schema";
import { eq } from "drizzle-orm";

test("ensureEntitlements is idempotent and creates a single row", () => {
  const { db } = makeTestDb();
  const e1 = ensureEntitlements(db);
  const e2 = ensureEntitlements(db);
  expect(e1.id).toBe(1);
  expect(e2.id).toBe(1);
  const rows = db.select().from(entitlements).all();
  expect(rows.length).toBe(1);
});

test("ensureEntitlements starts as free (pro=false) and no receipt", () => {
  const { db } = makeTestDb();
  const e = ensureEntitlements(db);
  expect(e.pro).toBe(false);
  expect(e.licenseReceipt).toBeNull();
});
