/**
 * Re-export everything from the shared @latag/catalog package.
 *
 * This file exists so existing imports like
 *   `import { DEPARTMENTS } from "../../lib/catalog"`
 * continue to work without changing every consumer.
 *
 * If you need to add mobile-only catalog helpers, put them HERE (below the
 * re-exports), not in the shared package.
 */
export {
  DEPARTMENTS,
  SPEC_LABEL_TO_KEY,
  parseSpecValue,
  typesFor,
  specFieldsFor,
  captionSpecLine,
  specRowsFor,
  type CatalogItem,
  type Department,
  type SpecField,
  type SpecKey,
} from "@latag/catalog";
