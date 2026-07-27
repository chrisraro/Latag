import { eq } from "drizzle-orm";
import { makeTestDb } from "./helpers/testDb";
import { addItem, addPhoto, createSession, enqueuePublish, listPublishQueue, markPublished } from "../lib/repo";
import { deleteShopItem, uploadItemPhotos, upsertShopItem } from "../lib/shop-api";
import {
  MAX_ATTEMPTS,
  drainQueue,
  forgetUploadedPhotos,
  kickSync,
  pendingLabel,
  photoSetKey,
  readPhotoSync,
  syncPublishQueue,
  toShopItemUpsert,
  type DrainDeps,
} from "../lib/shop-sync";
import { items, photos, type PublishQueueRow } from "../db/schema";

jest.mock("../lib/shop-api", () => ({
  uploadItemPhotos: jest.fn(),
  upsertShopItem: jest.fn(),
  deleteShopItem: jest.fn(),
}));

const mockedUpload = uploadItemPhotos as jest.MockedFunction<typeof uploadItemPhotos>;
const mockedUpsert = upsertShopItem as jest.MockedFunction<typeof upsertShopItem>;
const mockedDelete = deleteShopItem as jest.MockedFunction<typeof deleteShopItem>;

const ok = <T,>(data: T) => ({ ok: true as const, data });
const bad = (reason: "auth" | "taken" | "network" | "error", message = "nope") =>
  ({ ok: false as const, reason, message });

function row(id: string, op: "upsert" | "delete" = "upsert", attempts = 0): PublishQueueRow {
  return { id, itemId: `item-${id}`, op, attempts, lastError: null, createdAt: new Date(1000) };
}

function deps(rows: PublishQueueRow[], over: Partial<DrainDeps> = {}): DrainDeps & {
  done: jest.Mock; fail: jest.Mock; upsert: jest.Mock; remove: jest.Mock;
} {
  const d = {
    list: () => rows,
    upsert: jest.fn(async () => ok(null)),
    remove: jest.fn(async () => ok(null)),
    done: jest.fn(),
    fail: jest.fn(),
    ...over,
  };
  return d as any;
}

const baseItem = {
  brand: "Carhartt", name: "Detroit Jacket", department: "tops" as const, category: "Jacket",
  ptpInches: 21.5, lengthInches: 27, condition: "9/10", targetSellPrice: 850, individualCost: 120,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedUpload.mockResolvedValue(ok([]));
  mockedUpsert.mockResolvedValue(ok(null));
  mockedDelete.mockResolvedValue(ok(null));
});

// --------------------------------------------------------------- drainQueue

test("an empty queue drains to zeroes and touches nothing", async () => {
  const d = deps([]);
  expect(await drainQueue(d)).toEqual({ processed: 0, succeeded: 0, failed: 0, gaveUp: 0 });
  expect(d.upsert).not.toHaveBeenCalled();
  expect(d.remove).not.toHaveBeenCalled();
});

test("mixed ops route to upsert/remove oldest-first and all succeed", async () => {
  const rows = [row("a", "upsert"), row("b", "delete"), row("c", "upsert")];
  const d = deps(rows);
  expect(await drainQueue(d)).toEqual({ processed: 3, succeeded: 3, failed: 0, gaveUp: 0 });
  expect(d.upsert.mock.calls.map((c: any[]) => c[0].id)).toEqual(["a", "c"]);
  expect(d.remove.mock.calls.map((c: any[]) => c[0].id)).toEqual(["b"]);
  expect(d.done.mock.calls.map((c: any[]) => c[0])).toEqual(["a", "b", "c"]);
  expect(d.fail).not.toHaveBeenCalled();
});

test("one failure is recorded and the rest of the queue still drains", async () => {
  const d = deps([row("a"), row("b"), row("c")], {
    upsert: jest.fn(async (r: PublishQueueRow) => (r.id === "b" ? bad("network", "offline") : ok(null))),
  });
  expect(await drainQueue(d)).toEqual({ processed: 3, succeeded: 2, failed: 1, gaveUp: 0 });
  expect(d.fail).toHaveBeenCalledWith("b", "offline");
  expect(d.done.mock.calls.map((c: any[]) => c[0])).toEqual(["a", "c"]);
});

