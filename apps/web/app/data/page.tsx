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
      <h2>On your phone (everything that matters, always)</h2>
      <ul>
        <li>Inventory, sourcing batches, money math, and photos live in a local database and folder on your device.</li>
        <li>They are protected by your phone's built-in device encryption when you use a passcode or biometric lock.</li>
        <li>The app makes zero network calls for inventory features — flip on airplane mode and everything still works. That's not a fallback; it's the design.</li>
        <li>Cost, profit, margins, supplier locations, and batch data never have a path off the device — there is nowhere on our servers for them to go, published or not.</li>
      </ul>
      <h2>What goes to the shop when you publish</h2>
      <p>
        Publishing is opt-in, per item. Only when you publish a specific piece does anything about it leave
        your phone, and only these fields go up: brand, name, category, condition, measurements, price, and
        photos.
      </p>
      <ul>
        <li><strong>Uploaded on publish:</strong> brand, name, category, condition, measurements, price, photos.</li>
        <li><strong>Never uploaded, at any point:</strong> cost, profit, supplier location, batch data, and every item you haven't published.</li>
        <li><strong>Where it lives:</strong> Supabase (Postgres + storage), with photos served from a Philippines-region CDN.</li>
        <li><strong>Removing it:</strong> unpublishing or deleting a shop item deletes its row and photos from our servers — not a soft-hide.</li>
      </ul>
      <h2>On our servers (as little as possible)</h2>
      <ul>
        <li>Your email and Pro license status — encrypted in transit with TLS and encrypted at rest by our infrastructure provider. Used only to activate your license.</li>
        <li>A payment reference from our PCI-DSS-compliant payment provider. Card and e-wallet credentials never touch our servers.</li>
        <li>Anonymous counters (items logged, active regions) with an in-app opt-out. No item data, no photos, no names — counts only.</li>
        <li>Published shop items, exactly as described above — nothing more.</li>
      </ul>
      <h2>Our standing promises</h2>
      <ul>
        <li>Any future feature that would move inventory off your device beyond what's described here will be opt-in, end-to-end encrypted, and announced on this page before it ships.</li>
        <li>Published items will never carry cost, profit, or supplier data — enforced structurally: our database has no column for them, so there's nothing to leak by mistake.</li>
        <li>Account deletion is self-serve and removes your account data; payment references persist only as long as financial regulations require.</li>
        <li>We will never sell or share personal data.</li>
      </ul>
      <h2>Security contact</h2>
      <p>
        If you find a vulnerability, email hello@latag.ph with the details — we read every report and
        credit fixes if you'd like.
      </p>
    </Prose>
  );
}
