#!/usr/bin/env node
// Fetches the Supabase service_role key via the Management API and writes/merges
// apps/web/.env.local with the five variables the app needs locally.
//
// Never logs key material — only counts and filenames.

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PROJECT_REF = "dcnpuvtbftpbcjcvfnlt";
const NEXT_PUBLIC_SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const NEXT_PUBLIC_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjbnB1dnRiZnRwYmNqY3Zmbmx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMjYzNjEsImV4cCI6MjA5OTYwMjM2MX0.BoelJ4pLi0JuF8a6A3Ca0Iq_VrSmAV5adm9W8BHekOY";
const ADMIN_EMAILS = "teamocsph@gmail.com";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocalPath = path.resolve(__dirname, "..", ".env.local");

function getAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;

  // Fallback: read from the Windows User environment scope via PowerShell.
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        '[Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN","User")',
      ],
      { encoding: "utf8" }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

function parseEnvFile(contents) {
  const map = new Map();
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    map.set(key, value);
  }
  return map;
}

async function main() {
  const accessToken = getAccessToken();
  if (!accessToken) {
    console.error(
      "BLOCKED: SUPABASE_ACCESS_TOKEN not found in process.env or Windows User environment scope."
    );
    process.exitCode = 1;
    return;
  }

  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.error(`BLOCKED: api-keys request failed with status ${res.status}`);
    process.exitCode = 1;
    return;
  }

  const keys = await res.json();
  if (!Array.isArray(keys)) {
    console.error("BLOCKED: unexpected api-keys response shape (not an array)");
    process.exitCode = 1;
    return;
  }

  const serviceRoleEntry = keys.find((k) => k.name === "service_role");
  if (!serviceRoleEntry || !serviceRoleEntry.api_key) {
    console.error("BLOCKED: service_role key not found in api-keys response");
    process.exitCode = 1;
    return;
  }
  const serviceRoleKey = serviceRoleEntry.api_key;

  // Merge with any existing .env.local so we don't clobber a pre-existing LICENSE_SIGNING_SECRET.
  let existing = new Map();
  if (existsSync(envLocalPath)) {
    existing = parseEnvFile(readFileSync(envLocalPath, "utf8"));
  }

  const licenseSigningSecret =
    existing.get("LICENSE_SIGNING_SECRET") || randomBytes(32).toString("hex");

  const merged = new Map(existing);
  merged.set("NEXT_PUBLIC_SUPABASE_URL", NEXT_PUBLIC_SUPABASE_URL);
  merged.set("NEXT_PUBLIC_SUPABASE_ANON_KEY", NEXT_PUBLIC_SUPABASE_ANON_KEY);
  merged.set("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
  merged.set("LICENSE_SIGNING_SECRET", licenseSigningSecret);
  merged.set("ADMIN_EMAILS", existing.get("ADMIN_EMAILS") || ADMIN_EMAILS);

  const lines = Array.from(merged.entries()).map(([k, v]) => `${k}=${v}`);
  writeFileSync(envLocalPath, lines.join("\n") + "\n", { encoding: "utf8" });

  console.log(`wrote .env.local (${merged.size} keys)`);
}

// Never let an unexpected throw reach the default handler: V8 error messages
// (e.g. JSON.parse) can quote fragments of the response body, which here
// contains revealed key material. Generic message only.
main().catch(() => {
  console.error("BLOCKED: unexpected error while fetching keys (no details printed by design)");
  process.exit(1);
});