test("a thrown dep is caught and counted as a failure, never propagated", async () => {
  const d = deps([row("a"), row("b")], {
    upsert: jest.fn(async (r: PublishQueueRow) => {
      if (r.id === "a") throw new Error("boom");
      return ok(null);
    }),
  });
  expect(await drainQueue(d)).toEqual({ processed: 2, succeeded: 1, failed: 1, gaveUp: 0 });
  expect(d.fail).toHaveBeenCalledWith("a", "boom");
});

test("an auth failure halts the drain immediately without burning an attempt", async () => {
  const d = deps([row("a"), row("b"), row("c")], {
    upsert: jest.fn(async (r: PublishQueueRow) => (r.id === "a" ? bad("auth", "Not signed in") : ok(null))),
  });
  expect(await drainQueue(d)).toEqual({ processed: 0, succeeded: 0, failed: 0, gaveUp: 0 });
  expect(d.upsert).toHaveBeenCalledTimes(1);
  expect(d.fail).not.toHaveBeenCalled();
  expect(d.done).not.toHaveBeenCalled();
});

test("a row at MAX_ATTEMPTS is left alone, counted as gaveUp, and does not block the others", async () => {
  const d = deps([row("a", "upsert", MAX_ATTEMPTS), row("b")]);
  expect(await drainQueue(d)).toEqual({ processed: 1, succeeded: 1, failed: 0, gaveUp: 1 });
  expect(d.upsert.mock.calls.map((c: any[]) => c[0].id)).toEqual(["b"]);
  expect(d.done).not.toHaveBeenCalledWith("a");
  expect(d.fail).not.toHaveBeenCalled();
});

// -------------------------------------------------------------- pendingLabel

test("pendingLabel stays silent at zero and pluralises honestly", () => {
  expect(pendingLabel(0)).toBe("");
  expect(pendingLabel(1)).toBe("1 change pending");
  expect(pendingLabel(4)).toBe("4 changes pending");
});

// ---------------------------------------------------- payload privacy boundary

test("toShopItemUpsert carries buyer fields only — no cost, profit, location, or batch", () => {
  const { db } = makeTestDb();
  const s = createSession(db, { name: "Divisoria run", type: "bulto", totalBaleCost: 12000, locationName: "Divisoria" });
  const { item } = addItem(db, { sessionId: s.id, ...baseItem });
  const published = markPublished(db, item.id, "LT-7K2Q9");

  const payload = toShopItemUpsert(published, ["https://cdn.test/0.jpg"]);
  expect(payload.itemLocalId).toBe(item.id);
  expect(payload.code).toBe("LT-7K2Q9");
  expect(payload.brand).toBe("Carhartt");
  expect(payload.price).toBe(850);
  expect(payload.status).toBe("available");
  expect(payload.photoUrls).toEqual(["https://cdn.test/0.jpg"]);
  expect(payload.specs).toEqual([{ k: "Pit-to-pit", v: '21.5"' }, { k: "Length", v: '27"' }]);

  const keys = Object.keys(payload);
  for (const banned of ["individualCost", "cost", "profit", "location", "locationName", "sessionId", "lat", "lng", "soldPrice"]) {
    expect(keys).not.toContain(banned);
  }
  expect(JSON.stringify(payload)).not.toContain("120");
});

// -------------------------------------------------------- M1: ordered specs

test("toShopItemUpsert emits specs as an ORDERED ARRAY, not a jsonb object — Postgres would otherwise scramble jsonb keys by length-then-bytes and render bottoms as 'Rise · Waist' instead of 'Waist · Inseam'", () => {
  const { db } = makeTestDb();
  const s = createSession(db, { name: "Divisoria run", type: "selector" });
  const { item } = addItem(db, {
    sessionId: s.id, brand: "Levi's", department: "bottoms", category: "Jeans",
    waistInches: 32, inseamInches: 30, riseInches: 11, condition: "9/10", targetSellPrice: 900,
  });
  const published = markPublished(db, item.id, "LT-9F3K2");

  const payload = toShopItemUpsert(published, []);

  expect(Array.isArray(payload.specs)).toBe(true);
  expect(payload.specs).toEqual([
    { k: "Waist", v: '32"' },
    { k: "Inseam", v: '30"' },
    { k: "Rise", v: '11"' },
  ]);
});

