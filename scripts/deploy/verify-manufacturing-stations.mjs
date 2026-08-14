#!/usr/bin/env node
/**
 * Post-deploy verification for 20260814120000_manufacturing_stations.sql.
 *
 * Answers the two questions the stations feature exists to keep answerable:
 *
 *   "Did any work disappear?"  — every routed in-zone unit still has schedule
 *                                rows for all of its windows (Rule 2).
 *   "Is anything built twice?" — the per-station queue sets are pairwise
 *                                disjoint, computed from the real per-station
 *                                query rather than assumed from the data model.
 *
 *   node scripts/deploy/verify-manufacturing-stations.mjs
 *
 * Reads .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 * Read-only — safe to run against production at any time.
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

/**
 * PostgREST caps a plain select at 1,000 rows. This repo has been bitten by that
 * before (MF0: unit-detail loaders silently truncated at 1,000 windows, 369 of
 * 393 units affected), and every count below would be quietly wrong under the
 * same cap — a truncated read makes "nothing disappeared" trivially true.
 */
async function selectAll(table, columns, refine = (q) => q) {
  const page = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await refine(supabase.from(table).select(columns)).range(
      from,
      from + page - 1
    );
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < page) return rows;
    from += page;
  }
}

// The reflow's own zone predicate (reflowStation in src/lib/manufacturing-scheduler.ts).
const IN_ZONE = ["measured", "bracketed", "manufactured"];

const partners = await selectAll("manufacturing_partners", "id, name, is_internal");
const stations = partners.filter((p) => p.is_internal);
const stationIds = new Set(stations.map((s) => s.id));

console.log(`\nstations: ${stations.map((s) => `${s.id} (${s.name})`).join(", ")}`);
console.log(`vendors:  ${partners.filter((p) => !p.is_internal).map((p) => p.id).join(", ") || "none"}\n`);

check("at least one internal station exists", stations.length >= 1, `${stations.length}`);
check(
  "the default station mp-internal is still internal",
  stationIds.has("mp-internal"),
  [...stationIds].join(",")
);

// ── 1. Every staff account sits on an internal station ─────────────────────
// auth_station_id() trusts whatever is on the row; a cutter pointed at a vendor
// would be handed read access to that vendor's units.
for (const table of ["cutters", "assemblers", "qcs"]) {
  const staff = await selectAll(table, "id, station_id");
  const bad = staff.filter((s) => !stationIds.has(s.station_id));
  check(
    `every ${table} row is on an internal station`,
    bad.length === 0,
    bad.length ? bad.map((s) => `${s.id}→${s.station_id}`).join(", ") : `${staff.length} rows`
  );
}

// ── 2. Every internal station has a settings row ───────────────────────────
// Missing ⇒ getSettingsAndOverrides falls back to 30/30/30 and that station
// silently paces itself against numbers nobody chose.
const settings = await selectAll("manufacturing_settings", "id, station_id");
const settingsByStation = new Set(settings.map((s) => s.station_id));
for (const station of stations) {
  check(
    `${station.name} has a capacity row`,
    settingsByStation.has(station.id),
    station.id
  );
}

// ── 3. NOTHING DISAPPEARED ─────────────────────────────────────────────────
// Every routed, in-zone, internal unit must have a schedule row for each of its
// windows. This is the assertion a botched station move would trip.
const units = await selectAll("units", "id, unit_number, status, manufacturing_partner_id, manufacturing_assigned_at");
const inZoneInternal = units.filter(
  (u) =>
    IN_ZONE.includes(u.status) &&
    stationIds.has(u.manufacturing_partner_id) &&
    u.manufacturing_assigned_at !== null
);

const rooms = await selectAll("rooms", "id, unit_id");
const roomsToUnit = new Map(rooms.map((r) => [r.id, r.unit_id]));
const windows = await selectAll("windows", "id, room_id");
const windowsByUnit = new Map();
for (const w of windows) {
  const unitId = roomsToUnit.get(w.room_id);
  if (!unitId) continue;
  if (!windowsByUnit.has(unitId)) windowsByUnit.set(unitId, new Set());
  windowsByUnit.get(unitId).add(w.id);
}

