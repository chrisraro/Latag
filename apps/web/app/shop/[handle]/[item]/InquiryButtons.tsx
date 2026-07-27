"use client";

import { useCallback, useEffect, useState } from "react";
import {
  instagramHref,
  instagramWebHref,
  mailtoHref,
  messengerHref,
} from "../../../../lib/inquiry";

/**
 * Inquiry routing (spec §4), belt and braces.
 *
 * Every channel copies the message to the clipboard on tap — including
 * Messenger, where prefill is documented to work. If prefill ever fails the
 * buyer pastes instead of hitting a dead end, and that costs nothing.
 *
 * Instagram is the one channel with no prefill at all: `ig.me` discards query
 * params, and on desktop it dead-ends entirely. So the desktop variant links to
 * the profile and the message is rendered as selectable text. The split is pure
 * CSS (`md:`) — no user-agent sniffing, which would be wrong on tablets and
 * unmaintainable everywhere else.
 */

type Props = {
  message: string;
  subject: string;
  itemUrl: string;
  messenger: string | null;
  instagram: string | null;
  email: string | null;
};

const BASE =
  "display flex min-h-12 items-center justify-center rounded-full px-5 text-[13px] uppercase tracking-wide transition-colors";
/** Channel buttons are the page's action — full width. */
const PRIMARY = `${BASE} w-full bg-acid text-acidink hover:bg-acid/90`;
const SECONDARY = `${BASE} w-full border border-hairline bg-surface1 text-ink hover:border-inkfaint/50`;
/** Utilities sit beside each other and must not compete with them. */
const UTILITY = `${BASE} border border-hairline bg-surface1 text-inkdim hover:text-ink`;

async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function InquiryButtons({ message, subject, itemUrl, messenger, instagram, email }: Props) {
  const [status, setStatus] = useState<string>("");
  const [canShare, setCanShare] = useState(false);

  // Read after mount: `navigator.share` cannot be known during SSR, and
  // branching on it during render would desync hydration.
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(""), 2600);
    return () => clearTimeout(t);
  }, [status]);

  /** Fire-and-forget: the anchor's own navigation must not be blocked waiting
   *  on the clipboard, so this never calls preventDefault. */
  const copyMessage = useCallback(() => {
    void copy(message).then((ok) =>
      setStatus(ok ? "Message copied — paste it in the chat." : "Copy the message below instead.")
    );
  }, [message]);

  const copyLink = useCallback(() => {
    void copy(itemUrl).then((ok) => setStatus(ok ? "Link copied." : "Could not copy the link."));
  }, [itemUrl]);

  const share = useCallback(() => {
    void navigator.share({ text: message, url: itemUrl }).catch(() => undefined);
  }, [message, itemUrl]);

  const hasChannel = Boolean(messenger || instagram || email);

  return (
    <div className="mt-8">
      {hasChannel ? (
        <div className="flex flex-col gap-3">
          {messenger ? (
            <a
              href={messengerHref(messenger, message)}
              onClick={copyMessage}
              target="_blank"
              rel="noopener noreferrer"
              className={PRIMARY}
            >
              Message on Messenger
            </a>
          ) : null}

          {instagram ? (
            <>
              <a
                href={instagramHref(instagram)}
                onClick={copyMessage}
                target="_blank"
                rel="noopener noreferrer"
                className={`${SECONDARY} md:hidden`}
              >
                Message on Instagram
              </a>
              <a
                href={instagramWebHref(instagram)}
                onClick={copyMessage}
                target="_blank"
                rel="noopener noreferrer"
                className={`${SECONDARY} hidden md:flex`}
              >
                Open Instagram profile
              </a>
            </>
          ) : null}

          {email ? (
            <a
              href={mailtoHref(email, subject, message)}
              onClick={copyMessage}
              className={SECONDARY}
            >
              Email the seller
            </a>
          ) : null}
        </div>
      ) : (
        <p className="text-[13px] leading-[1.5] text-inkdim">
          This seller hasn&apos;t added a contact yet. Quote the item code above when you reach
          them.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={copyLink}
          className={UTILITY}
        >
          Copy link
        </button>
        {canShare ? (
          <button type="button" onClick={share} className={UTILITY}>
            Share
          </button>
        ) : null}
      </div>

      <p aria-live="polite" className="mt-3 min-h-5 text-[13px] leading-[1.4] text-acid">
        {status}
      </p>

      {instagram ? (
        <div className="mt-6 hidden md:block">
          <p className="text-[12px] leading-[1.5] text-inkfaint">
            Instagram links only open the DM on a phone. On desktop, copy this into the seller&apos;s
            DM:
          </p>
          <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-hairline bg-surface1 p-4 font-sans text-[13px] leading-[1.6] text-inkdim">
            {message}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