// ------------------------------------------------------------ syncPublishQueue

test("syncPublishQueue uploads photos in slot order then upserts, and clears the row", async () => {
  const { db } = makeTestDb();
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, { sessionId: s.id, ...baseItem });
  addPhoto(db, { itemId: item.id, localUri: "file:///m/tag.jpg", type: "tag" });
  addPhoto(db, { itemId: item.id, localUri: "file:///m/front.jpg", type: "front" });
  markPublished(db, item.id, "LT-7K2Q9");
  enqueuePublish(db, item.id, "upsert");
  mockedUpload.mockResolvedValue(ok(["https://cdn.test/0.jpg", "https://cdn.test/1.jpg"]));

  const summary = await syncPublishQueue(db);

  expect(summary.succeeded).toBe(1);
  expect(mockedUpload).toHaveBeenCalledWith(item.id, ["file:///m/front.jpg", "file:///m/tag.jpg"]);
  expect(mockedUpsert.mock.calls[0][0].photoUrls).toEqual(["https://cdn.test/0.jpg", "https://cdn.test/1.jpg"]);
  expect(listPublishQueue(db)).toHaveLength(0);
});

test("syncPublishQueue routes a delete op to deleteShopItem by local id", async () => {
  const { db } = makeTestDb();
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, { sessionId: s.id, ...baseItem });
  enqueuePublish(db, item.id, "delete");

  await syncPublishQueue(db);

  expect(mockedDelete).toHaveBeenCalledWith(item.id);
  expect(mockedUpsert).not.toHaveBeenCalled();
  expect(listPublishQueue(db)).toHaveLength(0);
});

test("a failed sync keeps the row queued with its error recorded", async () => {
  const { db } = makeTestDb();
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, { sessionId: s.id, ...baseItem });
  markPublished(db, item.id, "LT-7K2Q9");
  enqueuePublish(db, item.id, "upsert");
  mockedUpsert.mockResolvedValue(bad("network", "offline"));

  expect((await syncPublishQueue(db)).failed).toBe(1);
  const [pending] = listPublishQueue(db);
  expect(pending.attempts).toBe(1);
  expect(pending.lastError).toBe("offline");
});

test("an upsert row whose item vanished or was unpublished drops out instead of poisoning the queue", async () => {
  const { db } = makeTestDb();
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, { sessionId: s.id, ...baseItem });
  enqueuePublish(db, item.id, "upsert"); // never markPublished — no code, not live

  expect((await syncPublishQueue(db)).succeeded).toBe(1);
  expect(mockedUpsert).not.toHaveBeenCalled();
  expect(listPublishQueue(db)).toHaveLength(0);
});

test("syncPublishQueue swallows everything and reports zeroes when the queue cannot be read", async () => {
  const broken = { select: () => { throw new Error("db gone"); } };
  await expect(syncPublishQueue(broken as any)).resolves.toEqual({
    processed: 0, succeeded: 0, failed: 0, gaveUp: 0,
  });
});

// ------------------------------------------- redundant photo uploads (F2 perf)

describe("photoSetKey", () => {
  test("identifies a photo set by its ordered local URIs", () => {
    expect(photoSetKey(["file:///a.jpg", "file:///b.jpg"])).toBe(photoSetKey(["file:///a.jpg", "file:///b.jpg"]));
  });

  test("order, content and count all change the key", () => {
    const base = photoSetKey(["file:///a.jpg", "file:///b.jpg"]);
    expect(photoSetKey(["file:///b.jpg", "file:///a.jpg"])).not.toBe(base);
    expect(photoSetKey(["file:///a.jpg", "file:///c.jpg"])).not.toBe(base);
    expect(photoSetKey(["file:///a.jpg"])).not.toBe(base);
    expect(photoSetKey([])).not.toBe(base);
  });

  test("a URI carrying the separator itself cannot masquerade as two photos", () => {
    expect(photoSetKey(["file:///a.jpg\u0000file:///b.jpg"])).not.toBe(photoSetKey(["file:///a.jpg", "file:///b.jpg"]));
  });
});

