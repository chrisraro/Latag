import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../lib/supabase";
import {
  MAX_ITEM_PHOTOS,
  SHOP_PHOTOS_BUCKET,
  SHOP_URL_PREFIX,
  cacheShop,
  cachedShop,
  checkHandleAvailable,
  decodeBase64,
  deleteShopItem,
  getMyShop,
  isValidHandle,
  normalizeContactHandle,
  normalizeHandle,
  saveMyShop,
  shopItemUrl,
  shopUrl,
  shopUrlLabel,
  upsertShopItem,
  uploadItemPhotos,
  type ShopItemUpsert,
  type ShopProfile,
} from "../lib/shop-api";

jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    from: jest.fn(),
    storage: { from: jest.fn() },
  },
}));

jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn(),
}));

const mockedFs = FileSystem as jest.Mocked<typeof FileSystem>;
const mockedSupabase = supabase as unknown as {
  auth: { getSession: jest.Mock };
  from: jest.Mock;
  storage: { from: jest.Mock };
};

type QueryResult = { data?: unknown; error?: unknown };

/**
 * Mirrors postgrest-js: every builder method returns the builder, the builder
 * itself is thenable, and single/maybeSingle resolve to the same result.
 */
function chain(result: QueryResult) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    upsert: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    single: jest.fn(async () => result),
    maybeSingle: jest.fn(async () => result),
    then: (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function bucket(overrides: Record<string, unknown> = {}) {
  return {
    upload: jest.fn(async () => ({ data: { path: "p" }, error: null })),
    getPublicUrl: jest.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } })),
    list: jest.fn(async () => ({ data: [], error: null })),
    remove: jest.fn(async () => ({ data: [], error: null })),
    ...overrides,
  };
}

function signedIn(userId = "user-1") {
  mockedSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: userId } } },
    error: null,
  });
}

function signedOut() {
  mockedSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
}

const PROFILE: ShopProfile = {
  handle: "tita-ukay",
  displayName: "Tita Ukay",
  bio: "Curated Manila thrift",
  contactMessenger: "titaukay",
  contactInstagram: "tita.ukay",
  contactEmail: "tita@example.com",
  showSold: true,
};

const PROFILE_ROW = {
  handle: "tita-ukay",
  display_name: "Tita Ukay",
  bio: "Curated Manila thrift",
  contact_messenger: "titaukay",
  contact_instagram: "tita.ukay",
  contact_email: "tita@example.com",
  show_sold: true,
};

const ITEM: ShopItemUpsert = {
  itemLocalId: "item-uuid-1",
  code: "LT-7K2Q9",
  brand: "Carhartt",
  name: "Detroit Jacket",
  department: "menswear",
  category: "jacket",
  condition: "9/10",
  specs: [{ k: "Chest", v: '22"' }, { k: "Length", v: '27"' }],
  price: 850,
  status: "available",
  photoUrls: ["https://cdn.test/a.jpg"],
  sortOrder: 3,
};

beforeEach(() => {
  jest.clearAllMocks();
  signedIn();
  mockedSupabase.from.mockReturnValue(chain({ data: null, error: null }));
  mockedSupabase.storage.from.mockReturnValue(bucket());
  (mockedFs.readAsStringAsync as jest.Mock).mockResolvedValue("AAAA");
});

describe("normalizeHandle", () => {
  const cases: Array<[string, string]> = [
    ["Tita Ukay", "tita-ukay"],
    ["  Tita Ukay  ", "tita-ukay"],
    ["TITA", "tita"],
    ["Tita's Ukay!", "titas-ukay"],
    ["tita ukay", "tita-ukay"],
    ["ukay\tstore", "ukay-store"],
    ["ukay—store", "ukaystore"],
    ["already-fine-1", "already-fine-1"],
    ["", ""],
    ["   ", ""],
    ["!!!", ""],
    ["ThisHandleIsWayTooLongToFitInTwenty", "thishandleiswaytoolo"],
  ];
  test.each(cases)("%p -> %p", (raw, expected) => {
    expect(normalizeHandle(raw)).toBe(expected);
  });

  test("clamps to 20 characters", () => {
    expect(normalizeHandle("a".repeat(50))).toHaveLength(20);
  });

  test("output of normalize is always valid or empty/too-short", () => {
    expect(/^[a-z0-9-]*$/.test(normalizeHandle("Tita ✨ Ukay ✨ Store"))).toBe(true);
  });
});

