import { formatInches } from "./format";

export type Department = "tops" | "bottoms" | "dresses" | "footwear" | "bags" | "accessories";

export type SpecKey =
  | "ptpInches"
  | "lengthInches"
  | "sleeveInches"
  | "waistInches"
  | "inseamInches"
  | "riseInches"
  | "legOpeningInches"
  | "shoeSizeUs"
  | "insoleCm"
  | "widthInches"
  | "heightInches"
  | "depthInches"
  | "strapDropInches";

export type SpecField = {
  key: SpecKey;
  label: string;
  short: string;
  unit: "in" | "cm" | "US";
  wheel: { min: number; max: number; step: number };
  extra: boolean;
  /** Untouched-wheel rest value. Falls back to the wheel's midpoint when omitted. */
  default?: number;
};

/**
 * Structural shape for the catalog-facing subset of an item — mirrors
 * `Pick<Item, "department" | SpecKey | "sizeNote">` from the E1 schema (Task 2),
 * defined locally since those columns don't exist on `Item` yet.
 */
export type CatalogItem = { department: Department; sizeNote: string | null } & Record<SpecKey, number | null>;

export const DEPARTMENTS: { key: Department; label: string }[] = [
  { key: "tops", label: "Tops" },
  { key: "bottoms", label: "Bottoms" },
  { key: "dresses", label: "Dresses" },
  { key: "footwear", label: "Footwear" },
  { key: "bags", label: "Bags" },
  { key: "accessories", label: "Accessories" },
];

// Reusable spec-field templates (key spec/extra flag applied per department below).
const PTP: Omit<SpecField, "extra"> = { key: "ptpInches", label: "Pit-to-pit", short: "PTP", unit: "in", wheel: { min: 14, max: 36, step: 0.5 }, default: 21 };
const LENGTH_TOP: Omit<SpecField, "extra"> = { key: "lengthInches", label: "Length", short: "L", unit: "in", wheel: { min: 20, max: 36, step: 0.5 }, default: 27 };
const LENGTH_DRESS: Omit<SpecField, "extra"> = { key: "lengthInches", label: "Length", short: "L", unit: "in", wheel: { min: 30, max: 60, step: 0.5 }, default: 38 };
const SLEEVE: Omit<SpecField, "extra"> = { key: "sleeveInches", label: "Sleeve", short: "SL", unit: "in", wheel: { min: 5, max: 30, step: 0.5 } };
const WAIST: Omit<SpecField, "extra"> = { key: "waistInches", label: "Waist", short: "W", unit: "in", wheel: { min: 24, max: 46, step: 1 } };
const INSEAM: Omit<SpecField, "extra"> = { key: "inseamInches", label: "Inseam", short: "INS", unit: "in", wheel: { min: 24, max: 36, step: 0.5 } };
const RISE: Omit<SpecField, "extra"> = { key: "riseInches", label: "Rise", short: "RISE", unit: "in", wheel: { min: 8, max: 16, step: 0.5 } };
const LEG_OPENING: Omit<SpecField, "extra"> = { key: "legOpeningInches", label: "Leg opening", short: "LEG", unit: "in", wheel: { min: 5, max: 12, step: 0.5 } };
const SHOE_SIZE: Omit<SpecField, "extra"> = { key: "shoeSizeUs", label: "US size", short: "US", unit: "US", wheel: { min: 4, max: 14, step: 0.5 } };
const INSOLE: Omit<SpecField, "extra"> = { key: "insoleCm", label: "Insole", short: "CM", unit: "cm", wheel: { min: 20, max: 32, step: 0.5 } };
const WIDTH: Omit<SpecField, "extra"> = { key: "widthInches", label: "Width", short: "W", unit: "in", wheel: { min: 6, max: 30, step: 0.5 } };
const HEIGHT: Omit<SpecField, "extra"> = { key: "heightInches", label: "Height", short: "H", unit: "in", wheel: { min: 6, max: 24, step: 0.5 } };
const DEPTH: Omit<SpecField, "extra"> = { key: "depthInches", label: "Depth", short: "D", unit: "in", wheel: { min: 2, max: 12, step: 0.5 } };
const STRAP_DROP: Omit<SpecField, "extra"> = { key: "strapDropInches", label: "Strap drop", short: "DROP", unit: "in", wheel: { min: 5, max: 30, step: 0.5 } };

