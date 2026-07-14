# Web B2 — owner walkthrough (production or local `next start`)

Prereqs: Vercel env vars set (see below) or local .env.local; you are the ADMIN_EMAILS owner.

- [ ] /account/sign-in → enter your email → receive 6-digit code (check spam; Supabase Auth logs show the send)
- [ ] Verify code → lands on /account showing your email + Free card with ₱ price from the pricing table
- [ ] /admin loads for you (and 404s in a private window with no session)
- [ ] Admin → Users: your account listed → Grant Pro → row shows PRO badge
- [ ] /account now shows PRO — Active card with granted date
- [ ] GET /api/license with your session (browser devtools fetch with credentials) → 200 with license + receipt string starting "latag1."
- [ ] Feedback: submit a suggestion on /account → appears in /admin inbox → cycle its status → status reflects on /account
- [ ] Pricing: change the price in /admin → /account Free card shows the new figure (the static /pro page shows no numeric price by design)
- [ ] Feature flags: add a test flag, toggle it, verify persistence on reload
- [ ] Revoke Pro in /admin → /account returns to Free card → GET /api/license → 404 {license:null}
- [ ] Delete a TEST account (create one with a second email first, submit one feedback from it) → its feedback disappears from the /admin inbox → sign-in works again with that email as a fresh account

## Vercel env vars (Production) — required before the deployed site works
- NEXT_PUBLIC_SUPABASE_URL = https://dcnpuvtbftpbcjcvfnlt.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY = (from apps/web/.env.example)
- SUPABASE_SERVICE_ROLE_KEY = (Supabase dashboard → Project Settings → API keys → service_role; NEVER commit)
- LICENSE_SIGNING_SECRET = (copy from local apps/web/.env.local; NEVER commit)
- ADMIN_EMAILS = rarochristian029@gmail.com
