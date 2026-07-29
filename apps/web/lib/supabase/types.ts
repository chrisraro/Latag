/**
 * Hand-written row types for the tables the web app actually queries
 * (see supabase/migrations/0001_licensing.sql for the source of truth).
 *
 * This is intentionally NOT a full `supabase gen types` codegen dump — just
 * enough shape to replace the implicit `any` that `createClient()` /
 * `createServerClient()` / `createBrowserClient()` fall back to when no
 * `Database` generic is supplied. Widen this (or switch to generated types)
 * if/when the schema grows past what's hand-maintainable here.
 *
 * Row shapes must be `type` aliases, never `interface`: supabase-js constrains
 * them to `Record<string, unknown>`, which an interface does not satisfy (no
 * implicit index signature), and the failure mode is silent — every query in
 * the app degrades to `never` rather than pointing at this file.
 */

export type LicenseStatus = "active" | "revoked" | "expired" | "past_due";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type FeedbackType = "feedback" | "suggestion" | "feature_request";
export type FeedbackStatus = "new" | "reviewed" | "done";
export type ShopItemStatus = "available" | "sold";

/** One ordered measurement pair, e.g. `{ k: "Waist", v: "32\"" }`. */
export type ShopItemSpec = { k: string; v: string };

/**
 * `public.shops` — see supabase/migrations/0003_storefront.sql.
 *
 * This is the OWNER's view of the row. The `anon` role can only select the
 * subset granted by 0005_shop_public_columns.sql — notably NOT `user_id` — so
 * anything reading with the anon key must select from `SHOP_HEADER_COLUMNS` /
 * `SHOP_SITEMAP_COLUMNS` in `lib/shop-columns.ts`, never `*`.
 */
export type ShopRow = {
  id: string;
  user_id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  contact_messenger: string | null;
  contact_instagram: string | null;
  contact_email: string | null;
  show_sold: boolean;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

/** `public.shop_items` — buyer-relevant columns only, by design. */
export type ShopItemRow = {
  id: string;
  shop_id: string;
  code: string;
  item_local_id: string;
  brand: string;
  name: string | null;
  department: string;
  category: string;
  condition: string;
  /**
   * Ordered measurement pairs, e.g. `[{ k: "Waist", v: "32\"" }, { k: "Inseam", v: "30\"" }]`.
   * The array order is the seller's intended display order. Some rows may
   * still carry the legacy jsonb-object shape (`{ "Waist": "32\"" }`) from
   * before this column became an ordered array — readers should tolerate
   * both (see `specEntries` in `lib/shop-format.ts`).
   */
  specs: ShopItemSpec[] | Record<string, string>;
  price: number;
  status: ShopItemStatus;
  photo_urls: string[];
  sort_order: number;
  published_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; created_at: string };
        Insert: { id: string; email: string; created_at?: string };
        Update: Partial<{ id: string; email: string; created_at: string }>;
        Relationships: [];
      };
      licenses: {
        Row: {
          id: string;
          user_id: string;
          sku: string;
          status: LicenseStatus;
          granted_at: string;
          expires_at: string | null;
          payment_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          sku: string;
          status?: LicenseStatus;
          granted_at?: string;
          expires_at?: string | null;
          payment_id?: string | null;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          sku: string;
          status: LicenseStatus;
          granted_at: string;
          expires_at: string | null;
          payment_id: string | null;
        }>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          user_id: string | null;
          provider: string;
          provider_ref: string | null;
          amount: number;
          currency: string;
          status: PaymentStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          provider: string;
          provider_ref?: string | null;
          amount: number;
          currency?: string;
          status: PaymentStatus;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string | null;
          provider: string;
          provider_ref: string | null;
          amount: number;
          currency: string;
          status: PaymentStatus;
          created_at: string;
        }>;
        Relationships: [];
      };
      pricing: {
        Row: { sku: string; price: number; currency: string; active: boolean };
        Insert: { sku: string; price: number; currency?: string; active?: boolean };
        Update: Partial<{ sku: string; price: number; currency: string; active: boolean }>;
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          user_id: string | null;
          type: FeedbackType;
          body: string;
          status: FeedbackStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          type: FeedbackType;
          body: string;
          status?: FeedbackStatus;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string | null;
          type: FeedbackType;
          body: string;
          status: FeedbackStatus;
          created_at: string;
        }>;
        Relationships: [];
      };
      feature_flags: {
        Row: { key: string; enabled: boolean; notes: string | null };
        Insert: { key: string; enabled?: boolean; notes?: string | null };
        Update: Partial<{ key: string; enabled: boolean; notes: string | null }>;
        Relationships: [];
      };
      shops: {
        Row: ShopRow;
        Insert: ShopRow;
        Update: Partial<ShopRow>;
        Relationships: [];
      };
      /**
       * Buyer-facing fields only. There is deliberately no cost, profit,
       * location or batch column here (spec §1/§3) — the absence of the column
       * IS the privacy enforcement. Do not widen this type past the migration.
       */
      shop_items: {
        Row: ShopItemRow;
        Insert: ShopItemRow;
        Update: Partial<ShopItemRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
