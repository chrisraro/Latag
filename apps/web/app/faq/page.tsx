import type { Metadata } from "next";
import { Fragment } from "react";
import { JsonLd } from "@/components/JsonLd";
import { Prose } from "@/components/Prose";
import { FAQ_ENTRIES, faqJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = { title: "FAQ", alternates: { canonical: "/faq" } };

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqJsonLd()} />
      <Prose title="Frequently asked questions" updated="July 30, 2026">
        {/* Wave 3 whole-wave review, M5: a <div> wrapper here isn't a
            `space-y-5` sibling of Prose's own children — each h2/p pair
            became invisible to the CSS selector, so every answer rendered
            flush against its question. `Fragment` isn't a real element, so
            the h2 and p become direct children of Prose's spaced container
            again. */}
        {FAQ_ENTRIES.map((entry) => (
          <Fragment key={entry.question}>
            <h2>{entry.question}</h2>
            <p>{entry.answer}</p>
          </Fragment>
        ))}
      </Prose>
    </>
  );
}
