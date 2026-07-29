import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";
import { signOut } from "./actions";
import { FeedbackForm } from "./FeedbackForm";
import { DeleteAccountForm } from "./DeleteAccountForm";
import { PRO_SKUS } from "@latag/licensing";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

function formatGrantedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

export default async function AccountPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/account/sign-in");
  }

  const [{ data: license }, { data: pricing }, { data: feedbackRows }] = await Promise.all([
    supabase
      .from("licenses")
      .select("sku,status,granted_at,expires_at")
      .in("sku", PRO_SKUS)
      .in("status", ["active", "past_due"])
      .maybeSingle(),
    supabase.from("pricing").select("price,currency").in("sku", PRO_SKUS).limit(1).maybeSingle(),
    supabase
      .from("feedback")
      .select("id,type,status,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="display-black text-3xl uppercase text-ink">Your account</h1>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-hairline bg-surface1 p-6">
        <p className="text-ink">{user.email}</p>
        <form action={signOut}>
          <button
            type="submit"
            className="display inline-flex h-12 items-center justify-center rounded-full border border-hairline bg-surface2 px-6 text-[14px] uppercase tracking-wide text-ink transition-transform focus-visible:outline-2 focus-visible:outline-acid active:scale-[0.98]"
          >
            Sign out
          </button>
        </form>
      </div>

      <section
        aria-labelledby="license-heading"
        className={`mt-6 rounded-2xl border p-6 ${license ? "border-acid bg-surface1" : "border-hairline bg-surface1"}`}
      >
        <h2 id="license-heading" className="display text-xl text-ink">
          License
        </h2>
        {license ? (
          <>
            <div className="mt-3">
              <Badge>PRO — Active</Badge>
            </div>
            <p className="tnum mt-3 text-sm text-inkdim">Subscribed {formatGrantedDate(license.granted_at)}</p>
            {license.expires_at ? (
              <p className="tnum mt-1 text-sm text-inkfaint">
                Current period ends{" "}
                {new Date(license.expires_at).toLocaleDateString("en-PH", {
                  month: "long", day: "numeric", year: "numeric",
                })}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="mt-3">
              <Badge>Free — unlimited inventory</Badge>
            </div>
            {pricing ? (
              <p className="tnum mt-3 text-lg text-ink">Pro: ₱{pricing.price.toLocaleString("en-PH")}/month</p>
            ) : null}
            <p className="mt-3 text-sm text-inkfaint">
              First 14 days free. Subscribe inside the app — no web payment, no paperwork.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="feedback-heading" className="mt-6 rounded-2xl border border-hairline bg-surface1 p-6">
        <h2 id="feedback-heading" className="display text-xl text-ink">
          Feedback
        </h2>
        <p className="mt-2 text-sm text-inkdim">Bugs, ideas, gripes — we read all of it.</p>
        <div className="mt-5">
          <FeedbackForm />
        </div>
        {feedbackRows && feedbackRows.length > 0 ? (
          <ul className="mt-6 flex flex-col gap-3 border-t border-hairline pt-5">
            {feedbackRows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4 text-sm text-inkdim">
                <span className="capitalize">{row.type.replace("_", " ")}</span>
                <Badge>{row.status}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="danger-heading" className="mt-6 rounded-2xl border border-hairline bg-surface1 p-6">
        <h2 id="danger-heading" className="display text-xl text-ink">
          Danger zone
        </h2>
        <p className="mt-2 text-sm text-inkdim">Deleting your account removes it permanently — this can&rsquo;t be undone.</p>
        <div className="mt-5">
          <DeleteAccountForm />
        </div>
      </section>
    </div>
  );
}
