import * as MediaLibrary from "expo-media-library/legacy";
import { albumNameFor, savePhotosToAlbum } from "../lib/albums";

const mocked = MediaLibrary as jest.Mocked<typeof MediaLibrary>;

beforeEach(() => {
  jest.clearAllMocks();
  (mocked.requestPermissionsAsync as jest.Mock).mockImplementation(async () => ({ granted: true }));
  (mocked.createAssetAsync as jest.Mock).mockImplementation(async (uri: string) => ({ id: "asset-" + uri, uri }));
  (mocked.getAlbumAsync as jest.Mock).mockImplementation(async () => null);
  (mocked.createAlbumAsync as jest.Mock).mockImplementation(async (name: string) => ({ id: "album-1", title: name }));
  (mocked.addAssetsToAlbumAsync as jest.Mock).mockImplementation(async () => true);
});

describe("albumNameFor", () => {
  test("session name -> prefixed album name", () => {
    expect(albumNameFor("Ukay Run")).toBe("Latag · Ukay Run");
  });
  test("trims whitespace", () => {
    expect(albumNameFor("  Ukay Run  ")).toBe("Latag · Ukay Run");
  });
  test("truncates to 60 chars", () => {
    const name = albumNameFor("x".repeat(80));
    expect(name).toHaveLength(60);
    expect(name.startsWith("Latag · xxx")).toBe(true);
  });
  test("null -> Latag fallback", () => {
    expect(albumNameFor(null)).toBe("Latag");
  });
  test("undefined -> Latag fallback", () => {
    expect(albumNameFor(undefined)).toBe("Latag");
  });
  test("blank -> Latag fallback", () => {
    expect(albumNameFor("   ")).toBe("Latag");
  });
});

describe("savePhotosToAlbum", () => {
  test("empty uris -> empty, no native calls", async () => {
    const res = await savePhotosToAlbum([], "Ukay Run");
    expect(res).toEqual({ ok: false, reason: "empty" });
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.createAssetAsync).not.toHaveBeenCalled();
  });

  test("permission denied -> permission, no assets created", async () => {
    (mocked.requestPermissionsAsync as jest.Mock).mockImplementation(async () => ({ granted: false }));
    const res = await savePhotosToAlbum(["file:///a.jpg"], "Ukay Run");
    expect(res).toEqual({ ok: false, reason: "permission" });
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledWith(false);
    expect(mocked.createAssetAsync).not.toHaveBeenCalled();
  });

  test("N uris, no existing album -> createAsset x N, album created once, rest added", async () => {
    const uris = ["file:///a.jpg", "file:///b.jpg", "file:///c.jpg"];
    const res = await savePhotosToAlbum(uris, "Ukay Run");
    expect(res).toEqual({ ok: true, count: 3, album: "Latag · Ukay Run" });
    expect(mocked.createAssetAsync).toHaveBeenCalledTimes(3);
    uris.forEach((uri, i) => expect(mocked.createAssetAsync).toHaveBeenNthCalledWith(i + 1, uri));
    expect(mocked.getAlbumAsync).toHaveBeenCalledWith("Latag · Ukay Run");
    expect(mocked.createAlbumAsync).toHaveBeenCalledTimes(1);
    expect(mocked.createAlbumAsync).toHaveBeenCalledWith(
      "Latag · Ukay Run",
      expect.objectContaining({ id: "asset-file:///a.jpg" }),
      false,
    );
    expect(mocked.addAssetsToAlbumAsync).toHaveBeenCalledTimes(1);
    expect(mocked.addAssetsToAlbumAsync).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "asset-file:///b.jpg" }), expect.objectContaining({ id: "asset-file:///c.jpg" })],
      expect.objectContaining({ id: "album-1" }),
      false,
    );
  });

  test("single uri, no existing album -> album created with the asset, no add call", async () => {
    const res = await savePhotosToAlbum(["file:///a.jpg"], "Ukay Run");
    expect(res).toEqual({ ok: true, count: 1, album: "Latag · Ukay Run" });
    expect(mocked.createAlbumAsync).toHaveBeenCalledTimes(1);
    expect(mocked.addAssetsToAlbumAsync).not.toHaveBeenCalled();
  });

  test("existing album reused -> no createAlbum, all assets added to it", async () => {
    (mocked.getAlbumAsync as jest.Mock).mockImplementation(async () => ({ id: "album-existing", title: "Latag · Ukay Run" }));
    const res = await savePhotosToAlbum(["file:///a.jpg", "file:///b.jpg"], "Ukay Run");
    expect(res).toEqual({ ok: true, count: 2, album: "Latag · Ukay Run" });
    expect(mocked.createAlbumAsync).not.toHaveBeenCalled();
    expect(mocked.addAssetsToAlbumAsync).toHaveBeenCalledTimes(1);
    expect(mocked.addAssetsToAlbumAsync).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "asset-file:///a.jpg" }), expect.objectContaining({ id: "asset-file:///b.jpg" })],
      expect.objectContaining({ id: "album-existing" }),
      false,
    );
  });

  test("null session name -> Latag fallback album", async () => {
    const res = await savePhotosToAlbum(["file:///a.jpg"], null);
    expect(res).toEqual({ ok: true, count: 1, album: "Latag" });
    expect(mocked.getAlbumAsync).toHaveBeenCalledWith("Latag");
  });

  test("native throw -> error, never throws", async () => {
    (mocked.createAssetAsync as jest.Mock).mockImplementation(async () => { throw new Error("boom"); });
    const res = await savePhotosToAlbum(["file:///a.jpg"], "Ukay Run");
    expect(res).toEqual({ ok: false, reason: "error" });
  });

  test("mid-batch createAsset failure -> orphan cleanup deletes the assets already created", async () => {
    (mocked.createAssetAsync as jest.Mock)
      .mockImplementationOnce(async (uri: string) => ({ id: "asset-" + uri, uri }))
      .mockImplementationOnce(async () => { throw new Error("storage full"); });
    const res = await savePhotosToAlbum(["file:///a.jpg", "file:///b.jpg", "file:///c.jpg"], "Ukay Run");
    expect(res).toEqual({ ok: false, reason: "error" });
    expect(mocked.deleteAssetsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.deleteAssetsAsync).toHaveBeenCalledWith([
      expect.objectContaining({ id: "asset-file:///a.jpg" }),
    ]);
    expect(mocked.createAlbumAsync).not.toHaveBeenCalled();
  });

  test("album-op failure with limited access -> permission (not error), orphans cleaned up", async () => {
    (mocked.requestPermissionsAsync as jest.Mock).mockImplementation(async () => ({ granted: true, accessPrivileges: "limited" }));
    (mocked.createAlbumAsync as jest.Mock).mockImplementation(async () => { throw new Error("limited access denied"); });
    const res = await savePhotosToAlbum(["file:///a.jpg"], "Ukay Run");
    expect(res).toEqual({ ok: false, reason: "permission" });
    expect(mocked.deleteAssetsAsync).toHaveBeenCalledTimes(1);
  });

  test("album-op failure without limited access -> error, orphans cleaned up", async () => {
    (mocked.createAlbumAsync as jest.Mock).mockImplementation(async () => { throw new Error("boom"); });
    const res = await savePhotosToAlbum(["file:///a.jpg"], "Ukay Run");
    expect(res).toEqual({ ok: false, reason: "error" });
    expect(mocked.deleteAssetsAsync).toHaveBeenCalledTimes(1);
  });
});
