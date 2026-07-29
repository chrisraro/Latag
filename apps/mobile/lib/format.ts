/**
 * Re-export everything from the shared @latag/format package.
 *
 * This file exists so existing imports like
 *   `import { formatInches } from "./format"`
 * continue to work without changing every consumer.
 */
export {
  formatInches,
  formatPeso,
  formatPesoParts,
  formatPct,
  formatCountdown,
} from "@latag/format";
