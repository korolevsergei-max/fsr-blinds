// Guard check for the Phase 1 lockdown (security audit finding C1): asserts
// that no anon/public RLS policy exists on any public-schema table, storage
// keeps only the intentional read-only public policy on fsr-media, and RLS is
// enabled on every public table. Backed by public.anon_policy_violations()
// (service_role-only, from 20260713150000_phase1_anon_policy_guard.sql).
//
// Usage: node scripts/check-anon-policies.mjs
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (reads
// .env.local automatically). Exits 1 if any violation is found.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // .env.local optional; env vars may come from the environment (CI)
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const supabase = createClient(url, key);
const { data, error } = await supabase.rpc("anon_policy_violations");

if (error) {
  console.error("Guard query failed:", error.message);
  process.exit(2);
}

if (data.length > 0) {
  console.error("anon-policy guard FAILED:");
  for (const v of data) {
    console.error(`  ${v.schemaname}.${v.tablename} policy ${v.policyname} (${v.cmd})`);
  }
  process.exit(1);
}

console.log("anon-policy guard OK: no anon/public policies on public tables, storage limited to fsr-media read-only, RLS enabled everywhere.");
