/** Local session-reminder notifications — a thin, tolerant wrapper over
 *  expo-notifications. Fully local (no push): reminders are scheduled on-device
 *  from lib/schedule's reminderTimes and fire through the "session-reminders"
 *  alarm channel. Every native call is guarded — reminders are best-effort and
 *  must never block or crash session flows. */
import * as Notifications from "expo-notifications";
import { formatCountdown, reminderTimes } from "./schedule";

export const ALARM_CHANNEL_ID = "session-reminders";
const MIN_MS = 60_000;

/** Request notification permission. Never throws; false on deny/error. */
export async function ensureNotifPermission(): Promise<boolean> {
  try {
    const res = await Notifications.requestPermissionsAsync();
    return !!res.granted;
  } catch {
    return false;
  }
}

/** Create/refresh the Android alarm channel. No-op on iOS (the platform
 *  module resolves null there); failures are swallowed — scheduling then
 *  falls back to the default channel. */
export async function ensureAlarmChannel(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
      name: "Session reminders",
      importance: Notifications.AndroidImportance.MAX,
      sound: "alarm.wav",
      vibrationPattern: [0, 400, 200, 400],
      bypassDnd: false,
    });
  } catch {
    // Best-effort.
  }
}

/** Notification body copy for a reminder firing `offsetMinutes` before the session. */
export function reminderBodyFor(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "Bale opens now — start your session";
  return `Bale opens ${formatCountdown(new Date(offsetMinutes * MIN_MS), new Date(0))}`;
}

/** Schedule one local notification per valid reminder time (strictly future,
 *  deduped, soonest first — see reminderTimes). Returns the notification ids
 *  in fire order for persistence (sessions.reminderNotificationIds). */
export async function scheduleSessionReminders(
  s: { id: string; name: string; scheduledAt: Date; offsets: number[] },
  now: Date = new Date(),
): Promise<string[]> {
  const valid = new Set(reminderTimes(s.scheduledAt, s.offsets, now).map((d) => d.getTime()));
  const entries: { offset: number; time: number }[] = [];
  for (const offset of s.offsets) {
    const time = s.scheduledAt.getTime() - offset * MIN_MS;
    if (valid.delete(time)) entries.push({ offset, time }); // delete() dedupes too
  }
  entries.sort((a, b) => a.time - b.time);

  const ids: string[] = [];
  for (const { offset, time } of entries) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏰ ${s.name}`,
          body: reminderBodyFor(offset),
          sound: "alarm.wav",
          interruptionLevel: "timeSensitive",
          data: { url: `latag://session/${s.id}` },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(time),
          channelId: ALARM_CHANNEL_ID,
        },
      });
      ids.push(id);
    } catch {
      // One reminder failing to schedule must not drop the rest.
    }
  }
  return ids;
}

/** Cancel previously scheduled reminders. Tolerant: null/undefined lists and
 *  already-fired/unknown ids are no-ops. */
export async function cancelReminders(ids: string[] | null | undefined): Promise<void> {
  if (!ids) return;
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Already fired or unknown — nothing to cancel.
    }
  }
}

/** Extracts the in-app router path (e.g. "/session/abc") from a notification
 *  response's stashed `latag://...` deep-link (see scheduleSessionReminders'
 *  data.url above). Routes by PATH, never by the raw scheme-URL. Returns null
 *  for anything else — missing response, malformed payload, non-latag scheme —
 *  so callers can no-op safely. */
export function notifResponsePath(
  resp: Notifications.NotificationResponse | null | undefined,
): string | null {
  try {
    const url = resp?.notification.request.content.data?.url;
    if (typeof url === "string" && url.startsWith("latag://")) {
      return url.replace(/^latag:\/\//, "/");
    }
  } catch {
    // Malformed payload — no-op.
  }
  return null;
}

/** Tolerant JSON-array-of-strings parser for sessions.reminderNotificationIds:
 *  null/invalid/non-array → []; non-string entries dropped. */
export function parseNotifIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}
