#!/usr/bin/env node
/**
 * Post-deploy verification for 20260806120000_manufacturing_partners.sql.
 *
 * Checks the things that would silently break production if the migration landed
 * wrong — above all Symptom A in docs/DEPLOY_RUNBOOK_SUBCONTRACTOR_2026-08-06.md:
 * get_role_schedule now returns internal units ONLY, so a missing or mis-flagged
 * `mp-internal` seed row would empty the cutter/assembler/QC queues facility-wide.
 *
 *   node scripts/deploy/verify-manufacturing-partners.mjs
 *
 * Reads .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Read-only.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

// 1. The seed row the whole exclusivity filter hangs off.
const { data: partners, error: partnersErr } = await supabase
  .from("manufacturing_partners")
  .select("id, name, is_internal");
if (partnersErr) {
  console.error("could not read manufacturing_partners:", partnersErr.message);
  process.exit(1);
}
const internal = (partners ?? []).filter((p) => p.is_internal);
// Was "exactly one" until 20260814120000 lifted the single-internal unique index
// to allow a second station. What still matters is that AT LEAST one exists (an
// empty internal set empties every factory queue) and that the column default
// 'mp-internal' is one of them — every unit that predates routing points at it.
// Per-station integrity is verify-manufacturing-stations.mjs's job.
check("at least one internal partner exists", internal.length >= 1, `found ${internal.length}`);
check(
  "the default partner mp-internal is internal",
  internal.some((p) => p.id === "mp-internal"),
  internal.map((p) => p.id).join(", ") || "none"
);
console.log(`        partners: ${(partners ?? []).map((p) => `${p.id}${p.is_internal ? "*" : ""}`).join(", ")}`);

// 2. Every unit is routed somewhere valid — an unroutable unit is invisible to both sides.
const validIds = new Set((partners ?? []).map((p) => p.id));
const { data: units, error: unitsErr } = await supabase
  .from("units")
  .select("id, manufacturing_partner_id");
if (unitsErr) {
  console.error("could not read units:", unitsErr.message);
  process.exit(1);
}
const byPartner = new Map();
let orphaned = 0;
for (const u of units ?? []) {
  const pid = u.manufacturing_partner_id;
  if (!pid || !validIds.has(pid)) orphaned += 1;
  byPartner.set(pid, (byPartner.get(pid) ?? 0) + 1);
}
check("no unit points at a missing partner", orphaned === 0, `${orphaned} orphaned`);
console.log(
  `        ${units.length} units → ${[...byPartner].map(([k, v]) => `${k}: ${v}`).join(", ")}`
);

// 3. The factory can still see its work. This is the regression that would hurt.
const { data: schedule, error: schedErr } = await supabase.rpc("get_role_schedule", {
  p_date_column: "scheduled_cut_date",
  p_include_archived: false,
});
if (schedErr) {
  check("get_role_schedule responds", false, schedErr.message);
} else {
  const rows = schedule?.schedule_rows?.length ?? 0;
  const { count: rawCount } = await supabase
    .from("window_manufacturing_schedule")
    .select("*", { count: "exact", head: true });
  // Every unit is internal on day one, so the filter must drop nothing.
  const externalUnitIds = new Set(
    (units ?? []).filter((u) => u.manufacturing_partner_id !== "mp-internal").map((u) => u.id)
  );
  check("get_role_schedule returns rows", rows > 0, `${rows} schedule rows`);
  if (externalUnitIds.size === 0) {
    check(
      "the partner filter drops nothing while all units are in-house",
      rows === (rawCount ?? 0),
      `rpc ${rows} vs table ${rawCount}`
    );
  } else {
    const leaked = (schedule.schedule_rows ?? []).filter((r) => externalUnitIds.has(r.unit_id));
    check("no subcontracted unit leaks into the factory queue", leaked.length === 0,
      `${leaked.length} leaked`);
  }
}

// 4. The write-side backstop is installed.
const { data: worklistProbe, error: worklistErr } = await supabase.rpc(
  "get_subcontractor_worklist"
);
// service_role is allowed through the gate; with no partner linked it raises.
check(
  "get_subcontractor_worklist exists",
  !worklistErr || !/does not exist/i.test(worklistErr.message),
  worklistErr?.message ?? `returned ${worklistProbe?.units?.length ?? 0} units`
);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
