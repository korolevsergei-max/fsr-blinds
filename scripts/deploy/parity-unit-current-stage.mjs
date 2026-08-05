#!/usr/bin/env node
/**
 * Parity check for migration 20260805120000_unit_current_stage.sql.
 *
 * Recomputes every unit's pipeline stage in JS straight from the raw tables
 * (windows + window_production_status + open post-install issues), exactly as
 * src/lib/current-stage.ts deriveCurrentStageFromCounts() does, then asserts:
 *
 *   1. get_owner_dashboard_counts' stage_counts match that derivation, and
 *   2. get_owner_dataset ships a matching `current_stage` on every unit row.
 *
 * Run before AND after applying the migration:
 *   node scripts/deploy/parity-unit-current-stage.mjs
 * Before → reports the units the dashboard is mis-bucketing (expected to fail).
 * After  → ALL CHECKS PASSED.
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

/** PostgREST caps a response at 1000 rows; page through everything. */
async function selectAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const [units, windows, production, postInstall] = await Promise.all([
  selectAll("units", "id, unit_number, building_name"),
  selectAll("windows", "unit_id, measured, bracketed, installed"),
  selectAll("window_production_status", "unit_id, status"),
  selectAll("window_post_install_issues", "unit_id, status"),
]);

const openIssueUnits = new Set(
  postInstall.filter((row) => row.status === "open").map((row) => row.unit_id)
);

const counts = new Map();
const countsFor = (unitId) => {
  let entry = counts.get(unitId);
  if (!entry) {
    entry = { total: 0, measured: 0, bracketed: 0, installed: 0, cut: 0, assembled: 0, qc: 0 };
    counts.set(unitId, entry);
  }
  return entry;
};

for (const w of windows) {
  const entry = countsFor(w.unit_id);
  entry.total += 1;
  if (w.measured) entry.measured += 1;
  if (w.bracketed) entry.bracketed += 1;
  if (w.installed) entry.installed += 1;
}
for (const p of production) {
  const entry = counts.get(p.unit_id);
  if (!entry) continue;
  // "or later" roll-up: a qc_approved window has also been cut and assembled.
  if (p.status === "qc_approved") entry.qc += 1;
  if (p.status === "assembled" || p.status === "qc_approved") entry.assembled += 1;
  if (p.status === "cut" || p.status === "assembled" || p.status === "qc_approved") entry.cut += 1;
}

/** Mirrors deriveCurrentStageFromCounts() + getUnitCurrentStage()'s issue precedence. */
function deriveStage(unitId) {
  if (openIssueUnits.has(unitId)) return "post_install_issue";
  const c = counts.get(unitId);
  if (!c || c.total === 0) return "not_started";
  if (c.installed >= c.total) return "installation";
  if (c.qc >= c.total) return "qc";
  if (c.assembled > 0) return "assembling";
  if (c.cut > 0) return "cutting";
  if (c.bracketed >= c.total) return "bracketing";
  if (c.measured >= c.total) return "measurement";
  if (c.bracketed > 0) return "bracketing";
  if (c.measured > 0) return "measurement";
  return "not_started";
}

const expected = {
  not_started: 0, measurement: 0, bracketing: 0, cutting: 0,
  assembling: 0, qc: 0, installation: 0, post_install_issue: 0,
};
const expectedByUnit = new Map();
for (const unit of units) {
  const stage = deriveStage(unit.id);
  expectedByUnit.set(unit.id, stage);
  expected[stage] += 1;
}

const failures = [];

// ── 1. get_owner_dashboard_counts ───────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const { data: rpcCounts, error: countsError } = await supabase.rpc(
  "get_owner_dashboard_counts",
  { p_today: today }
);
if (countsError) {
  failures.push(`get_owner_dashboard_counts failed: ${countsError.message}`);
} else {
  for (const [stage, want] of Object.entries(expected)) {
    const got = Number(rpcCounts.stage_counts?.[stage] ?? 0);
    if (got !== want) failures.push(`stage_counts.${stage}: RPC ${got} ≠ derived ${want}`);
  }
  console.log("stage_counts (RPC)    :", JSON.stringify(rpcCounts.stage_counts));
  console.log("stage_counts (derived):", JSON.stringify(expected));
}

// ── 2. get_owner_dataset unit rows ──────────────────────────────────────────
const { data: dataset, error: datasetError } = await supabase.rpc("get_owner_dataset");
if (datasetError) {
  failures.push(`get_owner_dataset failed: ${datasetError.message}`);
} else {
  const mismatches = [];
  for (const row of dataset.units) {
    const want = expectedByUnit.get(row.id);
    if (row.current_stage !== want) {
      mismatches.push(`${row.unit_number} ${row.building_name}: RPC ${row.current_stage ?? "(absent)"} ≠ derived ${want}`);
    }
  }
  if (mismatches.length > 0) {
    failures.push(`get_owner_dataset current_stage mismatches: ${mismatches.length}`);
    for (const line of mismatches.slice(0, 20)) console.log("  ", line);
  }
}

if (failures.length > 0) {
  console.error("\nFAILED:");
  for (const failure of failures) console.error(" -", failure);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
