/**
 * App Store / Play Store badge buttons.
 *
 * Since Latag uses Apple & Google in-app purchases (no Stripe/Paddle
 * paperwork needed), the web checkout just directs users to download or
 * open the app and subscribe there.
 */

const APP_STORE_URL = "https://apps.apple.com/app/idYOUR_APP_ID";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.latag.app";

export function RCBuyButton() {
  return (
    <div className="mt-5 flex flex-col gap-3">
      <p className="text-sm text-inkdim">
        Subscribe inside the Latag app — Apple & Google handle the payment,
        so no billing documents or tax forms needed.
      </p>

      <div className="flex flex-wrap gap-3">
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="display inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[13px] font-bold uppercase tracking-wide text-bg hover:bg-ink/90 active:scale-[0.98]"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          App Store
        </a>

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
