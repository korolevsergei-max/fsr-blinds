#!/usr/bin/env node
/**
 * Parity check for migration 20260810140000_manufacturing_lock.sql (MR4a).
 *
 * Recomputes every unit's manufacturing lock in JS straight from the raw
 * tables (units + window_production_status + manufacturing_partners), exactly
 * as src/lib/manufacturing-lock.ts computeManufacturingLock() does, then
 * asserts:
 *
 *   1. unit_manufacturing_locks agrees on manufacturing_locked, qc_count and
 *      in_flight_count for every unit, and
 *   2. get_owner_dataset ships a matching `manufacturing_locked` on every
 *      unit row, and
 *   3. locked ⟹ routed — a locked unit with no manufacturing_assigned_at is a
 *      contradiction (the MR3 backfill is MR4a's precondition).
 *
 * Run after applying the migration:
 *   node scripts/deploy/parity-manufacturing-lock.mjs
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

const [units, production, partners, lockRows] = await Promise.all([
  selectAll(
    "units",
    "id, unit_number, building_name, manufacturing_partner_id, manufacturing_assigned_at, production_entered_at, all_measured_at"
  ),
  selectAll("window_production_status", "unit_id, status"),
  selectAll("manufacturing_partners", "id, is_internal"),
  selectAll("unit_manufacturing_locks", "unit_id, manufacturing_locked, qc_count, in_flight_count"),
]);

const internalById = new Map(partners.map((p) => [p.id, p.is_internal]));

const counts = new Map();
for (const p of production) {
  let entry = counts.get(p.unit_id);
  if (!entry) {
    entry = { started: 0, qc: 0 };
    counts.set(p.unit_id, entry);
  }
  if (p.status !== "pending") entry.started += 1;
  if (p.status === "qc_approved") entry.qc += 1;
}

/** Mirrors computeManufacturingLock() / is_manufacturing_locked(). Keep in lockstep. */
function deriveLock(unit) {
  const c = counts.get(unit.id) ?? { started: 0, qc: 0 };
  // COALESCE(mp.is_internal, true): an unknown partner id reads as internal.
  const isInternal = internalById.get(unit.manufacturing_partner_id) ?? true;
  if (isInternal) {
    return unit.production_entered_at !== null || c.started > 0;
  }
  return unit.all_measured_at !== null || c.qc > 0;
}

const failures = [];
const label = (u) => `${u.unit_number} ${u.building_name}`;

// ── 1. unit_manufacturing_locks vs the TS derivation ────────────────────────
const viewByUnit = new Map(lockRows.map((r) => [r.unit_id, r]));
let lockedInternal = 0;
let lockedExternal = 0;
const mismatches = [];
for (const unit of units) {
  const want = deriveLock(unit);
  const c = counts.get(unit.id) ?? { started: 0, qc: 0 };
  const row = viewByUnit.get(unit.id);
  if (!row) {
    mismatches.push(`${label(unit)}: missing from unit_manufacturing_locks`);
    continue;
  }
  if (row.manufacturing_locked !== want) {
    mismatches.push(`${label(unit)}: view locked=${row.manufacturing_locked} ≠ derived ${want}`);
  }
  if (row.qc_count !== c.qc || row.in_flight_count !== c.started - c.qc) {
    mismatches.push(
      `${label(unit)}: view counts qc=${row.qc_count}/in_flight=${row.in_flight_count} ≠ derived ${c.qc}/${c.started - c.qc}`
    );
  }
  if (want) {
    if (internalById.get(unit.manufacturing_partner_id) ?? true) lockedInternal += 1;
    else lockedExternal += 1;
  }
}
if (mismatches.length > 0) {
  failures.push(`unit_manufacturing_locks mismatches: ${mismatches.length}`);
  for (const line of mismatches.slice(0, 20)) console.log("  ", line);
}

// ── 2. get_owner_dataset unit rows ──────────────────────────────────────────
const { data: dataset, error: datasetError } = await supabase.rpc("get_owner_dataset");
if (datasetError) {
  failures.push(`get_owner_dataset failed: ${datasetError.message}`);
} else {
  const dsMismatches = [];
  for (const row of dataset.units) {
    const unit = units.find((u) => u.id === row.id);
    const want = unit ? deriveLock(unit) : undefined;
    if (row.manufacturing_locked !== want) {
      dsMismatches.push(
        `${row.unit_number} ${row.building_name}: RPC ${row.manufacturing_locked ?? "(absent)"} ≠ derived ${want}`
      );
    }
  }
  if (dsMismatches.length > 0) {
    failures.push(`get_owner_dataset manufacturing_locked mismatches: ${dsMismatches.length}`);
    for (const line of dsMismatches.slice(0, 20)) console.log("  ", line);
  }
}

// ── 3. locked ⟹ routed (the MR3 precondition MR4a's design assumes) ────────
const lockedUnrouted = units.filter(
  (u) => deriveLock(u) && u.manufacturing_assigned_at === null
);
if (lockedUnrouted.length > 0) {
  failures.push(`locked-but-unrouted contradictions: ${lockedUnrouted.length}`);
  for (const u of lockedUnrouted.slice(0, 20)) console.log("  ", label(u));
}

console.log(`units total        : ${units.length}`);
console.log(`locked (internal)  : ${lockedInternal}`);
console.log(`locked (external)  : ${lockedExternal}`);
console.log(`locked total       : ${lockedInternal + lockedExternal}`);

if (failures.length > 0) {
  console.error("\nFAILED:");
  for (const failure of failures) console.error(" -", failure);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
