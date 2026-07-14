#!/usr/bin/env node
// Applies a SQL migration file to the live Supabase project via the Management
// API's database/query endpoint.
//
// Usage: node scripts/apply-migration.mjs ../../supabase/migrations/0001_licensing.sql
//
// Prints only HTTP status codes. On error, also prints the response body
// (query-endpoint error bodies contain SQL error text, not key material).
// Exits non-zero on failure. Not idempotent by design: do not re-run after
// a successful apply.

import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PROJECT_REF = "dcnpuvtbftpbcjcvfnlt";
const QUERY_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

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

async function runQuery(accessToken, sql) {
  const res = await fetch(QUERY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  console.log(`HTTP ${res.status}`);

  if (!res.ok) {
    const body = await res.text();
    console.error(body);
    return false;
  }

  return true;
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("BLOCKED: usage: node scripts/apply-migration.mjs <path-to-sql-file>");
    process.exitCode = 1;
    return;
  }

  const accessToken = getAccessToken();
  if (!accessToken) {
    console.error(
      "BLOCKED: SUPABASE_ACCESS_TOKEN not found in process.env or Windows User environment scope."
    );
    process.exitCode = 1;
    return;
  }

  const sqlPath = path.resolve(process.cwd(), fileArg);
  const sql = readFileSync(sqlPath, "utf8");

  const ok = await runQuery(accessToken, sql);
  if (!ok) {
    console.error(`BLOCKED: migration failed applying ${fileArg}`);
    process.exitCode = 1;
    return;
  }

  console.log(`applied ${fileArg}`);
}

main().catch((err) => {
  console.error(`BLOCKED: unexpected error: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
