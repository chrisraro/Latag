/** Gallery albums — save item/session photos into per-session "Latag · …"
 *  albums via expo-media-library. Never throws: every failure collapses to a
 *  typed { ok: false, reason } so callers only map results to toasts.
 *
 *  NOTE: the classic album functions must come from `expo-media-library/legacy`
 *  — the v57 main-entry re-exports are deprecated stubs that throw at runtime. */
import * as MediaLibrary from "expo-media-library/legacy";

const MAX_ALBUM_NAME = 60;

/** Album title for a session: `Latag · {name}` (trimmed, capped at 60 chars);
 *  plain `Latag` when the session name is blank or missing. */
export function albumNameFor(sessionName: string | null | undefined): string {
  const trimmed = (sessionName ?? "").trim();
  if (!trimmed) return "Latag";
  return `Latag · ${trimmed}`.slice(0, MAX_ALBUM_NAME);
}

export type SaveToAlbumResult =
  | { ok: true; count: number; album: string }
  | { ok: false; reason: "permission" | "empty" | "error" };

/** Save local photo files to the session's gallery album. Requests write
 *  access, creates one asset per uri, then creates the album once (seeded
 *  with the first asset — Android can't create empty albums) or reuses an
 *  existing one. copyAsset=false so assets move instead of duplicating. */
export async function savePhotosToAlbum(
  uris: string[],
  sessionName: string | null,
): Promise<SaveToAlbumResult> {
  if (uris.length === 0) return { ok: false, reason: "empty" };
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(false);
    if (!perm.granted) return { ok: false, reason: "permission" };

    const album = albumNameFor(sessionName);
    const assets: MediaLibrary.Asset[] = [];
    for (const uri of uris) assets.push(await MediaLibrary.createAssetAsync(uri));

    const existing = await MediaLibrary.getAlbumAsync(album);
    if (existing) {
      await MediaLibrary.addAssetsToAlbumAsync(assets, existing, false);
    } else {
      const created = await MediaLibrary.createAlbumAsync(album, assets[0], false);
      if (assets.length > 1) await MediaLibrary.addAssetsToAlbumAsync(assets.slice(1), created, false);
    }
    return { ok: true, count: assets.length, album };
  } catch {
    return { ok: false, reason: "error" };
  }
}
