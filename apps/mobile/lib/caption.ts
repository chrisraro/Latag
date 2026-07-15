import { formatInches } from "./format";

export type CaptionItem = {
  brand: string; category: string; ptpInches: number | null; lengthInches: number | null;
  condition: string; targetSellPrice: number;
};

export function formatCaption(items: CaptionItem[]): string {
  return items
    .map((i) => {
      const size = [
        i.ptpInches != null ? `PTP: ${formatInches(i.ptpInches)}` : null,
        i.lengthInches != null ? `L: ${formatInches(i.lengthInches)}` : null,
      ].filter((p): p is string => p != null).join(" | ");
      return [
        `👕 ${i.brand} ${i.category}`,
        ...(size ? [`📏 Size: (${size})`] : []),
        `✨ Condition: ${i.condition}`,
        `💸 ₱${Math.round(i.targetSellPrice).toLocaleString("en-PH")}`,
        `📍 Comment "Mine" to claim`,
        `---`,
      ].join("\n");
    })
    .join("\n");
}
