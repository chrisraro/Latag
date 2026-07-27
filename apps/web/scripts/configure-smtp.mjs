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

const body = {
  // --- SMTP transport ---
  smtp_host: "smtp.resend.com",
  smtp_port: 465,
  smtp_user: "resend",
  smtp_pass: RESEND_KEY,
  smtp_admin_email: SENDER,
  smtp_sender_name: "Latag",

  // Shared-mailer cap was 2/hour, which throttles real sign-ins. Resend free
  // allows 100/day; 30/hour leaves generous headroom without risking the quota.
  rate_limit_email_sent: 30,

  // 15 minutes: long enough to fetch the code, short enough to limit exposure.
  mailer_otp_exp: 900,

  // --- Code-first templates (both paths: new signup AND returning magic link) ---
  mailer_subjects_magic_link: "{{ .Token }} is your Latag sign-in code",
  mailer_templates_magic_link_content: readFileSync(join(TEMPLATES, "magic-link.html"), "utf8"),
  mailer_subjects_confirmation: "{{ .Token }} — confirm your Latag account",
  mailer_templates_confirmation_content: readFileSync(join(TEMPLATES, "confirm-signup.html"), "utf8"),
};

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

if (!res.ok) {
  // Never echo the response verbatim — it can contain the submitted secret.
  throw new Error(`Config update failed with HTTP ${res.status}. Check the key's "Sending access" permission and try again.`);
}

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
