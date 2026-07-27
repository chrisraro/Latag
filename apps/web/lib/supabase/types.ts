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

export type LicenseStatus = "active" | "revoked";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type FeedbackType = "feedback" | "suggestion" | "feature_request";
export type FeedbackStatus = "new" | "reviewed" | "done";
export type ShopItemStatus = "available" | "sold";

/** `public.shops` — see supabase/migrations/0003_storefront.sql. */
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
  /** Measurement label → formatted value, e.g. `{ "Pit-to-pit": "21\"" }`. */
  specs: Record<string, string>;
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
          payment_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          sku: string;
          status?: LicenseStatus;
          granted_at?: string;
          payment_id?: string | null;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          sku: string;
          status: LicenseStatus;
          granted_at: string;
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
