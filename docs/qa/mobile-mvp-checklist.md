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
- [ ] Cross-device case: open the email link on a COMPUTER instead → phone code becomes invalid → Resend from the phone recovers (known PKCE same-device limitation until custom SMTP ships codes)

## Phase D — OTA, welcome, parity (device)
- [ ] FRESH install (clear data): Welcome screen shows — logo mark, LATAG wordmark, 3 feature rows with icons
- [ ] Welcome "Start offline — sign in later" → onboarding → sessions; relaunch → straight to sessions (no welcome, no onboarding)
- [ ] Welcome "Continue with Email" → sign-in (6 OTP boxes, active box acid); complete sign-in → lands in onboarding with license toast
- [ ] UPDATED install (existing data from previous APK): NO welcome screen after update (onboarded users skip it)
- [ ] Sign-in code step: resend countdown ticks 0:45 → 0:00 → becomes tappable "Resend"
- [ ] OTA (silent): publish an update → open app online (downloads in background) → close and reopen → second launch runs the new bundle; Settings version shows the update id (not "embedded")
- [ ] Settings → App: version row shows v1.0.0 + short update id (or "embedded"); "Check for updates" online → honest state; AIRPLANE MODE → "Couldn't check — are you online?" error toast; boot in airplane mode unaffected
- [ ] Icon sweep: every screen shows Phosphor icons (no blank squares): welcome rows, onboarding cards, settings tiles, camera brackets/slot chips, export checks/copy, dashboards FAB/export, item edit/delete
- [ ] Parity spot-check vs docs/mockups/latag-mvp.html side by side: sessions card money (small ₱), hero numbers, wheel center + acid underline, OTP boxes, obcards, set-rows — spacing and type feel identical
- [ ] Camera slot chips: FRONT done (acid+check) after first capture; current slot ink-bordered

## Phase E1 — full ukay catalog (device)
- [ ] Log one item per department (Bottoms/Dresses/Footwear/Bags/Accessories) end-to-end: correct wheels, chips, detail rows, captions
- [ ] Footwear wheels: US half sizes + insole cm; Accessories: size note instead of wheels
- [ ] "More specs" expander: extras save only when scrolled; show in caption (e.g. +RISE)
- [ ] Brand search: seed hit (type "car" → Carhartt), recents first, add custom brand offline → suggested next session
- [ ] Item name: "Brand · Name" in rows/detail/caption; name optional everywhere
- [ ] PRE-EXISTING items (logged before update): still open/edit/export correctly as Tops, zero data loss after migration
- [ ] IG caption per department matches format ("👕 Brand Type" or "👕 Brand · Name"; spec segment per dept)

## Phase E2 — sessions 2.0 (device)
- [ ] Pin location on new session: search a PH place, drag map under pin, locate-me (grant + deny paths); offline → typed name + pin still saves
- [ ] Schedule a session (wheel date/time picker) with 2 reminders → lock phone → alarm notification fires WITH sound at offset → tap opens the session
- [ ] Scheduled tab: soonest-first, countdown ticks, overdue card highlighted "now"; Start now → converts to live, pending reminders cancelled (verify none fire after)
- [ ] Edit scheduled session: change time → old reminders cancelled, new ones fire; delete → reminders cancelled
- [ ] Session cards show pin + location name; Sessions tab unchanged for existing sessions
- [ ] Foreground: reminder still shows banner + sound while app is open

## Phase E3 — media & sharing (device)
- [ ] Item detail "Save photos" → gallery album "Latag · {session}" appears with the item's photos; toast counts correctly
- [ ] Export "Save all images" (selected items; none selected → all); permission DENY path → honest toast, nothing crashes
- [ ] Fresh install: onboarding shows 3 panes; pane 3 Allow chips trigger real OS prompts, "Granted ✓" state, all skippable
- [ ] Share to IG (export + item detail): photos land in gallery, caption pastes from clipboard, Instagram opens (or web fallback)
- [ ] Deny photos permission then Share to IG → permission toast, no partial state
- [ ] Mid-batch save failure (storage full) → no orphan photos in camera roll, honest error toast
