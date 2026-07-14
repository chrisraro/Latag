import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin-gate";
import { Badge, SectionTitle } from "@/components/ui";
import { GrantRevokeForm } from "./GrantRevokeForm";
import { PriceRow } from "./PriceRow";
import { FeedbackRow } from "./FeedbackRow";
import { FlagRow } from "./FlagRow";
import { AddFlagForm } from "./AddFlagForm";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const PRO_SKU = "latag-pro-lifetime";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * `/admin` is invisible, not gated: an unauthorized visitor gets a plain
 * 404 (via `notFound()`), never a login prompt or "access denied" page that
 * would confirm the route exists. Every mutation is re-verified inside its
 * own server action (see ./actions.ts) — this page-level check only decides
 * whether the console renders, and must never be treated as the sole guard.
 */
export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email, process.env.ADMIN_EMAILS)) {
    notFound();
  }

  const admin = createAdminSupabase();

  const [usersResult, licensesResult, pricingResult, feedbackResult, flagsResult] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 50 }),
    admin.from("licenses").select("*"),
    admin.from("pricing").select("*"),
    admin.from("feedback").select("*").order("created_at", { ascending: false }).limit(100),
    admin.from("feature_flags").select("*"),
  ]);

  const users = usersResult.data.users;
  const licenses = licensesResult.data ?? [];
  const pricing = pricingResult.data ?? [];
  const feedback = feedbackResult.data ?? [];
  const flags = flagsResult.data ?? [];

  const activeProUserIds = new Set(
    licenses.filter((license) => license.sku === PRO_SKU && license.status === "active").map((license) => license.user_id)
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <h1 className="display-black text-3xl uppercase text-ink">Admin</h1>

      <section aria-labelledby="users-heading" className="mt-10">
        <SectionTitle id="users-heading">Users</SectionTitle>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-hairline bg-surface1">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-inkfaint">
                <th className="px-5 py-4 font-normal">Email</th>
                <th className="px-5 py-4 font-normal">Created</th>
                <th className="px-5 py-4 font-normal">License</th>
                <th className="px-5 py-4 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isPro = activeProUserIds.has(u.id);
                return (
                  <tr key={u.id} className="border-b border-hairline last:border-0">
                    <td className="px-5 py-4 text-ink">{u.email ?? "—"}</td>
                    <td className="tnum px-5 py-4 text-inkdim">{formatDate(u.created_at)}</td>
                    <td className="px-5 py-4">
                      {isPro ? <Badge>PRO</Badge> : <span className="text-inkfaint">Free</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <GrantRevokeForm userId={u.id} isPro={isPro} />
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-inkfaint">
                    No users yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="pricing-heading" className="mt-10">
        <SectionTitle id="pricing-heading">Pricing</SectionTitle>
        <div className="mt-5 flex flex-col gap-3">
          {pricing.map((row) => (
            <PriceRow key={row.sku} sku={row.sku} price={row.price} currency={row.currency} />
          ))}
          {pricing.length === 0 ? <p className="text-sm text-inkfaint">No pricing rows.</p> : null}
        </div>
      </section>

      <section aria-labelledby="feedback-heading" className="mt-10">
        <SectionTitle id="feedback-heading">Feedback inbox</SectionTitle>
        <ul className="mt-5 flex flex-col gap-3">
          {feedback.map((row) => (
            <FeedbackRow key={row.id} id={row.id} type={row.type} status={row.status} body={row.body} createdAt={row.created_at} />
          ))}
          {feedback.length === 0 ? <p className="text-sm text-inkfaint">No feedback yet.</p> : null}
        </ul>
      </section>

      <section aria-labelledby="flags-heading" className="mt-10">
        <SectionTitle id="flags-heading">Feature flags</SectionTitle>
        <div className="mt-5 flex flex-col gap-3">
          {flags.map((flag) => (
            <FlagRow key={flag.key} flagKey={flag.key} enabled={flag.enabled} notes={flag.notes} />
          ))}
          {flags.length === 0 ? <p className="text-sm text-inkfaint">No flags yet.</p> : null}
        </div>
        <div className="mt-5 rounded-xl border border-hairline bg-surface1 p-4">
          <AddFlagForm />
        </div>
      </section>
    </div>
  );
}
