import * as Notifications from "expo-notifications";
import {
  ensureNotifPermission,
  ensureAlarmChannel,
  scheduleSessionReminders,
  cancelReminders,
  parseNotifIds,
  reminderBodyFor,
  notifResponsePath,
} from "../lib/notifications";

const MIN = 60_000;
const mocked = Notifications as jest.Mocked<typeof Notifications>;

beforeEach(() => {
  jest.clearAllMocks();
  (mocked.requestPermissionsAsync as jest.Mock).mockImplementation(async () => ({ granted: true }));
  (mocked.scheduleNotificationAsync as jest.Mock).mockImplementation(
    async () => "id-" + Math.random(),
  );
  (mocked.cancelScheduledNotificationAsync as jest.Mock).mockImplementation(async () => {});
  (mocked.setNotificationChannelAsync as jest.Mock).mockImplementation(async () => null);
});

describe("parseNotifIds", () => {
  test("null -> []", () => {
    expect(parseNotifIds(null)).toEqual([]);
  });
  test("garbage JSON -> []", () => {
    expect(parseNotifIds("{nope")).toEqual([]);
  });
  test("non-array JSON -> []", () => {
    expect(parseNotifIds('{"a":1}')).toEqual([]);
  });
  test("non-string entries dropped", () => {
    expect(parseNotifIds('["a", 2, null, "b"]')).toEqual(["a", "b"]);
  });
  test("valid array round-trips", () => {
    expect(parseNotifIds(JSON.stringify(["x-1", "x-2"]))).toEqual(["x-1", "x-2"]);
  });
});

describe("reminderBodyFor", () => {
  test("offset 0 -> opens-now copy", () => {
    expect(reminderBodyFor(0)).toBe("Bale opens now — start your session");
  });
  test("offset 30 -> countdown lead", () => {
    expect(reminderBodyFor(30)).toBe("Bale opens in 30m");
  });
  test("offset 60 -> hours", () => {
    expect(reminderBodyFor(60)).toBe("Bale opens in 1h");
  });
  test("offset 1440 -> countdown-style hours", () => {
    expect(reminderBodyFor(1440)).toBe("Bale opens in 24h");
  });
});

describe("notifResponsePath", () => {
  const respWithUrl = (url: unknown) =>
    ({ notification: { request: { content: { data: { url } } } } }) as any;

  test("latag:// url -> in-app path", () => {
    expect(notifResponsePath(respWithUrl("latag://session/abc"))).toBe("/session/abc");
  });
  test("null response -> null", () => {
    expect(notifResponsePath(null)).toBeNull();
  });
  test("undefined response -> null", () => {
    expect(notifResponsePath(undefined)).toBeNull();
  });
  test("missing data -> null", () => {
    expect(notifResponsePath({ notification: { request: { content: {} } } } as any)).toBeNull();
  });
  test("non-latag scheme -> null (never routed as a raw URL)", () => {
    expect(notifResponsePath(respWithUrl("https://evil.example/phish"))).toBeNull();
  });
  test("non-string url -> null", () => {
    expect(notifResponsePath(respWithUrl(42))).toBeNull();
  });
  test("malformed payload shape -> null, never throws", () => {
    expect(notifResponsePath({ notification: null } as any)).toBeNull();
  });
});

describe("ensureNotifPermission", () => {
  test("granted -> true", async () => {
    await expect(ensureNotifPermission()).resolves.toBe(true);
  });
  test("denied -> false", async () => {
    (mocked.requestPermissionsAsync as jest.Mock).mockImplementation(async () => ({
      granted: false,
    }));
    await expect(ensureNotifPermission()).resolves.toBe(false);
  });
  test("throwing native module -> false, never throws", async () => {
    (mocked.requestPermissionsAsync as jest.Mock).mockImplementation(async () => {
      throw new Error("boom");
    });
    await expect(ensureNotifPermission()).resolves.toBe(false);
  });
});

describe("ensureAlarmChannel", () => {
  test("creates the session-reminders alarm channel", async () => {
    await ensureAlarmChannel();
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith("session-reminders", {
      name: "Session reminders",
      importance: Notifications.AndroidImportance.MAX,
      sound: "alarm.wav",
      vibrationPattern: [0, 400, 200, 400],
      bypassDnd: false,
    });
  });
  test("swallows native failure", async () => {
    (mocked.setNotificationChannelAsync as jest.Mock).mockImplementation(async () => {
      throw new Error("boom");
    });
    await expect(ensureAlarmChannel()).resolves.toBeUndefined();
  });
});

describe("scheduleSessionReminders", () => {
  const now = new Date(2026, 6, 16, 12, 0, 0);
  const session = (offsets: number[]) => ({
    id: "s1",
    name: "Bale Run",
    scheduledAt: new Date(now.getTime() + 120 * MIN), // 2h away
    offsets,
  });

  test("maps reminderTimes to schedule calls: past offsets filtered, sorted asc", async () => {
    const ids = await scheduleSessionReminders(session([0, 30, 1440]), now);
    // 1440 (1 day before) is in the past for a 2h-away session -> excluded.
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(ids).toHaveLength(2);
    ids.forEach((id) => expect(typeof id).toBe("string"));
    const calls = (mocked.scheduleNotificationAsync as jest.Mock).mock.calls.map((c) => c[0]);
    // Ascending fire order: 30-min-before first, at-time second.
    expect(calls[0].trigger).toEqual({
      type: "date",
      date: new Date(session([]).scheduledAt.getTime() - 30 * MIN),
      channelId: "session-reminders",
    });
    expect(calls[0].content.body).toBe("Bale opens in 30m");
    expect(calls[1].trigger).toEqual({
      type: "date",
      date: session([]).scheduledAt,
      channelId: "session-reminders",
    });
    expect(calls[1].content.body).toBe("Bale opens now — start your session");
    for (const call of calls) {
      expect(call.content.title).toBe("⏰ Bale Run");
      expect(call.content.data).toEqual({ url: "latag://session/s1" });
      expect(call.content.sound).toBe("alarm.wav");
      expect(call.content.interruptionLevel).toBe("timeSensitive");
    }
  });

  test("duplicate offsets scheduled once", async () => {
    const ids = await scheduleSessionReminders(session([30, 30]), now);
    expect(ids).toHaveLength(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  test("all offsets in the past -> no calls, empty ids", async () => {
    const ids = await scheduleSessionReminders(session([1440, 2880]), now);
    expect(ids).toEqual([]);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("one call failing does not drop the rest — collected ids still returned", async () => {
    (mocked.scheduleNotificationAsync as jest.Mock)
      .mockImplementationOnce(async () => {
        throw new Error("boom");
      })
      .mockImplementationOnce(async () => "id-ok");
    const ids = await scheduleSessionReminders(session([0, 30]), now);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(ids).toEqual(["id-ok"]);
  });
});

describe("cancelReminders", () => {
  test("null / undefined tolerated", async () => {
    await expect(cancelReminders(null)).resolves.toBeUndefined();
    await expect(cancelReminders(undefined)).resolves.toBeUndefined();
    expect(mocked.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
  test("cancels each id", async () => {
    await cancelReminders(["a", "b"]);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith("a");
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith("b");
  });
  test("a rejecting cancel does not throw and later ids still cancel", async () => {
    (mocked.cancelScheduledNotificationAsync as jest.Mock)
      .mockImplementationOnce(async () => {
        throw new Error("gone");
      })
      .mockImplementation(async () => {});
    await expect(cancelReminders(["dead", "live"])).resolves.toBeUndefined();
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith("live");
  });
});