describe("readPhotoSync", () => {
  test("null, junk and wrong-shaped markers all read as 'nothing uploaded yet'", () => {
    expect(readPhotoSync(null)).toBeNull();
    expect(readPhotoSync("")).toBeNull();
    expect(readPhotoSync("{not json")).toBeNull();
    expect(readPhotoSync('{"k":"x"}')).toBeNull();
    expect(readPhotoSync('{"u":["https://cdn.test/0.jpg"]}')).toBeNull();
    expect(readPhotoSync('{"k":"x","u":"nope"}')).toBeNull();
  });
});

describe("photo re-upload guard", () => {
  /** A published item with two photos, already synced once. */
  async function publishedAndSynced() {
    const { db } = makeTestDb();
    const s = createSession(db, { name: "Run", type: "selector" });
    const { item } = addItem(db, { sessionId: s.id, ...baseItem });
    addPhoto(db, { itemId: item.id, localUri: "file:///m/front.jpg", type: "front" });
    addPhoto(db, { itemId: item.id, localUri: "file:///m/tag.jpg", type: "tag" });
    markPublished(db, item.id, "LT-7K2Q9");
    enqueuePublish(db, item.id, "upsert");
    mockedUpload.mockResolvedValue(ok(["https://cdn.test/0.jpg", "https://cdn.test/1.jpg"]));

    await syncPublishQueue(db);
    expect(mockedUpload).toHaveBeenCalledTimes(1);
    mockedUpload.mockClear();
    mockedUpsert.mockClear();
    return { db, itemId: item.id };
  }

  const itemRow = (db: any, id: string) => db.select().from(items).where(eq(items.id, id)).all()[0];
  const lastPayload = () => mockedUpsert.mock.calls[mockedUpsert.mock.calls.length - 1][0];

  test("the first publish records exactly what it uploaded", async () => {
    const { db, itemId } = await publishedAndSynced();
    expect(readPhotoSync(itemRow(db, itemId).photoSync)).toEqual({
      key: photoSetKey(["file:///m/front.jpg", "file:///m/tag.jpg"]),
      urls: ["https://cdn.test/0.jpg", "https://cdn.test/1.jpg"],
    });
  });

  test("a price-only edit re-upserts the row and uploads nothing", async () => {
    const { db, itemId } = await publishedAndSynced();

    db.update(items).set({ targetSellPrice: 900 }).where(eq(items.id, itemId)).run();
    enqueuePublish(db, itemId, "upsert");

    expect((await syncPublishQueue(db)).succeeded).toBe(1);
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(lastPayload().price).toBe(900);
    expect(lastPayload().photoUrls).toEqual(["https://cdn.test/0.jpg", "https://cdn.test/1.jpg"]);
  });

  test("marking an item sold uploads nothing either — only the status moved", async () => {
    const { db, itemId } = await publishedAndSynced();

    db.update(items).set({ status: "sold", soldPrice: 800, soldAt: new Date() }).where(eq(items.id, itemId)).run();
    enqueuePublish(db, itemId, "upsert");

    await syncPublishQueue(db);
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(lastPayload().status).toBe("sold");
  });

  test("swapping a photo re-uploads the whole set and re-records it", async () => {
    const { db, itemId } = await publishedAndSynced();

    db.update(photos).set({ localUri: "file:///m/front-2.jpg" })
      .where(eq(photos.localUri, "file:///m/front.jpg")).run();
    enqueuePublish(db, itemId, "upsert");
    mockedUpload.mockResolvedValue(ok(["https://cdn.test/0.jpg", "https://cdn.test/1.jpg"]));

    await syncPublishQueue(db);

    expect(mockedUpload).toHaveBeenCalledWith(itemId, ["file:///m/front-2.jpg", "file:///m/tag.jpg"]);
    expect(readPhotoSync(itemRow(db, itemId).photoSync)?.key)
      .toBe(photoSetKey(["file:///m/front-2.jpg", "file:///m/tag.jpg"]));
  });

  test("adding a photo re-uploads", async () => {
    const { db, itemId } = await publishedAndSynced();
    addPhoto(db, { itemId, localUri: "file:///m/flaw.jpg", type: "flaw" });
    enqueuePublish(db, itemId, "upsert");

    await syncPublishQueue(db);

    expect(mockedUpload).toHaveBeenCalledWith(itemId, [
      "file:///m/front.jpg", "file:///m/tag.jpg", "file:///m/flaw.jpg",
    ]);
  });

  test("a failed upload records nothing, so the retry still uploads", async () => {
    const { db } = makeTestDb();
    const s = createSession(db, { name: "Run", type: "selector" });
    const { item } = addItem(db, { sessionId: s.id, ...baseItem });
    addPhoto(db, { itemId: item.id, localUri: "file:///m/front.jpg", type: "front" });
    markPublished(db, item.id, "LT-7K2Q9");
    enqueuePublish(db, item.id, "upsert");
    mockedUpload.mockResolvedValue(bad("network", "offline"));

    expect((await syncPublishQueue(db)).failed).toBe(1);
    expect(itemRow(db, item.id).photoSync).toBeNull();

    mockedUpload.mockResolvedValue(ok(["https://cdn.test/0.jpg"]));
    await syncPublishQueue(db);
    expect(mockedUpload).toHaveBeenCalledTimes(2);
  });

  test("a failed upsert keeps the marker, so the retry skips the re-upload", async () => {
    const { db, itemId } = await publishedAndSynced();

    db.update(items).set({ targetSellPrice: 900 }).where(eq(items.id, itemId)).run();
    enqueuePublish(db, itemId, "upsert");
    mockedUpsert.mockResolvedValue(bad("network", "offline"));
    await syncPublishQueue(db);

    mockedUpsert.mockResolvedValue(ok(null));
    await syncPublishQueue(db);

    expect(mockedUpload).not.toHaveBeenCalled();
    expect(listPublishQueue(db)).toHaveLength(0);
  });

  test("removing the listing forgets the uploaded set — deleteShopItem wipes the folder, so a re-publish must upload again", async () => {
    const { db, itemId } = await publishedAndSynced();

    enqueuePublish(db, itemId, "delete");
    await syncPublishQueue(db);
    expect(itemRow(db, itemId).photoSync).toBeNull();

    enqueuePublish(db, itemId, "upsert");
    await syncPublishQueue(db);
    expect(mockedUpload).toHaveBeenCalledTimes(1);
  });

  test("forgetUploadedPhotos clears every marker — signing out changes whose storage folder these URLs live in", async () => {
    const { db, itemId } = await publishedAndSynced();
    expect(itemRow(db, itemId).photoSync).not.toBeNull();

    forgetUploadedPhotos(db);

    expect(itemRow(db, itemId).photoSync).toBeNull();
    enqueuePublish(db, itemId, "upsert");
    await syncPublishQueue(db);
    expect(mockedUpload).toHaveBeenCalledTimes(1);
  });

  test("forgetUploadedPhotos never throws on a broken db", () => {
    expect(() => forgetUploadedPhotos({ update: () => { throw new Error("db gone"); } } as any)).not.toThrow();
  });
});

