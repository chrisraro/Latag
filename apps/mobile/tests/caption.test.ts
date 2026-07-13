import { formatCaption } from "../lib/caption";

test("caption matches blueprint template exactly", () => {
  const out = formatCaption([
    { brand: "Stüssy", category: "Tee", ptpInches: 21, lengthInches: 27, condition: "9/10", targetSellPrice: 550 },
    { brand: "Carhartt", category: "Hoodie", ptpInches: 24, lengthInches: 28.5, condition: "10/10", targetSellPrice: 1250 },
  ]);
  expect(out).toBe(
    `👕 Stüssy Tee\n📏 Size: (PTP: 21" | L: 27")\n✨ Condition: 9/10\n💸 ₱550\n📍 Comment "Mine" to claim\n---\n` +
    `👕 Carhartt Hoodie\n📏 Size: (PTP: 24" | L: 28.5")\n✨ Condition: 10/10\n💸 ₱1,250\n📍 Comment "Mine" to claim\n---`
  );
});
test("empty selection → empty string", () => expect(formatCaption([])).toBe(""));
