// Colors live in @latag/tokens (packages/tokens/src/index.ts) — the shared
// source of truth for both apps/mobile and apps/web. Re-exported here so
// existing `import { COLORS } from "@/lib/theme"` call sites don't need to
// change.
export { COLORS } from "@latag/tokens";

export const FONT = {
  text: "Archivo", medium: "Archivo-Medium", semibold: "Archivo-SemiBold", bold: "Archivo-Bold",
  display: "ArchivoExpanded-ExtraBold", displayBlack: "ArchivoExpanded-Black",
} as const;

export const CATEGORIES = ["Tee", "Polo", "Longsleeve", "Jacket", "Hoodie", "Sweater", "Jersey", "Crewneck"] as const;
export const CONDITIONS = ["10/10", "9/10", "8/10", "7/10"] as const;
