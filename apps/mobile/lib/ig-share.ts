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
   *  "saved-only" = photos saved (launch or clipboard failed);
   *  "permission" | "empty" | "error" = album save failed, nothing else ran. */
  step: "saved-opened" | "saved-only" | "permission" | "empty" | "error";
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
    const hasApp = await Linking.canOpenURL(IG_APP_URL).catch(() => false);
    await Linking.openURL(hasApp ? IG_APP_URL : IG_WEB_URL);
    return { ok: true, step: "saved-opened" };
  } catch {
    // Photos are already in the album — that alone is a useful outcome.
    return { ok: true, step: "saved-only" };
  }
}
