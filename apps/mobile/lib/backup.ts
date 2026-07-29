import * as FileSystem from "expo-file-system/legacy"; // SDK 57: legacy submodule
import * as Sharing from "expo-sharing";
import { db } from "../db/client";
import { sessions, items, photos, userBrands, entitlements } from "../db/schema";

/**
 * Multi-device backup — exports all local data as a JSON file.
 *
 * This is a raw data dump (no encryption for v1). The file is named
 * `latag-backup-YYYY-MM-DD.json` and shared via the system share sheet.
 *
 * Photos are NOT included (they're large binary files stored on-device).
 * Only the metadata (localUri) is exported — photos will need to be
 * re-taken or re-imported separately.
 */

export type BackupData = {
  version: 1;
  exportedAt: string;
  sessions: typeof sessions.$inferSelect[];
  items: typeof items.$inferSelect[];
  photos: typeof photos.$inferSelect[];
  userBrands: typeof userBrands.$inferSelect[];
  entitlements: typeof entitlements.$inferSelect[];
};

/**
 * Export all local data to a JSON file and share it.
 * Returns the file URI on success.
 */
export async function exportBackup(): Promise<{ ok: true; uri: string } | { ok: false; error: string }> {
  try {
    // Query all tables
    const [sessionsData, itemsData, photosData, brandsData, entData] = await Promise.all([
      db.select().from(sessions),
      db.select().from(items),
      db.select().from(photos),
      db.select().from(userBrands),
      db.select().from(entitlements),
    ]);

    const backup: BackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: sessionsData,
      items: itemsData,
      photos: photosData,
      userBrands: brandsData,
      entitlements: entData,
    };

    // Write to file
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `latag-backup-${date}.json`;
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Share the file
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/json",
        dialogTitle: "Export Latag Backup",
        UTI: "public.json",
      });
    }

    return { ok: true, uri: fileUri };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Read a backup file and return parsed data.
 * Does NOT write to the database — that's restoreBackup's job.
 */
export async function readBackupFile(uri: string): Promise<{ ok: true; data: BackupData } | { ok: false; error: string }> {
  try {
    const content = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const parsed = JSON.parse(content) as BackupData;

    // Validate structure
    if (parsed.version !== 1) {
      return { ok: false, error: `Unsupported backup version: ${parsed.version}` };
    }

    if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.items)) {
      return { ok: false, error: "Invalid backup format" };
    }

    return { ok: true, data: parsed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Restore data from a backup into the local database.
 *
 * Strategy: insert-or-replace all rows. This is safe because:
 * - The user is explicitly choosing to restore
 * - UUIDs are collision-resistant
 * - The backup is a complete snapshot
 *
 * Photos are NOT restored (the localUri references won't exist on a new device).
 * The user will need to re-take photos.
 */
export async function restoreBackup(data: BackupData): Promise<{ ok: true; counts: Record<string, number> } | { ok: false; error: string }> {
  try {
    const counts: Record<string, number> = {};

    // Restore sessions
    if (data.sessions.length > 0) {
      await db.delete(sessions);
      for (const row of data.sessions) {
        await db.insert(sessions).values(row);
      }
      counts.sessions = data.sessions.length;
    }

    // Restore items
    if (data.items.length > 0) {
      await db.delete(items);
      for (const row of data.items) {
        await db.insert(items).values(row);
      }
      counts.items = data.items.length;
    }

    // Restore photos
    if (data.photos.length > 0) {
      await db.delete(photos);
      for (const row of data.photos) {
        await db.insert(photos).values(row);
      }
      counts.photos = data.photos.length;
    }

    // Restore user brands
    if (data.userBrands.length > 0) {
      await db.delete(userBrands);
      for (const row of data.userBrands) {
        await db.insert(userBrands).values(row);
      }
      counts.brands = data.userBrands.length;
    }

    // Restore entitlements
    if (data.entitlements.length > 0) {
      await db.delete(entitlements);
      for (const row of data.entitlements) {
        await db.insert(entitlements).values(row);
      }
      counts.entitlements = data.entitlements.length;
    }

    return { ok: true, counts };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
