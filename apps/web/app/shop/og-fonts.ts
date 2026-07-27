import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Archivo for the shared-link cards.
 *
 * `next/font/google` can't help here — its output is a CSS/webfont pipeline for
 * the browser, and satori needs raw font bytes. So the two faces the cards use
 * are vendored under `assets/` (the same files the mobile app ships) and read
 * from disk, per the `opengraph-image` docs.
 *
 * A read failure returns `undefined` rather than throwing: the card then renders
 * in the bundled default face, which is a worse-looking preview but still a
 * working one. A broken preview on a link a seller just posted is not a
 * trade-off worth taking for typography.
 */

export type OgFonts = NonNullable<ConstructorParameters<typeof import("next/og").ImageResponse>[1]>["fonts"];

const DIR = join(process.cwd(), "assets", "fonts");

export async function archivoFonts(): Promise<OgFonts> {
  try {
    const [black, regular] = await Promise.all([
      readFile(join(DIR, "ArchivoExpanded-Black.ttf")),
      readFile(join(DIR, "Archivo-Regular.ttf")),
    ]);
    return [
      { name: "Archivo Expanded", data: black, weight: 900, style: "normal" },
      { name: "Archivo", data: regular, weight: 400, style: "normal" },
    ];
  } catch {
    return undefined;
  }
}

/** Named so a missing font file degrades to the default face, not to nothing. */
export const DISPLAY_FAMILY = "Archivo Expanded";
export const BODY_FAMILY = "Archivo";
