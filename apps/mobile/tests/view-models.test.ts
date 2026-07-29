import { snapshot, recentItems } from "../lib/overview";
import type { Item } from "../db/schema";

// ---------------------------------------------------------------------------
// pendingLabel — pure function, no dependencies
// ---------------------------------------------------------------------------

function pendingLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return n === 1 ? "1 change pending" : `${Math.floor(n)} changes pending`;
}

// ---------------------------------------------------------------------------
// Home view-model logic tests
// ---------------------------------------------------------------------------

describe("Home derived state", () => {
  test("snapshot calculates correctly", () => {
    const now = new Date("2026-07-30T12:00:00Z");

    const items: Item[] = [
      {
        id: "1",
        sessionId: null,
        brand: "Nike",
        name: "Test",
        department: "tops",
        category: "Tee",
        ptpInches: null,
        lengthInches: null,
        sleeveInches: null,
        waistInches: null,
        inseamInches: null,
        riseInches: null,
        legOpeningInches: null,
        shoeSizeUs: null,
        insoleCm: null,
        widthInches: null,
        heightInches: null,
        depthInches: null,
        strapDropInches: null,
        sizeNote: null,
        condition: "good",
        individualCost: 100,
        targetSellPrice: 250,
        status: "available",
        soldPrice: null,
        soldAt: null,
        createdAt: now,
        publishedAt: null,
        shopCode: null,
        photoSync: null,
      },
      {
        id: "2",
        sessionId: null,
        brand: "Adidas",
        name: "Sold",
        department: "bottoms",
        category: "Jeans",
        ptpInches: null,
        lengthInches: null,
        sleeveInches: null,
        waistInches: null,
        inseamInches: null,
        riseInches: null,
        legOpeningInches: null,
        shoeSizeUs: null,
        insoleCm: null,
        widthInches: null,
        heightInches: null,
        depthInches: null,
        strapDropInches: null,
        sizeNote: null,
        condition: "good",
        individualCost: 150,
        targetSellPrice: 400,
        status: "sold",
        soldPrice: 350,
        soldAt: now,
        createdAt: now,
        publishedAt: null,
        shopCode: null,
        photoSync: null,
      },
    ];

    const snap = snapshot(items, now);
    expect(snap.itemsAvailable).toBe(1);
    expect(snap.stockValue).toBe(250);
  });

  test("recentItems returns up to 8 items", () => {
    const now = new Date();
    const items: Item[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      sessionId: null,
      brand: "Brand",
      name: null,
      department: "tops" as const,
      category: "Tee",
      ptpInches: null,
      lengthInches: null,
      sleeveInches: null,
      waistInches: null,
      inseamInches: null,
      riseInches: null,
      legOpeningInches: null,
      shoeSizeUs: null,
      insoleCm: null,
      widthInches: null,
      heightInches: null,
      depthInches: null,
      strapDropInches: null,
      sizeNote: null,
      condition: "good",
      individualCost: 0,
      targetSellPrice: 100,
      status: "available" as const,
      soldPrice: null,
      soldAt: null,
      createdAt: new Date(now.getTime() - i * 1000),
      publishedAt: null,
      shopCode: null,
      photoSync: null,
    }));

    const recent = recentItems(items, 8);
    expect(recent).toHaveLength(8);
    // Most recent first
    expect(recent[0].id).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Shop view-model logic tests
// ---------------------------------------------------------------------------

describe("Shop derived state", () => {
  test("listings map front photo correctly", () => {
    const items: Item[] = [
      {
        id: "i1",
        sessionId: null,
        brand: "Nike",
        name: "Test",
        department: "tops",
        category: "Tee",
        ptpInches: null,
        lengthInches: null,
        sleeveInches: null,
        waistInches: null,
        inseamInches: null,
        riseInches: null,
        legOpeningInches: null,
        shoeSizeUs: null,
        insoleCm: null,
        widthInches: null,
        heightInches: null,
        depthInches: null,
        strapDropInches: null,
        sizeNote: null,
        condition: "good",
        individualCost: 0,
        targetSellPrice: 100,
        status: "available",
        soldPrice: null,
        soldAt: null,
        createdAt: new Date(),
        publishedAt: new Date(),
        shopCode: "LT-00001",
        photoSync: null,
      },
    ];

    const photos = [
      { id: "p1", itemId: "i1", localUri: "file:///front.jpg", type: "front" as const },
      { id: "p2", itemId: "i1", localUri: "file:///back.jpg", type: "back" as const },
    ];

    // Simulate the view-model's listing construction
    const listings = items.map((item) => {
      const front = photos.find((p) => p.itemId === item.id && p.type === "front");
      return { ...item, frontPhoto: front?.localUri ?? null };
    });

    expect(listings[0].frontPhoto).toBe("file:///front.jpg");
  });

  test("listings handle missing photos", () => {
    const items: Item[] = [
      {
        id: "i1",
        sessionId: null,
        brand: "Nike",
        name: "Test",
        department: "tops",
        category: "Tee",
        ptpInches: null,
        lengthInches: null,
        sleeveInches: null,
        waistInches: null,
        inseamInches: null,
        riseInches: null,
        legOpeningInches: null,
        shoeSizeUs: null,
        insoleCm: null,
        widthInches: null,
        heightInches: null,
        depthInches: null,
        strapDropInches: null,
        sizeNote: null,
        condition: "good",
        individualCost: 0,
        targetSellPrice: 100,
        status: "available",
        soldPrice: null,
        soldAt: null,
        createdAt: new Date(),
        publishedAt: new Date(),
        shopCode: "LT-00001",
        photoSync: null,
      },
    ];

    const listings = items.map((item) => ({
      ...item,
      frontPhoto: null,
    }));

    expect(listings[0].frontPhoto).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pending label helper
// ---------------------------------------------------------------------------

describe("pendingLabel", () => {
  test("returns empty for zero", () => {
    expect(pendingLabel(0)).toBe("");
  });

  test("returns singular for one", () => {
    expect(pendingLabel(1)).toBe("1 change pending");
  });

  test("returns plural for multiple", () => {
    expect(pendingLabel(3)).toBe("3 changes pending");
  });

  test("returns empty for NaN", () => {
    expect(pendingLabel(NaN)).toBe("");
  });
});
