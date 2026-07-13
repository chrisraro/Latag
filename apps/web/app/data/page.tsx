import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Data & Security" };

export default function DataPage() {
  return (
    <Prose title="Data & Security" updated="July 13, 2026">
      <p>
        This page is the plain-language version of our architecture: where your data lives, how it's
        protected, and the promises we build against.
      </p>
      <h2>On your phone (everything that matters)</h2>
      <ul>
        <li>Inventory, sessions, money math, and photos live in a local database and folder on your device.</li>
        <li>They are protected by your phone's built-in device encryption when you use a passcode or biometric lock.</li>
        <li>The app makes zero network calls for inventory features — flip on airplane mode and everything still works. That's not a fallback; it's the design.</li>
      </ul>
      <h2>On our servers (as little as possible)</h2>
      <ul>
        <li>Your email and Pro license status — encrypted in transit with TLS and encrypted at rest by our infrastructure provider. Used only to activate your license.</li>
        <li>A payment reference from our PCI-DSS-compliant payment provider. Card and e-wallet credentials never touch our servers.</li>
        <li>Anonymous counters (items logged, active regions) with an in-app opt-out. No item data, no photos, no names — counts only.</li>
      </ul>
      <h2>Our standing promises</h2>
      <ul>
        <li>Any future feature that would move inventory off your device will be opt-in, end-to-end encrypted, and announced on this page before it ships.</li>
        <li>Account deletion is self-serve and complete.</li>
        <li>We will never sell personal data.</li>
      </ul>
      <h2>Security contact</h2>
      <p>
        Found a vulnerability? Email hello@latag.ph with the details — we read every report and credit
        fixes if you'd like.
      </p>
    </Prose>
  );
}
