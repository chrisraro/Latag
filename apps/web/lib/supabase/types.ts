/**
 * Hand-written row types for the tables the web app actually queries
 * (see supabase/migrations/0001_licensing.sql for the source of truth).
 *
 * This is intentionally NOT a full `supabase gen types` codegen dump — just
 * enough shape to replace the implicit `any` that `createClient()` /
 * `createServerClient()` / `createBrowserClient()` fall back to when no
 * `Database` generic is supplied. Widen this (or switch to generated types)
 * if/when the schema grows past what's hand-maintainable here.
 */

export type LicenseStatus = "active" | "revoked";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type FeedbackType = "feedback" | "suggestion" | "feature_request";
export type FeedbackStatus = "new" | "reviewed" | "done";

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
