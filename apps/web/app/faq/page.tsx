import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { Prose } from "@/components/Prose";
import { FAQ_ENTRIES, faqJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = { title: "FAQ", alternates: { canonical: "/faq" } };

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqJsonLd()} />
      <Prose title="Frequently asked questions" updated="July 30, 2026">
        {FAQ_ENTRIES.map((entry) => (
          <div key={entry.question}>
            <h2>{entry.question}</h2>
            <p>{entry.answer}</p>
          </div>
        ))}
      </Prose>
    </>
  );
}
