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
