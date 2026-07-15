import { db } from "../db/client";
import { createSession, addItem, markSold } from "../lib/repo";
import { ensureEntitlements } from "../lib/entitlements";

export function seedDev() {
  if (!__DEV__) return;
  ensureEntitlements(db);
  const s1 = createSession(db, { name: "Baguio Weekend", type: "selector", location: "Baguio Night Market" });
  const a = addItem(db, { sessionId: s1.id, brand: "Stüssy", department: "tops" as const, category: "Tee", ptpInches: 21, lengthInches: 27, condition: "9/10", individualCost: 100, targetSellPrice: 550 }).item;
  addItem(db, { sessionId: s1.id, brand: "Carhartt", department: "tops" as const, category: "Hoodie", ptpInches: 24, lengthInches: 28, condition: "9/10", individualCost: 120, targetSellPrice: 750 });
  markSold(db, a.id, 500);
  const s2 = createSession(db, { name: "Naga Run #4", type: "bulto", location: "Naga City Downtown", totalBaleCost: 10000 });
  addItem(db, { sessionId: s2.id, brand: "Nike", department: "tops" as const, category: "Tee", ptpInches: 21.5, lengthInches: 27, condition: "9/10", targetSellPrice: 350 });
}
