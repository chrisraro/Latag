import * as FileSystem from "expo-file-system/legacy"; // SDK 57: legacy submodule confirmed present, mirrors old API
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import { photos } from "../db/schema";

export const MEDIA_DIR = `${FileSystem.documentDirectory}latag_media/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MEDIA_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
}

/**
 * Blueprint protocol: resize w1200 → JPEG 0.7 → move to latag_media/ → return file:// URI.
 * File is written to disk BEFORE any DB row is inserted (caller inserts the row after this
 * resolves) — a crash between the two leaves an orphan FILE, never a broken row. See sweepOrphans.
 */
export async function persistPhoto(tempUri: string): Promise<string> {
  await ensureDir();
  const context = ImageManipulator.manipulate(tempUri);
  context.resize({ width: 1200 });
  const rendered = await context.renderAsync();
  const compressed = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  const dest = `${MEDIA_DIR}${Crypto.randomUUID()}.jpg`;
  await FileSystem.moveAsync({ from: compressed.uri, to: dest });
  return dest;
}

export async function deleteFiles(uris: string[]): Promise<void> {
  await Promise.all(uris.map((u) => FileSystem.deleteAsync(u, { idempotent: true })));
}

/** Pure: files on disk that no DB row references. */
export function orphanUris(filesInDir: string[], dbUris: string[]): string[] {
  const known = new Set(dbUris);
  return filesInDir.filter((f) => !known.has(f));
}

/** Crash between file-write and row-insert leaves an orphan FILE, never a broken row. Sweep on boot. */
export async function sweepOrphans(db: any): Promise<number> {
  await ensureDir();
  const names: string[] = await FileSystem.readDirectoryAsync(MEDIA_DIR);
  const onDisk = names.map((n) => `${MEDIA_DIR}${n}`);
  const inDb = db.select({ uri: photos.localUri }).from(photos).all().map((r: { uri: string }) => r.uri);
  const orphans = orphanUris(onDisk, inDb);
  await deleteFiles(orphans);
  return orphans.length;
}