describe("isValidHandle", () => {
  test.each([
    ["tit", true],
    ["tita-ukay", true],
    ["a".repeat(20), true],
    ["12345", true],
    ["ab", false],
    ["a".repeat(21), false],
    ["Tita", false],
    ["tita ukay", false],
    ["tita_ukay", false],
    ["", false],
    ["tita.ukay", false],
  ])("%p -> %p", (h, expected) => {
    expect(isValidHandle(h as string)).toBe(expected);
  });
});

describe("checkHandleAvailable", () => {
  test("no matching row -> available", async () => {
    mockedSupabase.from.mockReturnValue(chain({ data: null, error: null }));
    await expect(checkHandleAvailable("tita-ukay")).resolves.toEqual({ ok: true, data: true });
    expect(mockedSupabase.from).toHaveBeenCalledWith("shops");
  });

  test("handle owned by someone else -> not available", async () => {
    mockedSupabase.from.mockReturnValue(chain({ data: { id: "s1", user_id: "someone-else" }, error: null }));
    await expect(checkHandleAvailable("tita-ukay")).resolves.toEqual({ ok: true, data: false });
  });

  test("handle already owned by me -> still available (editing my own shop)", async () => {
    mockedSupabase.from.mockReturnValue(chain({ data: { id: "s1", user_id: "user-1" }, error: null }));
    await expect(checkHandleAvailable("tita-ukay")).resolves.toEqual({ ok: true, data: true });
  });

  test("invalid handle -> not available, no network call", async () => {
    await expect(checkHandleAvailable("ab")).resolves.toEqual({ ok: true, data: false });
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  test("network error -> reason network", async () => {
    mockedSupabase.from.mockReturnValue(chain({ data: null, error: { message: "Network request failed" } }));
    const res = await checkHandleAvailable("tita-ukay");
    expect(res).toMatchObject({ ok: false, reason: "network" });
  });

  test("builder rejects -> ok:false, never throws", async () => {
    mockedSupabase.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await checkHandleAvailable("tita-ukay");
    expect(res.ok).toBe(false);
  });
});

describe("getMyShop", () => {
  test("signed out -> reason auth", async () => {
    signedOut();
    const res = await getMyShop();
    expect(res).toMatchObject({ ok: false, reason: "auth" });
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  test("no shop row -> ok with null", async () => {
    mockedSupabase.from.mockReturnValue(chain({ data: null, error: null }));
    await expect(getMyShop()).resolves.toEqual({ ok: true, data: null });
  });

  test("maps snake_case row to ShopProfile", async () => {
    mockedSupabase.from.mockReturnValue(chain({ data: PROFILE_ROW, error: null }));
    await expect(getMyShop()).resolves.toEqual({ ok: true, data: PROFILE });
  });

  test("nullable columns survive the mapping", async () => {
    mockedSupabase.from.mockReturnValue(
      chain({
        data: {
          handle: "solo",
          display_name: "Solo",
          bio: null,
          contact_messenger: null,
          contact_instagram: null,
          contact_email: null,
          show_sold: false,
        },
        error: null,
      }),
    );
    const res = await getMyShop();
    expect(res).toEqual({
      ok: true,
      data: {
        handle: "solo",
        displayName: "Solo",
        bio: null,
        contactMessenger: null,
        contactInstagram: null,
        contactEmail: null,
        showSold: false,
      },
    });
  });

  test("query error -> ok:false", async () => {
    mockedSupabase.from.mockReturnValue(chain({ data: null, error: { message: "nope", code: "42501" } }));
    const res = await getMyShop();
    expect(res).toMatchObject({ ok: false, reason: "error" });
  });

  test("getSession rejects -> ok:false, never throws", async () => {
    mockedSupabase.auth.getSession.mockRejectedValue(new Error("boom"));
    const res = await getMyShop();
    expect(res.ok).toBe(false);
  });
});

describe("saveMyShop", () => {
  test("signed out -> reason auth", async () => {
    signedOut();
    await expect(saveMyShop(PROFILE)).resolves.toMatchObject({ ok: false, reason: "auth" });
  });

  test("upserts on user_id and returns the saved profile", async () => {
    const builder = chain({ data: PROFILE_ROW, error: null });
    mockedSupabase.from.mockReturnValue(builder);

    await expect(saveMyShop(PROFILE)).resolves.toEqual({ ok: true, data: PROFILE });
    expect(mockedSupabase.from).toHaveBeenCalledWith("shops");
    const [payload, options] = builder.upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: "user_id" });
    expect(payload).toEqual({
      user_id: "user-1",
      handle: "tita-ukay",
      display_name: "Tita Ukay",
      bio: "Curated Manila thrift",
      contact_messenger: "titaukay",
      contact_instagram: "tita.ukay",
      contact_email: "tita@example.com",
      show_sold: true,
    });
  });

  test("normalizes the handle before writing", async () => {
    const builder = chain({ data: PROFILE_ROW, error: null });
    mockedSupabase.from.mockReturnValue(builder);
    await saveMyShop({ ...PROFILE, handle: "Tita Ukay" });
    expect(builder.upsert.mock.calls[0][0].handle).toBe("tita-ukay");
  });

  test("invalid handle -> reason error, no network call", async () => {
    const res = await saveMyShop({ ...PROFILE, handle: "ab" });
    expect(res).toMatchObject({ ok: false, reason: "error" });
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  test("blank display name -> reason error, no network call", async () => {
    const res = await saveMyShop({ ...PROFILE, displayName: "   " });
    expect(res).toMatchObject({ ok: false, reason: "error" });
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  test("unique violation 23505 -> reason taken", async () => {
    mockedSupabase.from.mockReturnValue(
      chain({ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "shops_handle_key"' } }),
    );
    const res = await saveMyShop(PROFILE);
    expect(res).toMatchObject({ ok: false, reason: "taken" });
  });

  test("upsert rejects -> ok:false, never throws", async () => {
    mockedSupabase.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await saveMyShop(PROFILE);
    expect(res.ok).toBe(false);
  });
});

describe("uploadItemPhotos", () => {
  test("MAX_ITEM_PHOTOS is 4", () => {
    expect(MAX_ITEM_PHOTOS).toBe(4);
  });

  test("signed out -> reason auth", async () => {
    signedOut();
    await expect(uploadItemPhotos("item-1", ["file:///a.jpg"])).resolves.toMatchObject({
      ok: false,
      reason: "auth",
    });
  });

  test("empty list -> ok with empty array, no upload", async () => {
    const b = bucket();
    mockedSupabase.storage.from.mockReturnValue(b);
    await expect(uploadItemPhotos("item-1", [])).resolves.toEqual({ ok: true, data: [] });
    expect(b.upload).not.toHaveBeenCalled();
  });

  test("uploads to {user}/{item}/{index}.jpg and returns public URLs in order", async () => {
    const b = bucket();
    mockedSupabase.storage.from.mockReturnValue(b);

    const res = await uploadItemPhotos("item-1", ["file:///a.jpg", "file:///b.jpg"]);

    expect(res).toEqual({
      ok: true,
      data: ["https://cdn.test/user-1/item-1/0.jpg", "https://cdn.test/user-1/item-1/1.jpg"],
    });
    expect(mockedSupabase.storage.from).toHaveBeenCalledWith(SHOP_PHOTOS_BUCKET);
    const uploadCalls = b.upload.mock.calls as unknown as unknown[][];
    expect(uploadCalls.map((c) => c[0])).toEqual(["user-1/item-1/0.jpg", "user-1/item-1/1.jpg"]);
    expect(uploadCalls[0][2]).toEqual({ contentType: "image/jpeg", upsert: true });
    expect(uploadCalls[0][1]).toBeInstanceOf(ArrayBuffer);
  });

  test("caps at 4 photos", async () => {
    const b = bucket();
    mockedSupabase.storage.from.mockReturnValue(b);
    const uris = ["a", "b", "c", "d", "e", "f"].map((n) => `file:///${n}.jpg`);

    const res = await uploadItemPhotos("item-1", uris);

    expect(res.ok).toBe(true);
    expect(res.ok && res.data).toHaveLength(4);
    expect(b.upload).toHaveBeenCalledTimes(4);
    expect(mockedFs.readAsStringAsync).toHaveBeenCalledTimes(4);
  });

  test("reads each local file as base64", async () => {
    mockedSupabase.storage.from.mockReturnValue(bucket());
    await uploadItemPhotos("item-1", ["file:///a.jpg"]);
    expect(mockedFs.readAsStringAsync).toHaveBeenCalledWith("file:///a.jpg", { encoding: "base64" });
  });

  test("upload error -> ok:false", async () => {
    mockedSupabase.storage.from.mockReturnValue(
      bucket({ upload: jest.fn(async () => ({ data: null, error: { message: "Network request failed" } })) }),
    );
    const res = await uploadItemPhotos("item-1", ["file:///a.jpg"]);
    expect(res).toMatchObject({ ok: false, reason: "network" });
  });

  test("file read rejects -> ok:false, never throws", async () => {
    (mockedFs.readAsStringAsync as jest.Mock).mockRejectedValue(new Error("ENOENT"));
    const res = await uploadItemPhotos("item-1", ["file:///a.jpg"]);
    expect(res.ok).toBe(false);
  });

  // -------------------------------------------------------- I2a: orphan cleanup

  test("removes objects at indices >= the new photo count after a successful upload", async () => {
    const b = bucket({
      list: jest.fn(async () => ({
        data: [{ name: "0.jpg" }, { name: "1.jpg" }, { name: "2.jpg" }, { name: "3.jpg" }],
        error: null,
      })),
    });
    mockedSupabase.storage.from.mockReturnValue(b);

    // Item shrank from 4 photos to 2 — 2.jpg and 3.jpg must not stay public.
    await uploadItemPhotos("item-1", ["file:///a.jpg", "file:///b.jpg"]);

    expect(b.list).toHaveBeenCalledWith("user-1/item-1");
    expect(b.remove).toHaveBeenCalledWith(["user-1/item-1/2.jpg", "user-1/item-1/3.jpg"]);
  });

  test("no cleanup call when the folder already matches the new count", async () => {
    const b = bucket({
      list: jest.fn(async () => ({ data: [{ name: "0.jpg" }, { name: "1.jpg" }], error: null })),
    });
    mockedSupabase.storage.from.mockReturnValue(b);

    await uploadItemPhotos("item-1", ["file:///a.jpg", "file:///b.jpg"]);

    expect(b.remove).not.toHaveBeenCalled();
  });

  test("orphan cleanup failure never fails the publish — best-effort only", async () => {
    mockedSupabase.storage.from.mockReturnValue(
      bucket({ list: jest.fn(async () => { throw new Error("storage down"); }) }),
    );
    const res = await uploadItemPhotos("item-1", ["file:///a.jpg"]);
    expect(res.ok).toBe(true);
  });
});

describe("decodeBase64", () => {
  test("empty string -> empty buffer", () => {
    expect(decodeBase64("").byteLength).toBe(0);
  });

  test("decodes the same bytes as Node's Buffer", () => {
    const samples = ["", "f", "fo", "foo", "foob", "fooba", "foobar", "Latag × ukay ✨"];
    for (const s of samples) {
      const b64 = Buffer.from(s, "utf8").toString("base64");
      expect(Buffer.from(decodeBase64(b64))).toEqual(Buffer.from(s, "utf8"));
    }
  });

  test("decodes binary bytes across the full 0-255 range", () => {
    const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    expect(Buffer.from(decodeBase64(bytes.toString("base64")))).toEqual(bytes);
  });

  test("tolerates whitespace and newlines inside the payload", () => {
    const raw = Buffer.from("hello world", "utf8");
    const b64 = raw.toString("base64");
    const wrapped = `${b64.slice(0, 4)}\n  ${b64.slice(4)}`;
    expect(Buffer.from(decodeBase64(wrapped))).toEqual(raw);
  });
});

describe("upsertShopItem", () => {
  test("signed out -> reason auth", async () => {
    signedOut();
    await expect(upsertShopItem(ITEM)).resolves.toMatchObject({ ok: false, reason: "auth" });
  });

  test("no shop yet -> reason error", async () => {
    mockedSupabase.from.mockReturnValueOnce(chain({ data: null, error: null }));
    const res = await upsertShopItem(ITEM);
    expect(res).toMatchObject({ ok: false, reason: "error" });
  });

  test("upserts on shop_id,item_local_id with the buyer-facing payload only", async () => {
    const shops = chain({ data: { id: "shop-1" }, error: null });
    const items = chain({ data: null, error: null });
    mockedSupabase.from.mockReturnValueOnce(shops).mockReturnValueOnce(items);

    await expect(upsertShopItem(ITEM)).resolves.toEqual({ ok: true, data: null });

    expect(mockedSupabase.from).toHaveBeenNthCalledWith(1, "shops");
    expect(mockedSupabase.from).toHaveBeenNthCalledWith(2, "shop_items");
    const [payload, options] = items.upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: "shop_id,item_local_id" });
    expect(payload).toEqual({
      shop_id: "shop-1",
      item_local_id: "item-uuid-1",
      code: "LT-7K2Q9",
      brand: "Carhartt",
      name: "Detroit Jacket",
      department: "menswear",
      category: "jacket",
      condition: "9/10",
      specs: [{ k: "Chest", v: '22"' }, { k: "Length", v: '27"' }],
      price: 850,
      status: "available",
      photo_urls: ["https://cdn.test/a.jpg"],
      sort_order: 3,
    });
  });

  test("PRIVACY: no cost, profit, location, or batch data can reach shop_items", async () => {
    const shops = chain({ data: { id: "shop-1" }, error: null });
    const items = chain({ data: null, error: null });
    mockedSupabase.from.mockReturnValueOnce(shops).mockReturnValueOnce(items);

    const leaky = {
      ...ITEM,
      cost: 120,
      profit: 730,
      lat: 14.6,
      lng: 120.98,
      locationName: "Divisoria",
      sessionId: "session-1",
      baleCost: 5000,
    } as unknown as ShopItemUpsert;

    await upsertShopItem(leaky);

    const payload = items.upsert.mock.calls[0][0] as Record<string, unknown>;
    const banned = /cost|profit|margin|lat|lng|location|session|bale|batch/i;
    expect(Object.keys(payload).filter((k) => banned.test(k))).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("Divisoria");
    expect(JSON.stringify(payload)).not.toContain("5000");
  });

  test("upsert error -> ok:false", async () => {
    const shops = chain({ data: { id: "shop-1" }, error: null });
    const items = chain({ data: null, error: { message: "Network request failed" } });
    mockedSupabase.from.mockReturnValueOnce(shops).mockReturnValueOnce(items);
    await expect(upsertShopItem(ITEM)).resolves.toMatchObject({ ok: false, reason: "network" });
  });

  test("shop lookup rejects -> ok:false, never throws", async () => {
    mockedSupabase.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await upsertShopItem(ITEM);
    expect(res.ok).toBe(false);
  });
});

describe("deleteShopItem", () => {
  test("signed out -> reason auth", async () => {
    signedOut();
    await expect(deleteShopItem("item-uuid-1")).resolves.toMatchObject({ ok: false, reason: "auth" });
  });

  test("no shop yet -> already gone, ok", async () => {
    mockedSupabase.from.mockReturnValueOnce(chain({ data: null, error: null }));
    await expect(deleteShopItem("item-uuid-1")).resolves.toEqual({ ok: true, data: null });
  });

  test("deletes the row then removes its storage folder", async () => {
    const shops = chain({ data: { id: "shop-1" }, error: null });
    const items = chain({ data: null, error: null });
    mockedSupabase.from.mockReturnValueOnce(shops).mockReturnValueOnce(items);
    const b = bucket({
      list: jest.fn(async () => ({ data: [{ name: "0.jpg" }, { name: "1.jpg" }], error: null })),
    });
    mockedSupabase.storage.from.mockReturnValue(b);

    await expect(deleteShopItem("item-uuid-1")).resolves.toEqual({ ok: true, data: null });

    expect(items.delete).toHaveBeenCalled();
    expect(items.eq).toHaveBeenCalledWith("shop_id", "shop-1");
    expect(items.eq).toHaveBeenCalledWith("item_local_id", "item-uuid-1");
    expect(b.list).toHaveBeenCalledWith("user-1/item-uuid-1");
    expect(b.remove).toHaveBeenCalledWith(["user-1/item-uuid-1/0.jpg", "user-1/item-uuid-1/1.jpg"]);
  });

  test("empty storage folder -> no remove call, still ok", async () => {
    const shops = chain({ data: { id: "shop-1" }, error: null });
    const items = chain({ data: null, error: null });
    mockedSupabase.from.mockReturnValueOnce(shops).mockReturnValueOnce(items);
    const b = bucket();
    mockedSupabase.storage.from.mockReturnValue(b);

    await expect(deleteShopItem("item-uuid-1")).resolves.toEqual({ ok: true, data: null });
    expect(b.remove).not.toHaveBeenCalled();
  });

  test("row delete error -> ok:false (queue retries)", async () => {
    const shops = chain({ data: { id: "shop-1" }, error: null });
    const items = chain({ data: null, error: { message: "Network request failed" } });
    mockedSupabase.from.mockReturnValueOnce(shops).mockReturnValueOnce(items);
    await expect(deleteShopItem("item-uuid-1")).resolves.toMatchObject({ ok: false, reason: "network" });
  });

  test("storage cleanup failure does not fail the delete — the row is already gone", async () => {
    const shops = chain({ data: { id: "shop-1" }, error: null });
    const items = chain({ data: null, error: null });
    mockedSupabase.from.mockReturnValueOnce(shops).mockReturnValueOnce(items);
    mockedSupabase.storage.from.mockReturnValue(
      bucket({ list: jest.fn(async () => { throw new Error("storage down"); }) }),
    );
    await expect(deleteShopItem("item-uuid-1")).resolves.toEqual({ ok: true, data: null });
  });

  test("shop lookup rejects -> ok:false, never throws", async () => {
    mockedSupabase.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await deleteShopItem("item-uuid-1");
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shop links
// ---------------------------------------------------------------------------

describe("shop links", () => {
  test("shopUrl is the tappable https link buyers receive", () => {
    expect(shopUrl("naga-thrift")).toBe("https://latag.vercel.app/shop/naga-thrift");
  });

  test("shopUrlLabel drops the scheme so the UI reads like the printed address", () => {
    expect(shopUrlLabel("naga-thrift")).toBe("latag.vercel.app/shop/naga-thrift");
    expect(SHOP_URL_PREFIX).toBe("latag.vercel.app/shop/");
  });

  test("both builders normalize whatever they are handed", () => {
    expect(shopUrl(" Naga Thrift ")).toBe("https://latag.vercel.app/shop/naga-thrift");
    expect(shopUrlLabel("Naga Thrift")).toBe("latag.vercel.app/shop/naga-thrift");
  });

  test("shopItemUrl addresses one listing by the code buyers can read aloud", () => {
    expect(shopItemUrl("naga-thrift", "LT-7K2Q9")).toBe("https://latag.vercel.app/shop/naga-thrift/LT-7K2Q9");
  });

  test("shopItemUrl emits the code exactly as stored, whatever case it arrives in", () => {
    expect(shopItemUrl(" Naga Thrift ", " lt-7k2q9 ")).toBe("https://latag.vercel.app/shop/naga-thrift/LT-7K2Q9");
  });

  test("shopItemUrl without a code degrades to the shop itself, never a broken link", () => {
    expect(shopItemUrl("naga-thrift", null)).toBe("https://latag.vercel.app/shop/naga-thrift");
  });
});

describe("normalizeContactHandle", () => {
  test("strips the @ sellers habitually type", () => {
    expect(normalizeContactHandle("@juan.ukay")).toBe("juan.ukay");
  });

  test("strips a pasted profile URL down to the username", () => {
    expect(normalizeContactHandle("https://www.instagram.com/juan.ukay/")).toBe("juan.ukay");
    expect(normalizeContactHandle("m.me/juan.ukay")).toBe("juan.ukay");
    expect(normalizeContactHandle("https://facebook.com/juan.ukay")).toBe("juan.ukay");
  });

  test("leaves a plain username and blank input alone", () => {
    expect(normalizeContactHandle("juan.ukay")).toBe("juan.ukay");
    expect(normalizeContactHandle("   ")).toBe("");
    expect(normalizeContactHandle(null as unknown as string)).toBe("");
  });
});

describe("profile cache", () => {
  const profile: ShopProfile = {
    handle: "naga-thrift",
    displayName: "Naga Thrift",
    bio: "Curated finds",
    contactMessenger: "juan",
    contactInstagram: null,
    contactEmail: null,
    showSold: false,
  };

  test("round-trips the last known profile so the Shop tab works offline", async () => {
    await cacheShop(profile);
    await expect(cachedShop()).resolves.toEqual(profile);
  });

  test("caching null clears it (the seller has no shop)", async () => {
    await cacheShop(profile);
    await cacheShop(null);
    await expect(cachedShop()).resolves.toBeNull();
  });

  test("never throws on unreadable storage", async () => {
    const AsyncStorage = require("@react-native-async-storage/async-storage");
    const spy = jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
    await expect(cachedShop()).resolves.toBeNull();
    spy.mockRestore();
  });
});
