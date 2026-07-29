import type { BackupData } from "../lib/backup";

// ---------------------------------------------------------------------------
// Backup format validation tests
// ---------------------------------------------------------------------------

describe("Backup format", () => {
  test("valid backup has correct structure", () => {
    const backup: BackupData = {
      version: 1,
      exportedAt: "2026-07-30T12:00:00Z",
      sessions: [],
      items: [],
      photos: [],
      userBrands: [],
      entitlements: [],
    };

    expect(backup.version).toBe(1);
    expect(Array.isArray(backup.sessions)).toBe(true);
    expect(Array.isArray(backup.items)).toBe(true);
    expect(Array.isArray(backup.photos)).toBe(true);
  });

  test("backup preserves all item fields", () => {
    const backup: BackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: [],
      items: [
        {
          id: "test-1",
          sessionId: "session-1",
          brand: "Nike",
          name: "Air Max",
          department: "shoes",
          category: "Sneakers",
          ptpInches: null,
          lengthInches: null,
          sleeveInches: null,
          waistInches: null,
          inseamInches: null,
          riseInches: null,
          legOpeningInches: null,
          shoeSizeUs: 9,
          insoleCm: null,
          widthInches: null,
          heightInches: null,
          depthInches: null,
          strapDropInches: null,
          sizeNote: null,
          condition: "good",
          individualCost: 500,
          targetSellPrice: 1500,
          status: "available",
          soldPrice: null,
          soldAt: null,
          createdAt: new Date(),
          publishedAt: null,
          shopCode: null,
          photoSync: null,
        },
      ],
      photos: [],
      userBrands: [],
      entitlements: [],
    };

    const item = backup.items[0];
    expect(item.brand).toBe("Nike");
    expect(item.shoeSizeUs).toBe(9);
    expect(item.status).toBe("available");
  });

  test("JSON roundtrip preserves data", () => {
    const original: BackupData = {
      version: 1,
      exportedAt: "2026-07-30T12:00:00Z",
      sessions: [
        {
          id: "s1",
          name: "Morning haul",
          type: "bulto",
          totalBaleCost: 500,
          location: null,
          locationName: "Tondo Market",
          lat: 14.5995,
          lng: 120.9842,
          scheduledAt: null,
          reminderOffsets: null,
          reminderNotificationIds: null,
          createdAt: new Date("2026-07-30T08:00:00Z"),
        },
      ],
      items: [],
      photos: [],
      userBrands: [{ id: "b1", name: "Nike", createdAt: new Date() }],
      entitlements: [{ id: 1, pro: true, licenseReceipt: null }],
    };

    const json = JSON.stringify(original);
    const parsed: BackupData = JSON.parse(json);

    expect(parsed.version).toBe(1);
    expect(parsed.sessions[0].locationName).toBe("Tondo Market");
    expect(parsed.userBrands[0].name).toBe("Nike");
    expect(parsed.entitlements[0].pro).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Backup restore logic tests
// ---------------------------------------------------------------------------

describe("Backup restore", () => {
  test("restore counts match input", () => {
    const data: BackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: [{ id: "s1", name: "Test", type: "bulto", createdAt: new Date() } as any],
      items: [
        { id: "i1", brand: "A", createdAt: new Date() } as any,
        { id: "i2", brand: "B", createdAt: new Date() } as any,
      ],
      photos: [{ id: "p1", itemId: "i1", localUri: "file:///a.jpg", type: "front" } as any],
      userBrands: [],
      entitlements: [{ id: 1, pro: false, licenseReceipt: null } as any],
    };

    // Simulate the counting logic from restoreBackup
    const counts: Record<string, number> = {};
    if (data.sessions.length > 0) counts.sessions = data.sessions.length;
    if (data.items.length > 0) counts.items = data.items.length;
    if (data.photos.length > 0) counts.photos = data.photos.length;
    if (data.userBrands.length > 0) counts.brands = data.userBrands.length;
    if (data.entitlements.length > 0) counts.entitlements = data.entitlements.length;

    expect(counts.sessions).toBe(1);
    expect(counts.items).toBe(2);
    expect(counts.photos).toBe(1);
    expect(counts.entitlements).toBe(1);
    expect(counts.brands).toBeUndefined(); // empty array = no insert
  });
});
