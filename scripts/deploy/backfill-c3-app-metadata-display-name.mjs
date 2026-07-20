#!/usr/bin/env node
// C3 sub-part A backfill — stamp app_metadata.display_name for existing users so
// getCurrentUser's fast path engages immediately (instead of waiting for each
// user's next organic getCurrentUser + token refresh). Idempotent; safe to
// re-run. Reads .env.local for the URL + service-role key. Throwaway.
//
//   node scratchpad/backfill-c3-app-metadata-display-name.mjs
//
// For each auth user, reads user_profiles.{role,display_name} and stamps
// app_metadata = { role, display_name } (merge). Never touches user_metadata.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: profiles, error } = await supabase
  .from("user_profiles")
  .select("id, role, display_name");
if (error) throw error;

let stamped = 0;
let skipped = 0;
for (const p of profiles ?? []) {
  if (!p.role || !p.display_name) { skipped++; continue; }
  const { data: userRes } = await supabase.auth.admin.getUserById(p.id);
  const current = userRes?.user?.app_metadata ?? {};
  if (current.role === p.role && current.display_name === p.display_name) { skipped++; continue; }
  const { error: upErr } = await supabase.auth.admin.updateUserById(p.id, {
    app_metadata: { role: p.role, display_name: p.display_name },
  });
  if (upErr) { console.error(`FAIL ${p.id}: ${upErr.message}`); continue; }
  stamped++;
}

console.log(`Done. stamped=${stamped} skipped=${skipped} total=${profiles?.length ?? 0}`);
