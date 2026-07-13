import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy Policy" updated="July 13, 2026">
      <p>
        Latag is built so that we know as little about you as possible. This policy explains what little
        we collect, why, and what we never collect.
      </p>
      <h2>What never leaves your phone</h2>
      <p>
        Your inventory — sessions, items, prices, costs, profits, and every photo you take — is stored in a
        database on your device. It is never uploaded, synced, or backed up to our servers. We cannot see it,
        sell it, or hand it to anyone, because we do not have it.
      </p>
      <h2>What we collect, and why</h2>
      <ul>
        <li><strong>Account details</strong> (email address) — only if you create an account to activate a Pro license. Used solely for licensing and receipts. Encrypted in transit (TLS) and at rest.</li>
        <li><strong>Payment records</strong> — when you buy Pro, our payment provider processes the payment. We store only a reference ID, the amount, and its status. We never see or store your card number or e-wallet credentials; the provider is PCI-DSS compliant.</li>
        <li><strong>Anonymous usage counters</strong> — total items logged and active regions, as plain counts with no account, item, or photo attached. You can turn this off in the app's settings at any time.</li>
      </ul>
      <h2>What we don't do</h2>
      <ul>
        <li>No ads, no trackers, no analytics SDKs in the app.</li>
        <li>No selling or sharing of personal data with third parties.</li>
        <li>No reading your inventory — technically impossible by design.</li>
      </ul>
      <h2>Deleting your data</h2>
      <p>
        Deleting the app deletes your inventory, because your phone was the only place it existed. Your
        account (if you made one) can be deleted from the web portal at any time; this removes your email,
        license record, and any feedback you sent us. Payment references are retained only as long as
        financial regulations require.
      </p>
      <h2>Contact</h2>
      <p>Questions about this policy: hello@latag.ph.</p>
    </Prose>
  );
}
