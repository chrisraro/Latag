import { captionSpecLine, type CatalogItem, type SpecKey } from "./catalog";

/**
 * Structural subset of an item row needed for the IG drop caption.
 * `department` stays `string` (matching the schema's Item) — narrowing to the
 * Department union happens at the captionSpecLine seam, which renders unknown
 * departments as an empty spec line.
 */
export type CaptionItem = {
  brand: string;
  name: string | null;
  department: string;
  sizeNote: string | null;
  condition: string;
  targetSellPrice: number;
} & Record<SpecKey, number | null>;

export function formatCaption(items: CaptionItem[]): string {
  return items
    .map((i) => {
      const title = i.name ? `${i.brand} · ${i.name}` : i.brand;
      const size = captionSpecLine(i as CatalogItem);
      return [
        `👕 ${title}`,
        ...(size ? [`📏 Size: (${size})`] : []),
        `✨ Condition: ${i.condition}`,
        `💸 ₱${Math.round(i.targetSellPrice).toLocaleString("en-PH")}`,
        `📍 Comment "Mine" to claim`,
        `---`,
      ].join("\n");
    })
    .join("\n");
}
