import { formatCountdown } from "../lib/format";

test.each([
  [45, "0:45"],
  [5, "0:05"],
  [0, "0:00"],
  [90, "1:30"],
])("formatCountdown(%p) → %p", (n, out) => expect(formatCountdown(n)).toBe(out));
