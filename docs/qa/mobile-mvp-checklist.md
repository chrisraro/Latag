# Mobile MVP — device QA (run in AIRPLANE MODE end-to-end)
- [ ] Fresh install: empty state → create Selector session → log 3 items < 30s total (sticky values working)
- [ ] Wheels tick haptically per detent; chips haptic on select; SAVE double-buzz on success
- [ ] Camera: capture all 4 slots; thumbnails appear; kill app mid-capture → relaunch → no broken rows; orphan file swept (log sweepOrphans count)
- [ ] Photos live in <documents>/latag_media/*.jpg ≤ ~350KB each (1200px JPEG 0.7)
- [ ] Bulto session: bale wheel in New Session; dashboard shows recovery %, break-even bar, projected line; cost wheel hidden in console
- [ ] Mark sold below target → realized reflects actual; undo restores; sold rows dim with "listed" price
- [ ] Delete item: confirm dialog → row gone, files gone
- [ ] IG export: default = available only; caption paste matches template exactly
- [ ] Free tier: set logsUsed=19 (dev) → indicator shows "1 free logs left"; next save works; the one after opens Go Pro sheet and inserts nothing
- [ ] prefers-reduced-motion (OS setting): no scale/slide animations misbehave
- [ ] 6-hour battery sanity: screen-on black theme, no unexpected wakelocks
- [ ] formatPeso comma grouping on REAL device builds (Hermes may lack en-PH Intl data on iOS → silent ungrouped fallback; check ₱1,250 renders grouped on both platforms)
- [ ] Multi-photo capture loop (20+ photos in one session) with a memory watch — verifies ImageManipulator shared-object release; include a failure-path capture (cancel mid-capture) to confirm release-on-error
- [ ] Stage photos then back out WITHOUT saving → relaunch → orphan sweep removes the abandoned files; next console open shows empty slots
- [ ] Wheel centering on a non-390pt device (e.g. small Android) — selected value sits visually centered
- [ ] Camera permission DENIED walkthrough: deny → slots show grant state → items still save photo-less (photos never block saving)
- [ ] Edit round-trip: edit an item with photos → slots prefill → re-shoot one slot → save → detail shows exactly one photo per type (no duplicates), old file removed

## Phase C — auth, licensing, settings, onboarding (device)
- [ ] Fresh install → onboarding shows once (2 panes, swipe + dots, Skip works) → never again on relaunch
- [ ] Settings (gear on sessions screen): storage figure sane; offline row present; version footer correct
- [ ] Sign in from Settings: send email → tap the emailed link ON THE PHONE → app opens via latag:// and toast confirms sign-in
- [ ] Grant Pro to your account in the web /admin FIRST, then sign in on the phone → "Pro activated" toast → Settings shows PRO — Active → Rapid Console free-logs indicator gone (unlimited)
- [ ] AIRPLANE MODE: relaunch app signed-in-with-Pro → everything works, PRO still shown (cached receipt)
- [ ] Sign out in Settings → toast says data and Pro stay → Pro STILL active locally (by design)
- [ ] Revoke Pro in web /admin → phone: Settings → Refresh license (online, signed in) → returns to Free with remaining logs resumed
- [ ] Go Pro sheet (21st save attempt): "Already Pro? Sign in" opens sign-in
- [ ] Deep link with a stale/used email link → app opens, no crash, no sign-in (silent no-op)
