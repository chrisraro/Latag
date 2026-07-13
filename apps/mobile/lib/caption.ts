import { formatInches } from "./format";

export type CaptionItem = {
  brand: string; category: string; ptpInches: number; lengthInches: number;
  condition: string; targetSellPrice: number;
};

export function formatCaption(items: CaptionItem[]): string {
  return items
    .map((i) =>
      [
        `👕 ${i.brand} ${i.category}`,
        `📏 Size: (PTP: ${formatInches(i.ptpInches)} | L: ${formatInches(i.lengthInches)})`,
        `✨ Condition: ${i.condition}`,
        `💸 ₱${Math.round(i.targetSellPrice).toLocaleString("en-PH")}`,
        `📍 Comment "Mine" to claim`,
        `---`,
      ].join("\n"),
    )
    .join("\n");
}