// ------------------------------------------------------------------ kickSync

/** Lets any pending microtasks (and the odd real macrotask) settle before asserting. */
const flush = () => new Promise((r) => setTimeout(r, 0));

test("kickSync never throws and returns immediately even against a broken db", async () => {
  const broken = { select: () => { throw new Error("db gone"); } };
  expect(() => kickSync(broken as any)).not.toThrow();
  await flush(); // let the swallowed failure clear the module-level inFlight guard
});

test("kickSync overlap guard collapses rapid calls into a single in-flight drain (C1)", async () => {
  const { db } = makeTestDb();
  const s = createSession(db, { name: "Run", type: "selector" });
  const { item } = addItem(db, { sessionId: s.id, ...baseItem });
  markPublished(db, item.id, "LT-7K2Q9");
  enqueuePublish(db, item.id, "upsert");

  let release: (() => void) | undefined;
  mockedUpsert.mockImplementation(() => new Promise((resolve) => { release = () => resolve(ok(null)); }));

  kickSync(db);
  kickSync(db); // fired while the first drain is still in flight — must be a no-op
  await flush();
  expect(mockedUpsert).toHaveBeenCalledTimes(1);

  release?.();
  await flush();
  expect(listPublishQueue(db)).toHaveLength(0); // the one real drain ran to completion

  // Now that inFlight has cleared, a fresh kickSync must be able to fire again.
  enqueuePublish(db, item.id, "upsert");
  kickSync(db);
  await flush();
  expect(mockedUpsert).toHaveBeenCalledTimes(2);
});
