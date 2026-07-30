/**
 * Renders a JSON-LD `<script>` tag per the Next.js App Router guide
 * (node_modules/next/dist/docs/01-app/02-guides/json-ld.md): a plain
 * `<script type="application/ld+json">` — not `next/script`, since this is
 * data, not executable code — serialised with `JSON.stringify` and with `<`
 * escaped to `<` so a value containing `</script>` cannot break out of
 * the tag or inject markup.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
