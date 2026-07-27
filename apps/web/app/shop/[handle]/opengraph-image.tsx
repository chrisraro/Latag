import { ImageResponse } from "next/og";
import { getShopWithItems } from "../../../lib/shop-queries";
import { BODY_FAMILY, DISPLAY_FAMILY, archivoFonts } from "../og-fonts";

/**
 * Shared-link preview for a storefront. Kept purely typographic — no remote
 * photo fetches — so a slow or missing image can never turn a shared link into
 * a broken preview in Messenger.
 */

export const alt = "Latag storefront";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#000000";
const INK = "#f2f2f2";
const INK_DIM = "#adadad";
const INK_FAINT = "#8a8a8a";
const ACID = "#b8f135";
const HAIRLINE = "#262626";

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const data = await getShopWithItems(handle);
  const displayName = data ? data.shop.display_name : "Latag";
  const bio = data?.shop.bio?.trim() ?? "";
  const available = data ? data.items.filter((i) => i.status === "available").length : 0;
  const shopHandle = data?.shop.handle ?? handle;
  const fonts = await archivoFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: BG,
          padding: 72,
          fontFamily: BODY_FAMILY,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 18, height: 18, backgroundColor: ACID }} />
          <div style={{ fontSize: 24, color: ACID, letterSpacing: 4, fontFamily: DISPLAY_FAMILY }}>
            LATAG
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: displayName.length > 22 ? 68 : 88,
              lineHeight: 1.04,
              color: INK,
              fontFamily: DISPLAY_FAMILY,
              textTransform: "uppercase",
            }}
          >
            {clamp(displayName, 44)}
          </div>
          {bio ? (
            <div style={{ marginTop: 22, fontSize: 30, color: INK_DIM, lineHeight: 1.35 }}>
              {clamp(bio, 96)}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${HAIRLINE}`,
            paddingTop: 28,
          }}
        >
          <div style={{ fontSize: 28, color: ACID }}>
            {`${available} ${available === 1 ? "piece" : "pieces"} available`}
          </div>
          <div style={{ fontSize: 26, color: INK_FAINT }}>{`latag.vercel.app/shop/${shopHandle}`}</div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
