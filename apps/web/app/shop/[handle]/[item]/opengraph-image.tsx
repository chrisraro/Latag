import { ImageResponse } from "next/og";
import { formatPeso, itemTitle } from "../../../../lib/shop-format";
import { getShop, getShopItem } from "../../../../lib/shop-queries";
import { BODY_FAMILY, DISPLAY_FAMILY, archivoFonts } from "../../og-fonts";

/**
 * Shared-link preview for one listing — the image a buyer actually sees when a
 * seller drops the link in a group chat, so it carries the photo.
 *
 * The photo is fetched and inlined as a data URI rather than handed to the
 * renderer as a URL: that way a dead or slow object fails here, in a catch,
 * and the card degrades to the typographic layout instead of streaming a
 * broken response to Facebook's crawler.
 */

export const alt = "Latag listing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#000000";
const SURFACE = "#111111";
const INK = "#f2f2f2";
const INK_DIM = "#adadad";
const INK_FAINT = "#8a8a8a";
const ACID = "#b8f135";
const HAIRLINE = "#262626";

const MAX_PHOTO_BYTES = 4_000_000;

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

async function inlinePhoto(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_PHOTO_BYTES) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string; item: string }>;
}) {
  const { handle, item: code } = await params;
  const shop = await getShop(handle);
  const item = shop ? await getShopItem(shop.id, code) : null;
  const photo = await inlinePhoto(item?.photo_urls?.[0]);

  const title = item ? itemTitle(item) : "Latag";
  const price = item ? formatPeso(item.price) : "";
  const shopHandle = shop?.handle ?? handle;
  const fonts = await archivoFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: BG,
          fontFamily: BODY_FAMILY,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            width={500}
            height={630}
            style={{ width: 500, height: 630, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 500,
              height: 630,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: SURFACE,
              color: INK_FAINT,
              fontSize: 28,
            }}
          >
            {item?.code ?? "Latag"}
          </div>
        )}

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 56,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 24, color: INK_FAINT, letterSpacing: 4 }}>
              {item?.code ?? ""}
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: title.length > 26 ? 46 : 58,
                lineHeight: 1.06,
                color: INK,
                fontFamily: DISPLAY_FAMILY,
                textTransform: "uppercase",
              }}
            >
              {clamp(title, 52)}
            </div>
            {item ? (
              <div style={{ marginTop: 18, fontSize: 30, color: INK_DIM }}>
                {`${item.condition} · ${item.status === "sold" ? "Sold" : "Available"}`}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 72, color: ACID, fontFamily: DISPLAY_FAMILY }}>{price}</div>
            <div
              style={{
                marginTop: 24,
                paddingTop: 22,
                borderTop: `1px solid ${HAIRLINE}`,
                fontSize: 24,
                color: INK_FAINT,
              }}
            >
              {`latag.vercel.app/shop/${shopHandle}`}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
