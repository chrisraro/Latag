/**
 * The columns the storefront reads, as data.
 *
 * These are one half of a contract whose other half is
 * `supabase/migrations/0005_shop_public_columns.sql`: after 0005 the `anon`
 * role holds a COLUMN-level select grant on `public.shops`, so asking for a
 * column that is not in that grant fails the whole request with `permission
 * denied` rather than returning a null. `tests/shop-public-columns.test.ts`
 * reads the migration and proves the two halves still agree.
 *
 * Kept out of `shop-queries.ts` on purpose: that module imports `server-only`,
 * which throws the moment anything outside a server component touches it —
 * including the test runner.
 */

/**
 * `["a", "b"]` -> `"a, b"` at the type level as well as at runtime.
 *
 * The literal return type is not showing off: supabase-js infers a query's row
 * shape by parsing the select string as a literal type, so a plain
 * `string` return would collapse every result in `shop-queries.ts` to
 * `GenericStringError` and force blind casts. This keeps the column tuples as
 * the single source of truth without giving up that inference.
 */
type Join<T extends readonly string[], D extends string> = T extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? Tail extends readonly []
    ? Head
    : `${Head}${D}${Join<Tail, D>}`
  : "";

/** Joins a column tuple into the string PostgREST's `select=` expects. */
export function columnList<T extends readonly string[]>(columns: T): Join<T, ", "> {
  return columns.join(", ") as Join<T, ", ">;
}

/** Shop header for the storefront pages and both OG cards. */
export const SHOP_HEADER_COLUMNS = [
  "id",
  "handle",
  "display_name",
  "bio",
  "contact_messenger",
  "contact_instagram",
  "contact_email",
] as const;

/** Sitemap only needs enough to build a URL and date it. */
export const SHOP_SITEMAP_COLUMNS = ["id", "handle", "updated_at"] as const;

/**
 * `updated_at` is not rendered anywhere — it is the cache key for photo URLs
 * (see `versionedPhotoUrl` in `shop-format.ts`). Dropping it silently returns
 * the storefront to serving stale re-shot photos, so it is load-bearing.
 */
export const SHOP_ITEM_COLUMNS = [
  "code",
  "brand",
  "name",
  "department",
  "category",
  "condition",
  "specs",
  "price",
  "status",
  "photo_urls",
  "updated_at",
] as const;
