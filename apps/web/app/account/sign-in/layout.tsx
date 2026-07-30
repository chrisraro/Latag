import type { Metadata } from "next";

// `page.tsx` in this segment is a Client Component ("use client"), and the
// Metadata API is Server Component only — see generate-metadata.md ("only
// supported in Server Components") — so the canonical/title live here
// instead, in a plain server layout that just passes children through.
export const metadata: Metadata = { title: "Sign in", alternates: { canonical: "/account/sign-in" } };

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
