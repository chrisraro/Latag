import {
  REMINDER_PRESETS,
  reminderTimes,
  parseOffsets,
  formatCountdown,
  scheduleSortKey,
  formatScheduleStamp,
} from "../lib/schedule";

const MIN = 60_000;

describe("REMINDER_PRESETS", () => {
  test("exact minutes + labels", () => {
    expect(REMINDER_PRESETS).toEqual([
      { minutes: 0, label: "At time" },
      { minutes: 30, label: "30 min before" },
      { minutes: 60, label: "1 hr before" },
      { minutes: 1440, label: "1 day before" },
    ]);
  });
});

describe("reminderTimes", () => {
  const now = new Date(2026, 6, 16, 12, 0, 0);
  test("scheduledAt - offset, sorted ascending", () => {
    const at = new Date(now.getTime() + 120 * MIN); // 2h away
    expect(reminderTimes(at, [0, 30, 60], now)).toEqual([
      new Date(at.getTime() - 60 * MIN),
      new Date(at.getTime() - 30 * MIN),
      at,
    ]);
  });
  test("past-filtering: 1440 offset on a 2h-away session is excluded", () => {
    const at = new Date(now.getTime() + 120 * MIN);
    expect(reminderTimes(at, [0, 1440], now)).toEqual([at]);
  });
  test("strictly future: a time equal to now is excluded", () => {
    const at = new Date(now.getTime() + 60 * MIN);
    expect(reminderTimes(at, [60], now)).toEqual([]);
  });
  test("dedupes identical times", () => {
    const at = new Date(now.getTime() + 120 * MIN);
    expect(reminderTimes(at, [30, 30, 60], now)).toEqual([
      new Date(at.getTime() - 60 * MIN),
      new Date(at.getTime() - 30 * MIN),
    ]);
  });
  test("fully past session yields no reminders", () => {
    const at = new Date(now.getTime() - 10 * MIN);
    expect(reminderTimes(at, [0, 30, 60], now)).toEqual([]);
  });
});

describe("parseOffsets", () => {
  test("null → []", () => expect(parseOffsets(null)).toEqual([]));
  test("invalid JSON → []", () => expect(parseOffsets("garbage")).toEqual([]));
  test("non-array JSON → []", () => expect(parseOffsets('{"a":1}')).toEqual([]));
  test("valid array parses", () => expect(parseOffsets("[0,60,1440]")).toEqual([0, 60, 1440]));
  test("non-number entries are dropped", () =>
    expect(parseOffsets('[0,"x",60,null]')).toEqual([0, 60]));
});

describe("formatCountdown", () => {
  const now = new Date(2026, 6, 16, 12, 0, 0);
  const inMin = (m: number) => new Date(now.getTime() + m * MIN);
  test(">48h → days+hours", () => expect(formatCountdown(inMin(3 * 1440 + 4 * 60), now)).toBe("in 3d 4h"));
  test("days with zero hours omits hours", () => expect(formatCountdown(inMin(3 * 1440), now)).toBe("in 3d"));
  test("hours+minutes", () => expect(formatCountdown(inMin(2 * 60 + 15), now)).toBe("in 2h 15m"));
  test("hours with zero minutes omits minutes", () => expect(formatCountdown(inMin(120), now)).toBe("in 2h"));
  test("<1h → minutes", () => expect(formatCountdown(inMin(45), now)).toBe("in 45m"));
  test("under a minute → now", () => expect(formatCountdown(new Date(now.getTime() + 30_000), now)).toBe("now"));
  test("past → now", () => expect(formatCountdown(inMin(-5), now)).toBe("now"));
});

describe("scheduleSortKey", () => {
  test("soonest-first ordering; null last", () => {
    const a = { scheduledAt: new Date(2026, 6, 20) };
    const b = { scheduledAt: new Date(2026, 6, 18) };
    const c = { scheduledAt: null };
    const sorted = [a, c, b].sort((x, y) => scheduleSortKey(x) - scheduleSortKey(y));
    expect(sorted).toEqual([b, a, c]);
  });
});

describe("formatScheduleStamp", () => {
  test("fixed fixture", () =>
    expect(formatScheduleStamp(new Date(2026, 6, 18, 6, 30))).toBe("Sat · Jul 18 · 6:30 AM"));
  test("PM + minute padding", () =>
    expect(formatScheduleStamp(new Date(2026, 11, 25, 18, 5))).toBe("Fri · Dec 25 · 6:05 PM"));
  test("midnight is 12:00 AM", () =>
    expect(formatScheduleStamp(new Date(2026, 0, 1, 0, 0))).toBe("Thu · Jan 1 · 12:00 AM"));
  test("noon is 12:00 PM", () =>
    expect(formatScheduleStamp(new Date(2026, 0, 1, 12, 0))).toBe("Thu · Jan 1 · 12:00 PM"));
});
