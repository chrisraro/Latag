import { createHmac, timingSafeEqual } from "node:crypto";

const VERSION = "latag1";

export type ReceiptClaims = { userId: string; sku: string; grantedAt: string };

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${VERSION}.${payload}`).digest("base64url");
}

/** Deep module: the receipt format (version.payload.signature) is the whole contract. */
export function issueReceipt(claims: ReceiptClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${VERSION}.${payload}.${sign(payload, secret)}`;
}

export function verifyReceipt(receipt: string, secret: string): ({ valid: true } & ReceiptClaims) | { valid: false } {
  const parts = receipt.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return { valid: false };
  const [, payload, sig] = parts;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false };
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims.userId !== "string" || typeof claims.sku !== "string" || typeof claims.grantedAt !== "string") return { valid: false };
    return { valid: true, userId: claims.userId, sku: claims.sku, grantedAt: claims.grantedAt };
  } catch {
    return { valid: false };
  }
}
