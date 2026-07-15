import { formatPeso, formatInches, formatPct, formatPesoParts } from "../lib/format";

test.each([[0, "₱0"], [350, "₱350"], [1250, "₱1,250"], [12700, "₱12,700"], [-120, "-₱120"], [749.6, "₱750"]])(
  "formatPeso(%p) → %p", (n, out) => expect(formatPeso(n)).toBe(out));
test("formatPesoParts splits symbol and grouped amount", () =>
  expect(formatPesoParts(12700)).toEqual({ symbol: "₱", amount: "12,700" }));
test("formatPesoParts zero", () => expect(formatPesoParts(0)).toEqual({ symbol: "₱", amount: "0" }));
test.each([[21, '21"'], [21.5, '21.5"'], [27.0, '27"']])("formatInches(%p) → %p", (n, out) => expect(formatInches(n)).toBe(out));
test.each([[38.2, "38%"], [126.7, "127%"], [0, "0%"]])("formatPct(%p) → %p", (n, out) => expect(formatPct(n)).toBe(out));
