import * as FileSystem from "expo-file-system/legacy"; // SDK 57: legacy submodule, mirrors media.ts's pattern
import { MEDIA_DIR } from "./media";

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** Rounds to at most 1 decimal place and strips a trailing ".0". */
function round1(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${round1(bytes / KB)} KB`;
  if (bytes < GB) return `${round1(bytes / MB)} MB`;
  return `${round1(bytes / GB)} GB`;
}

/** Pure: count + total bytes + human-readable label over a list of file sizes. */
export function summarizeUsage(sizes: number[]): { count: number; bytes: number; label: string } {
  const count = sizes.length;
  const bytes = sizes.reduce((sum, s) => sum + s, 0);
  return { count, bytes, label: formatBytes(bytes) };
}

/**
 * Reads latag_media/ off disk and summarizes on-device storage usage.
 * Device-only path (FileSystem), not unit-tested. Never throws: any failure
 * (dir missing, permission error, etc.) resolves to a zeroed-out summary so
 * Settings can render safely even on a fresh install or odd device state.
 */
export async function getMediaUsage(): Promise<{ count: number; bytes: number; label: string }> {
  try {
    const names = await FileSystem.readDirectoryAsync(MEDIA_DIR);
    const sizes = await Promise.all(
      names.map(async (name) => {
        const info = await FileSystem.getInfoAsync(`${MEDIA_DIR}${name}`);
        return info.exists && !info.isDirectory ? (info.size ?? 0) : 0;
      })
    );
    return summarizeUsage(sizes);
  } catch {
    return { count: 0, bytes: 0, label: "0 B" };
  }
}
