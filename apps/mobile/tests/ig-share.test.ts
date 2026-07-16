import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { savePhotosToAlbum } from "../lib/albums";
import { shareToInstagram } from "../lib/ig-share";

jest.mock("../lib/albums", () => ({ savePhotosToAlbum: jest.fn() }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("expo-linking", () => ({
  canOpenURL: jest.fn(async () => true),
  openURL: jest.fn(async () => true),
}));

const mockedSave = savePhotosToAlbum as jest.MockedFunction<typeof savePhotosToAlbum>;
const mockedClipboard = Clipboard as jest.Mocked<typeof Clipboard>;
const mockedLinking = Linking as jest.Mocked<typeof Linking>;

const ARGS = { uris: ["file:///a.jpg", "file:///b.jpg"], caption: "drop caption", sessionName: "Ukay Run" };

beforeEach(() => {
  jest.clearAllMocks();
  mockedSave.mockResolvedValue({ ok: true, count: 2, album: "Latag · Ukay Run" });
  (mockedClipboard.setStringAsync as jest.Mock).mockResolvedValue(true);
  (mockedLinking.canOpenURL as jest.Mock).mockResolvedValue(true);
  (mockedLinking.openURL as jest.Mock).mockResolvedValue(true);
});

describe("shareToInstagram", () => {
  test("happy path: saves, copies caption, opens the IG app", async () => {
    const res = await shareToInstagram(ARGS);
    expect(res).toEqual({ ok: true, step: "saved-opened" });
    expect(mockedSave).toHaveBeenCalledWith(ARGS.uris, "Ukay Run");
    expect(mockedClipboard.setStringAsync).toHaveBeenCalledWith("drop caption");
    expect(mockedLinking.canOpenURL).toHaveBeenCalledWith("instagram://app");
    expect(mockedLinking.openURL).toHaveBeenCalledWith("instagram://app");
  });

  test("IG app not installed: opens instagram.com instead", async () => {
    (mockedLinking.canOpenURL as jest.Mock).mockResolvedValue(false);
    const res = await shareToInstagram(ARGS);
    expect(res).toEqual({ ok: true, step: "saved-opened" });
    expect(mockedLinking.openURL).toHaveBeenCalledWith("https://www.instagram.com");
  });

  test("canOpenURL throws: falls back to the web URL, still saved-opened", async () => {
    (mockedLinking.canOpenURL as jest.Mock).mockRejectedValue(new Error("no scheme query"));
    const res = await shareToInstagram(ARGS);
    expect(res).toEqual({ ok: true, step: "saved-opened" });
    expect(mockedLinking.openURL).toHaveBeenCalledWith("https://www.instagram.com");
  });

  test("openURL fails: photos saved + caption copied -> saved-only", async () => {
    (mockedLinking.openURL as jest.Mock).mockRejectedValue(new Error("boom"));
    const res = await shareToInstagram(ARGS);
    expect(res).toEqual({ ok: true, step: "saved-only" });
    expect(mockedClipboard.setStringAsync).toHaveBeenCalledWith("drop caption");
  });

  test("clipboard fails: photos are already saved -> saved-only, IG not opened", async () => {
    (mockedClipboard.setStringAsync as jest.Mock).mockRejectedValue(new Error("boom"));
    const res = await shareToInstagram(ARGS);
    expect(res).toEqual({ ok: true, step: "saved-only" });
    expect(mockedLinking.openURL).not.toHaveBeenCalled();
  });

  test("permission denied: matching step, clipboard and linking untouched", async () => {
    mockedSave.mockResolvedValue({ ok: false, reason: "permission" });
    const res = await shareToInstagram(ARGS);
    expect(res).toEqual({ ok: false, step: "permission" });
    expect(mockedClipboard.setStringAsync).not.toHaveBeenCalled();
    expect(mockedLinking.canOpenURL).not.toHaveBeenCalled();
    expect(mockedLinking.openURL).not.toHaveBeenCalled();
  });

  test("no uris: matching empty step, nothing else happens", async () => {
    mockedSave.mockResolvedValue({ ok: false, reason: "empty" });
    const res = await shareToInstagram({ ...ARGS, uris: [] });
    expect(res).toEqual({ ok: false, step: "empty" });
    expect(mockedClipboard.setStringAsync).not.toHaveBeenCalled();
    expect(mockedLinking.openURL).not.toHaveBeenCalled();
  });

  test("album save error: matching error step, never throws", async () => {
    mockedSave.mockResolvedValue({ ok: false, reason: "error" });
    const res = await shareToInstagram(ARGS);
    expect(res).toEqual({ ok: false, step: "error" });
    expect(mockedClipboard.setStringAsync).not.toHaveBeenCalled();
  });

  test("null session name passes through to savePhotosToAlbum", async () => {
    mockedSave.mockResolvedValue({ ok: true, count: 1, album: "Latag" });
    await shareToInstagram({ ...ARGS, sessionName: null });
    expect(mockedSave).toHaveBeenCalledWith(ARGS.uris, null);
  });
});