const schedule = await selectAll("window_manufacturing_schedule", "window_id, unit_id");
const scheduledByUnit = new Map();
for (const s of schedule) {
  if (!scheduledByUnit.has(s.unit_id)) scheduledByUnit.set(s.unit_id, new Set());
  scheduledByUnit.get(s.unit_id).add(s.window_id);
}

const missing = [];
for (const unit of inZoneInternal) {
  const expected = windowsByUnit.get(unit.id) ?? new Set();
  const actual = scheduledByUnit.get(unit.id) ?? new Set();
  const gap = [...expected].filter((w) => !actual.has(w));
  if (gap.length > 0) missing.push(`${unit.unit_number} (${gap.length}/${expected.size})`);
}
check(
  "every routed in-zone unit has schedule rows for all its windows",
  missing.length === 0,
  missing.length ? missing.slice(0, 8).join(", ") : `${inZoneInternal.length} units checked`
);

// ── 4. NOTHING IS BUILT TWICE ──────────────────────────────────────────────
// Computed from the real per-station membership, not assumed from the column.
const queueByStation = new Map(stations.map((s) => [s.id, new Set()]));
for (const unit of inZoneInternal) {
  for (const w of scheduledByUnit.get(unit.id) ?? []) {
    queueByStation.get(unit.manufacturing_partner_id)?.add(w);
  }
}
const overlaps = [];
const ids = [...queueByStation.keys()];
for (let i = 0; i < ids.length; i += 1) {
  for (let j = i + 1; j < ids.length; j += 1) {
    const a = queueByStation.get(ids[i]);
    const b = queueByStation.get(ids[j]);
    const shared = [...a].filter((w) => b.has(w));
    if (shared.length > 0) overlaps.push(`${ids[i]}∩${ids[j]}: ${shared.length} windows`);
  }
}
check(
  "per-station queues are pairwise disjoint",
  overlaps.length === 0,
  overlaps.length ? overlaps.join("; ") : ids.map((id) => `${id}=${queueByStation.get(id).size}`).join(", ")
);

// A vendor's unit must never carry in-house schedule rows — the other half of
// the same invariant, across the in-house↔vendor boundary.
const vendorUnitIds = new Set(
  units.filter((u) => !stationIds.has(u.manufacturing_partner_id)).map((u) => u.id)
);
const vendorWithSchedule = [...scheduledByUnit.keys()].filter((id) => vendorUnitIds.has(id));
check(
  "no subcontracted unit holds in-house schedule rows",
  vendorWithSchedule.length === 0,
  vendorWithSchedule.length ? `${vendorWithSchedule.length} units` : "clean"
);

// ── 5. Accounting: every in-zone window is somewhere, exactly once ──────────
const inZoneAll = units.filter((u) => IN_ZONE.includes(u.status));
const totalInZoneWindows = inZoneAll.reduce(
  (n, u) => n + (windowsByUnit.get(u.id)?.size ?? 0),
  0
);
const stationTotal = ids.reduce((n, id) => n + queueByStation.get(id).size, 0);
const vendorWindows = inZoneAll
  .filter((u) => !stationIds.has(u.manufacturing_partner_id))
  .reduce((n, u) => n + (windowsByUnit.get(u.id)?.size ?? 0), 0);
const unroutedWindows = inZoneAll
  .filter((u) => stationIds.has(u.manufacturing_partner_id) && u.manufacturing_assigned_at === null)
  .reduce((n, u) => n + (windowsByUnit.get(u.id)?.size ?? 0), 0);
check(
  "in-zone windows account for exactly: stations + vendors + unrouted",
  stationTotal + vendorWindows + unroutedWindows === totalInZoneWindows,
  `${stationTotal} + ${vendorWindows} + ${unroutedWindows} = ${
    stationTotal + vendorWindows + unroutedWindows
  } vs ${totalInZoneWindows} total`
);

console.log(
  `\n${failures === 0 ? "PASS" : `FAIL (${failures})`} — ${inZoneAll.length} in-zone units, ` +
    `${totalInZoneWindows} windows\n`
);
process.exit(failures === 0 ? 0 : 1);
