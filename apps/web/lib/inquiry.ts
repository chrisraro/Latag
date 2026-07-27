/**
 * Buyer inquiry routing (spec §4).
 *
 * One builder produces the text for every channel so the seller reads the same
 * message whichever button the buyer pressed. Prefill support is NOT uniform and
 * this module encodes the researched difference rather than assuming parity:
 *
 *   Messenger  `https://m.me/{handle}?text=…`  — prefill documented by Meta and
 *              verified through the live redirect chain (Pages and profiles).
 *   Instagram  `https://ig.me/m/{handle}`      — NO prefill. ig.me discards query
 *              params; only `ref` exists and it is bot-webhook-only. The caller
 *              copies the message to the clipboard instead, and falls back to
 *              `instagramWebHref` on desktop where ig.me dead-ends entirely.
 *   Email      `mailto:…?subject=&body=`       — prefill works.
 *
 * The `LT-` code leads the message on purpose: if every prefill path fails, the
 * buyer can type six characters and the seller still knows the exact item.
 */

export const SITE_URL = "https://latag.vercel.app";

/** Sellers type their handle as they say it out loud — "@thriftlord". */
function bareHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "");
}

function pesos(amount: number): string {
  return `₱${Math.round(amount).toLocaleString("en-PH")}`;
}

/** `Brand Name`, or just `Brand` when the item was logged without one. */
function itemTitle(brand: string, name: string | null | undefined): string {
  const n = name?.trim();
  return n ? `${brand} ${n}` : brand;
}

export type InquiryItem = {
  code: string;
  brand: string;
  name: string | null;
  condition: string;
  price: number;
  url: string;
};

/**
 * Exactly three short lines. Length is a feature: long strings risk truncation
 * in the composer and read as spam to the seller.
 *
 *   [LT-7K2Q9] Hi! Is this still available?
 *   Carhartt Detroit Jacket — 9/10 — ₱850
 *   https://latag.vercel.app/shop/{handle}/{item}
 */
export function inquiryMessage(i: InquiryItem): string {
  return [
    `[${i.code}] Hi! Is this still available?`,
    `${itemTitle(i.brand, i.name)} — ${i.condition} — ${pesos(i.price)}`,
    i.url,
  ].join("\n");
}

export function inquirySubject(i: { brand: string; name: string | null; code: string }): string {
  return `Inquiry: ${itemTitle(i.brand, i.name)} (${i.code})`;
}

export function messengerHref(handle: string, message: string): string {
  return `https://m.me/${encodeURIComponent(bareHandle(handle))}?text=${encodeURIComponent(message)}`;
}

/** No `text` parameter — see the module header. The clipboard carries the message. */
export function instagramHref(handle: string): string {
  return `https://ig.me/m/${encodeURIComponent(bareHandle(handle))}`;
}

export function instagramWebHref(handle: string): string {
  return `https://www.instagram.com/${encodeURIComponent(bareHandle(handle))}`;
}

export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function shopUrl(handle: string): string {
  return `${SITE_URL}/shop/${encodeURIComponent(handle)}`;
}

export function itemUrl(handle: string, code: string): string {
  return `${shopUrl(handle)}/${encodeURIComponent(code)}`;
}
