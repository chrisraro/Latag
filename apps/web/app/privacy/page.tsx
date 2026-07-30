import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Privacy Policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy Policy" updated="July 30, 2026">
      <p>
        Latag is built so that we know as little about you as possible. This policy explains what little
        we collect, why, and what we never collect. The short version: nothing leaves your phone unless
        you publish it, and you choose exactly what, one item at a time.
      </p>
      <h2>What never leaves your phone</h2>
      <p>
        Your inventory — items, batches, costs, profits, and every photo you take — is stored in a database
        on your device. By default, none of it is uploaded, synced, or backed up to our servers. We cannot
        see it, sell it, or hand it to anyone, because we do not have it. This stays true permanently for
        anything you haven't published: unpublished items, costs, profit margins, supplier locations, and
        sourcing-batch data never reach our servers, no matter how long you use the app.
      </p>
      <h2>What happens when you publish an item</h2>
      <p>
        Publishing is opt-in, per item — nothing goes online until you tap "Publish" on that specific piece.
        When you do, Latag uploads only the buyer-relevant fields: brand, name, department, category,
        condition, measurements, price, availability (available or sold), the item's public code, its
        position in your shop's display order, an internal reference id, and the item's photos. It never
        uploads cost, profit, supplier location, or batch data — those fields don't exist on the server at
        all; there is no column for them in our database, so there's nothing to leak by mistake.
      </p>
      <p>
        Published items are stored with Supabase, our backend provider, with photos served through
        Supabase's storage CDN — we haven't pinned or verified that to a specific region, so don't take a
        Philippines location as a promise. Unpublish an item (or delete it) and Latag deletes its row and
        photos from our servers, not just hides them. That delete is attempted automatically up to 5 times
        total if it can't go through right away (you're offline, for instance); if every attempt fails,
        the Shop tab flags the item as stuck, and toggling Publish off then on queues a fresh attempt.
      </p>
      <h2>What we collect, and why</h2>
      <ul>
        <li><strong>Account details</strong> (email address) — only if you create an account to activate a Pro license. Used solely to issue and verify that license. Encrypted in transit (TLS) and at rest.</li>
        <li><strong>Payment records</strong> — Pro is billed and processed by the App Store or Play Store, not by us. We store only a reference ID, the amount, and its status from that transaction. Your card number or e-wallet credentials go to Apple or Google — they never reach our servers.</li>
      </ul>
      <h2>What we don't do</h2>
      <ul>
        <li>No ads, no trackers, no analytics SDKs in the app.</li>
        <li>No selling or sharing of personal data with third parties.</li>
        <li>No reading your unpublished inventory — technically impossible by design, since it never reaches our servers.</li>
      </ul>
      <h2>Deleting your data</h2>
      <p>
        Deleting the app deletes your inventory, because your phone was the only place it existed. This does
        not automatically remove a published shop or its items — unpublish or delete them from the app (or
        contact us) before uninstalling if you want your storefront taken down too. Your account (if you made
        one) can be deleted from the web portal at any time; this removes your email, license record, any
        feedback you sent us, and — because your shop is tied to your account — your shop and its listings.
        That step doesn't reach into photo storage, so email us if you want any leftover photos cleared by
        hand. Payment references are retained only as long as financial regulations require.
      </p>
      <h2>Contact</h2>
      <p>Questions about this policy: hello@latag.ph.</p>
    </Prose>
  );
}