const CATALOG: Record<Department, { label: string; types: string[]; specs: SpecField[] }> = {
  tops: {
    label: "Tops",
    types: ["Tee", "Polo", "Longsleeve", "Jersey", "Crewneck", "Sweater", "Hoodie", "Jacket"],
    specs: [
      { ...PTP, extra: false },
      { ...LENGTH_TOP, extra: false },
      { ...SLEEVE, extra: true },
    ],
  },
  bottoms: {
    label: "Bottoms",
    types: ["Jeans", "Trousers", "Cargo", "Shorts", "Skirt"],
    specs: [
      { ...WAIST, extra: false },
      { ...INSEAM, extra: false },
      { ...RISE, extra: true },
      { ...LEG_OPENING, extra: true },
    ],
  },
  dresses: {
    label: "Dresses",
    types: ["Dress", "Jumpsuit"],
    specs: [
      { ...PTP, extra: false },
      { ...LENGTH_DRESS, extra: false },
      { ...WAIST, extra: true },
    ],
  },
  footwear: {
    label: "Footwear",
    types: ["Sneakers", "Boots", "Sandals", "Leather"],
    specs: [
      { ...SHOE_SIZE, extra: false },
      { ...INSOLE, extra: false },
    ],
  },
  bags: {
    label: "Bags",
    types: ["Backpack", "Shoulder", "Tote", "Sling", "Duffel"],
    specs: [
      { ...WIDTH, extra: false },
      { ...HEIGHT, extra: false },
      { ...DEPTH, extra: true },
      { ...STRAP_DROP, extra: true },
    ],
  },
  accessories: {
    label: "Accessories",
    types: ["Cap", "Belt", "Scarf", "Beanie", "Watch", "Eyewear"],
    specs: [],
  },
};

export function typesFor(d: Department): string[] {
  return CATALOG[d].types;
}

export function specFieldsFor(d: Department): SpecField[] {
  return CATALOG[d].specs;
}

/** Plain-number rendering for non-inch units (US size, cm) — no trailing quote. */
function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function captionSpecLine(item: CatalogItem): string {
  switch (item.department) {
    case "tops":
    case "dresses": {
      const parts: string[] = [];
      if (item.ptpInches != null) parts.push(`PTP ${formatInches(item.ptpInches)}`);
      if (item.lengthInches != null) parts.push(`L ${formatInches(item.lengthInches)}`);
      return parts.join(" · ");
    }
    case "bottoms": {
      const parts: string[] = [];
      if (item.waistInches != null) parts.push(`W ${formatInches(item.waistInches)}`);
      if (item.inseamInches != null) parts.push(`INS ${formatInches(item.inseamInches)}`);
      if (item.riseInches != null) parts.push(`RISE ${formatInches(item.riseInches)}`);
      return parts.join(" · ");
    }
    case "footwear": {
      const parts: string[] = [];
      if (item.shoeSizeUs != null) parts.push(`US ${formatNum(item.shoeSizeUs)}`);
      if (item.insoleCm != null) parts.push(`${formatNum(item.insoleCm)} cm`);
      return parts.join(" · ");
    }
    case "bags": {
      const parts: string[] = [];
      if (item.widthInches != null) parts.push(`W ${formatInches(item.widthInches)}`);
      if (item.heightInches != null) parts.push(`H ${formatInches(item.heightInches)}`);
      if (item.depthInches != null) parts.push(`D ${formatInches(item.depthInches)}`);
      if (item.strapDropInches != null) parts.push(`DROP ${formatInches(item.strapDropInches)}`);
      return parts.join(" · ");
    }
    case "accessories":
      return item.sizeNote?.trim() ? item.sizeNote : "One size";
    default:
      return "";
  }
}

function formatSpecValue(field: SpecField, value: number): string {
  if (field.unit === "in") return formatInches(value);
  if (field.unit === "cm") return `${formatNum(value)} cm`;
  return formatNum(value); // "US"
}

export function specRowsFor(item: CatalogItem): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = [];
  for (const field of specFieldsFor(item.department)) {
    const value = item[field.key];
    if (value === null || value === undefined) continue;
    rows.push({ k: field.label, v: formatSpecValue(field, value) });
  }
  if (item.sizeNote?.trim()) rows.push({ k: "Size", v: item.sizeNote });
  return rows;
}
