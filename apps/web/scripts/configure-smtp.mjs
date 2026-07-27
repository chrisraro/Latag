/**
 * Configures Supabase Auth to send mail through Resend, and installs Latag's
 * code-first email templates.
 *
 * Secrets come from Windows User env vars — never arguments, never printed:
 *   RESEND_API_KEY          (re_...)  -> used as the SMTP password
 *   SUPABASE_ACCESS_TOKEN             -> management API auth
 *
 * Run:  node apps/web/scripts/configure-smtp.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const REF = "dcnpuvtbftpbcjcvfnlt";
const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/email-templates");

const RESEND_KEY = process.env.RESEND_API_KEY;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!RESEND_KEY) throw new Error("RESEND_API_KEY is not set (User env var). See spec §SMTP.");
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN is not set (User env var).");
if (!RESEND_KEY.startsWith("re_")) throw new Error("RESEND_API_KEY does not look like a Resend key (expected re_...)");

// Resend test sender: delivers ONLY to the address that owns the Resend account.
// Swap SENDER to noreply@<your-domain> once a domain is verified in Resend.
const SENDER = "onboarding@resend.dev";

/** PATCH the auth config. Server errors are surfaced with the key redacted —
 *  hiding them entirely makes 400s undebuggable. */
async function patchAuth(label, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.text()).split(RESEND_KEY).join("re_***REDACTED***");
    throw new Error(`${label} failed (HTTP ${res.status}): ${detail.slice(0, 400)}`);
  }
  console.log(`${label}: ok`);
}

// Step 1 — SMTP transport. Must land FIRST and on its own: Supabase gates
// rate-limit and template edits on custom SMTP already being stored.
// smtp_port is a STRING in this API; a number is rejected with a 400.
await patchAuth("smtp transport", {
  smtp_host: "smtp.resend.com",
  smtp_port: "465",
  smtp_user: "resend",
  smtp_pass: RESEND_KEY,
  smtp_admin_email: SENDER,
  smtp_sender_name: "Latag",
});

// Step 2 — now unlocked: limits + code-first templates for BOTH mail paths
// (new addresses get "confirmation", returning ones get "magic link").
await patchAuth("limits + templates", {
  // Shared-mailer cap was 2/hour, which throttles real sign-ins. Resend free
  // allows 100/day; 30/hour leaves generous headroom without risking the quota.
  rate_limit_email_sent: 30,
  // 15 minutes: long enough to fetch the code, short enough to limit exposure.
  mailer_otp_exp: 900,
  // Supabase now defaults EMAIL otp to 8 digits (sms stays 6). The mobile
  // sign-in renders exactly six boxes and validates /^\d{6}$/, so an 8-digit
  // code is literally unenterable. Keep these two in lockstep: changing this
  // requires changing OtpBoxes + CODE_RE in app/auth/sign-in.tsx.
  mailer_otp_length: 6,
  mailer_subjects_magic_link: "{{ .Token }} is your Latag sign-in code",
  mailer_templates_magic_link_content: readFileSync(join(TEMPLATES, "magic-link.html"), "utf8"),
  mailer_subjects_confirmation: "{{ .Token }} — confirm your Latag account",
  mailer_templates_confirmation_content: readFileSync(join(TEMPLATES, "confirm-signup.html"), "utf8"),
});

// Read back the non-secret fields to prove the change landed.
const verify = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
}).then((r) => r.json());

console.log("SMTP host:        ", verify.smtp_host);
console.log("SMTP sender:      ", verify.smtp_admin_email, `(${verify.smtp_sender_name})`);
console.log("Emails per hour:  ", verify.rate_limit_email_sent);
console.log("Code expiry (s):  ", verify.mailer_otp_exp);
console.log("Magic-link subject:", verify.mailer_subjects_magic_link);
console.log("Code in magic-link template:  ", /\.Token/.test(verify.mailer_templates_magic_link_content ?? ""));
console.log("Code in signup template:      ", /\.Token/.test(verify.mailer_templates_confirmation_content ?? ""));
console.log("\nDone. Send yourself a sign-in email to confirm delivery.");
