import { makeTestDb } from "./helpers/testDb";
import { addItem, addPhoto, createSession, enqueuePublish, listPublishQueue, markPublished } from "../lib/repo";
import { deleteShopItem, uploadItemPhotos, upsertShopItem } from "../lib/shop-api";
import {
  MAX_ATTEMPTS,
  drainQueue,
  pendingLabel,
  syncPublishQueue,
  toShopItemUpsert,
  type DrainDeps,
} from "../lib/shop-sync";
import type { PublishQueueRow } from "../db/schema";

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
  expect(payload.specs).toEqual({ "Pit-to-pit": '21.5"', Length: '27"' });

  const keys = Object.keys(payload);
  for (const banned of ["individualCost", "cost", "profit", "location", "locationName", "sessionId", "lat", "lng", "soldPrice"]) {
    expect(keys).not.toContain(banned);
  }
  expect(JSON.stringify(payload)).not.toContain("120");
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
