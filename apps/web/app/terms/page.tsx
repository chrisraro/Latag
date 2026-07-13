import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <Prose title="Terms of Use" updated="July 13, 2026">
      <p>These terms keep things fair and simple. By using Latag you agree to them.</p>
      <h2>The app</h2>
      <p>
        Latag is an offline inventory and pricing tool for clothing resellers. The free tier includes 20
        item logs. Latag Pro is a one-time purchase that unlocks unlimited logs on your account, activated by
        signing in once inside the app.
      </p>
      <h2>Your data, your responsibility</h2>
      <p>
        Because your inventory lives only on your device, you are responsible for your device. If your phone
        is lost, broken, or the app is uninstalled, your inventory cannot be recovered by us — we never had a
        copy. Your Pro license, however, is tied to your account and survives: sign in on a new device to
        restore it.
      </p>
      <h2>Purchases and refunds</h2>
      <p>
        Pro is sold on this website as a one-time payment. If Pro fails to activate on your device and we
        cannot fix it within a reasonable time, we will refund you in full. Refund requests: hello@latag.ph
        within 14 days of purchase.
      </p>
      <h2>Fair use</h2>
      <ul>
        <li>Don't attempt to circumvent the free-tier limit or resell license activations.</li>
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
