import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <Prose title="Terms of Use" updated="July 30, 2026">
      <p>These terms keep things fair and short. By using Latag you agree to them.</p>
      <h2>The app</h2>
      <p>
        Latag is an offline inventory and pricing tool for clothing resellers. Logging items is free and
        unlimited. Latag Pro is a recurring subscription — ₱199/month or ₱1,799/year, with a 14-day free
        trial — that unlocks your public storefront, activated by signing in once inside the app. A small
        number of accounts hold a legacy lifetime grant issued before the subscription model existed; that
        grant is not for sale and keeps working, but it is not a plan you can buy today.
      </p>
      <h2>Your data, your responsibility</h2>
      <p>
        Because your inventory lives only on your device, you are responsible for your device. If your phone
        is lost, broken, or the app is uninstalled, your inventory cannot be recovered by us — we never had a
        copy. Your Pro license, however, is tied to your account and survives: sign in on a new device to
        restore it.
      </p>
      <h2>Publishing to your shop</h2>
      <p>
        Pro unlocks a public storefront. Publishing an item is your choice, made one item at a time, and you
        are responsible for what you publish — the accuracy of prices, condition, descriptions, and photos,
        and your right to sell what's listed. We can take down a listing or a shop that violates these terms
        or the law; see our <Link href="/privacy" className="underline">Privacy Policy</Link> for exactly what
        publishing uploads and how to remove it.
      </p>
      <h2>Subscription, auto-renewal and cancellation</h2>
      <p>
        Pro is billed and processed by the App Store or Play Store, not by us. Your first 14 days are free;
        unless you cancel before the trial ends, the subscription auto-renews at ₱199/month or ₱1,799/year
        and your payment method is charged by Apple or Google at the start of each new period. Subscriptions
        renew automatically until cancelled. To cancel, use your Apple ID or Google Play subscription
        settings — we have no ability to cancel a subscription on your behalf, and cancelling stops future
        renewals but does not end your current paid period early.
      </p>
      <h2>Refunds</h2>
      <p>
        Because Apple and Google process the payment, they also handle refunds — request one through the
        App Store or Play Store, not from us. If Pro fails to activate on your device after a successful
        purchase and we cannot fix it within a reasonable time, contact hello@latag.ph and we will help you
        get a refund through the store or make it right another way.
      </p>
      <h2>Fair use</h2>
      <ul>
        <li>Don't attempt to circumvent Pro license activation, or resell license activations.</li>
        <li>Don't use Latag for anything unlawful.</li>
      </ul>
      <h2>Warranty and liability</h2>
      <p>
        Latag is provided as-is. We work hard to make it reliable, but we are not liable for lost profits,
        lost inventory data, or decisions made from the numbers it shows. Nothing in these terms limits
        rights you have under Philippine consumer law that cannot be waived.
      </p>
      <h2>Changes</h2>
      <p>
        If these terms change materially, the app and this site will say so before the change applies to you.
      </p>
    </Prose>
  );
}
