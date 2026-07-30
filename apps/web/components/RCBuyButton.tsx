/**
 * Play Store badge button.
 *
 * Since Latag uses Apple & Google in-app purchases (no Stripe/Paddle
 * paperwork needed), the web checkout just directs users to download or
 * open the app and subscribe there.
 *
 * Android only for now — Latag is live on Google Play (package
 * com.chrisraro.latag, matching apps/mobile/app.json). There is no App Store
 * listing yet, so no iOS link is shown here; add one once an App Store ID
 * exists rather than linking to a placeholder.
 */

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.chrisraro.latag";

export function RCBuyButton() {
  return (
    <div className="mt-5 flex flex-col gap-3">
      <p className="text-sm text-inkdim">
        Subscribe inside the Latag app — Apple & Google handle the payment,
        so no billing documents or tax forms needed.
      </p>

      <div className="flex flex-wrap gap-3">
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="display inline-flex h-12 items-center justify-center gap-2 rounded-full border border-hairline bg-surface2 px-6 text-[13px] font-bold uppercase tracking-wide text-ink hover:bg-surface1 active:scale-[0.98]"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 0 1 0 1.732l-2.807 1.626L15.206 12l2.492-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/>
          </svg>
          Google Play
        </a>
      </div>

      <p className="text-xs leading-relaxed text-inkfaint">
        After subscribing, open the Latag app, go to Settings, and tap{" "}
        <strong className="text-ink">Restore purchases</strong> or{" "}
        <strong className="text-ink">Refresh license</strong> — your Pro will sync instantly.
        Your subscription follows your account, not your device.
      </p>
    </div>
  );
}
