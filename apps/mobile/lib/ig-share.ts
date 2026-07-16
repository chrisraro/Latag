/** One-tap Share to IG — the legitimate maximum without a share-intent module
 *  (spec §5 deviation): save photos to the session's gallery album, copy the
 *  caption to the clipboard, then launch Instagram (app scheme, web fallback).
 *  Photos land first in IG's recents picker; the caption is one paste away.
 *  Never throws: every outcome collapses to a typed { ok, step }. */
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { savePhotosToAlbum } from "./albums";

const IG_APP_URL = "instagram://app";
const IG_WEB_URL = "https://www.instagram.com";

export type ShareToInstagramResult = {
  ok: boolean;
  /** "saved-opened" = photos saved + caption copied + IG launched;
   *  "saved-no-launch" = photos saved + caption copied, but IG didn't open
   *  (clipboard is still good — the caller can say so);
   *  "saved-no-caption" = photos saved but the clipboard write failed, so IG
   *  was never attempted;
   *  "permission" | "empty" | "error" = album save failed, nothing else ran. */
  step: "saved-opened" | "saved-no-launch" | "saved-no-caption" | "permission" | "empty" | "error";
};

export async function shareToInstagram(args: {
  uris: string[];
  caption: string;
  sessionName: string | null;
}): Promise<ShareToInstagramResult> {
  const saved = await savePhotosToAlbum(args.uris, args.sessionName);
  if (!saved.ok) return { ok: false, step: saved.reason };
  try {
    await Clipboard.setStringAsync(args.caption);
  } catch {
    // Photos are already in the album, but the caption never made it to the
    // clipboard — don't claim it did, and don't bother launching IG.
    return { ok: true, step: "saved-no-caption" };
  }
  try {
    const hasApp = await Linking.canOpenURL(IG_APP_URL).catch(() => false);
    await Linking.openURL(hasApp ? IG_APP_URL : IG_WEB_URL);
    return { ok: true, step: "saved-opened" };
  } catch {
    // Photos saved + caption copied — Instagram just didn't launch.
    return { ok: true, step: "saved-no-launch" };
  }
}
