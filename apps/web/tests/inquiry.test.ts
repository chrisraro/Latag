import { describe, expect, it } from "vitest";
import {
  SITE_URL,
  inquiryMessage,
  inquirySubject,
  instagramHref,
  instagramWebHref,
  itemUrl,
  mailtoHref,
  messengerHref,
  shopUrl,
} from "../lib/inquiry";

/**
 * The message body is a contract with the seller, not a cosmetic string: the
 * `LT-` code on line 1 is what makes every prefill failure survivable (spec §4),
 * so these tests pin the exact shape byte for byte.
 */

const CARHARTT = {
  code: "LT-7K2Q9",
  brand: "Carhartt",
  name: "Detroit Jacket",
  condition: "9/10",
  price: 850,
  url: "https://latag.vercel.app/shop/thriftlord/LT-7K2Q9",
};

describe("inquiryMessage", () => {
  it("matches the spec §4 format verbatim", () => {
    expect(inquiryMessage(CARHARTT)).toBe(
      "[LT-7K2Q9] Hi! Is this still available?\n" +
        "Carhartt Detroit Jacket — 9/10 — ₱850\n" +
        "https://latag.vercel.app/shop/thriftlord/LT-7K2Q9"
    );
  });

  it("drops the name segment when the item has no name", () => {
    expect(inquiryMessage({ ...CARHARTT, name: null })).toBe(
      "[LT-7K2Q9] Hi! Is this still available?\n" +
        "Carhartt — 9/10 — ₱850\n" +
        "https://latag.vercel.app/shop/thriftlord/LT-7K2Q9"
    );
  });

  it("treats a blank name as no name", () => {
    expect(inquiryMessage({ ...CARHARTT, name: "   " })).toContain("Carhartt — 9/10");
  });

  it("groups thousands in the price the way the app does", () => {
    expect(inquiryMessage({ ...CARHARTT, price: 12500 })).toContain("₱12,500");
  });

  it("is exactly three lines", () => {
    expect(inquiryMessage(CARHARTT).split("\n")).toHaveLength(3);
  });
});

describe("inquirySubject", () => {
  it("reads `Inquiry: {brand} {name} ({code})`", () => {
    expect(inquirySubject({ brand: "Carhartt", name: "Detroit Jacket", code: "LT-7K2Q9" })).toBe(
      "Inquiry: Carhartt Detroit Jacket (LT-7K2Q9)"
    );
  });

  it("omits the name when there is none", () => {
    expect(inquirySubject({ brand: "Carhartt", name: null, code: "LT-7K2Q9" })).toBe(
      "Inquiry: Carhartt (LT-7K2Q9)"
    );
  });
});

describe("messengerHref", () => {
  it("puts the whole message in the documented `text` parameter", () => {
    const message = inquiryMessage(CARHARTT);
    expect(messengerHref("thriftlord", message)).toBe(
      `https://m.me/thriftlord?text=${encodeURIComponent(message)}`
    );
  });

  it("percent-encodes newlines and the peso sign", () => {
    const href = messengerHref("thriftlord", "a\nb ₱1");
    expect(href).toBe("https://m.me/thriftlord?text=a%0Ab%20%E2%82%B11");
  });

  it("tolerates a seller who typed their handle with an @", () => {
    expect(messengerHref("@thriftlord", "hi")).toBe("https://m.me/thriftlord?text=hi");
  });

  it("encodes the handle so a pasted value cannot inject query parameters", () => {
    expect(messengerHref("a b&x=1", "hi")).toBe("https://m.me/a%20b%26x%3D1?text=hi");
  });
});

describe("instagramHref", () => {
  it("uses ig.me and carries NO text parameter — ig.me discards it (spec §4)", () => {
    const href = instagramHref("thriftlord");
    expect(href).toBe("https://ig.me/m/thriftlord");
    expect(href).not.toContain("text=");
  });

  it("strips a leading @", () => {
    expect(instagramHref("@thriftlord")).toBe("https://ig.me/m/thriftlord");
  });
});

describe("instagramWebHref", () => {
  it("is the desktop fallback profile URL, where ig.me dead-ends", () => {
    expect(instagramWebHref("thriftlord")).toBe("https://www.instagram.com/thriftlord");
  });

  it("strips a leading @", () => {
    expect(instagramWebHref("@thriftlord")).toBe("https://www.instagram.com/thriftlord");
  });
});

describe("mailtoHref", () => {
  it("encodes subject and body", () => {
    expect(mailtoHref("seller@example.com", "Inquiry: X (LT-1)", "a\nb")).toBe(
      "mailto:seller@example.com?subject=Inquiry%3A%20X%20(LT-1)&body=a%0Ab"
    );
  });

  it("trims the address", () => {
    expect(mailtoHref("  seller@example.com ", "s", "b")).toBe(
      "mailto:seller@example.com?subject=s&body=b"
    );
  });
});

describe("url builders", () => {
  it("builds shop and item URLs off one canonical origin", () => {
    expect(SITE_URL).toBe("https://latag.vercel.app");
    expect(shopUrl("thriftlord")).toBe("https://latag.vercel.app/shop/thriftlord");
    expect(itemUrl("thriftlord", "LT-7K2Q9")).toBe(
      "https://latag.vercel.app/shop/thriftlord/LT-7K2Q9"
    );
  });

  it("escapes path segments", () => {
    expect(shopUrl("a b")).toBe("https://latag.vercel.app/shop/a%20b");
  });
});
