// READ-ONLY pre-flight gate for MR3 (plan §3.6). No writes.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(
  readFileSync("/Users/sergeikorolev/5. Vibe coding/260322-FSRblinds/.env.local", "utf8")
    .split("\n").filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function all(table, cols) {
  let out = [], from = 0;
  for (;;) {
    const { data, error } = await db.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out = out.concat(data);
    if (data.length < 1000) return out;
    from += 1000;
  }
}

const units = await all("units", "id,status,installed_at,all_measured_at,production_entered_at,manufacturing_partner_id,manufacturing_assigned_at,window_count");
const sched = await all("window_manufacturing_schedule", "unit_id");
const scheduledIds = new Set(sched.map((r) => r.unit_id));
const byId = new Map(units.map((u) => [u.id, u]));

const nullAssigned = units.filter((u) => u.manufacturing_assigned_at === null);
const external = units.filter((u) => u.manufacturing_partner_id !== "mp-internal");
const hasActivity = (u) =>
  u.all_measured_at !== null || u.production_entered_at !== null ||
  u.installed_at !== null || u.status !== "not_started";

// (a) MUST BE 0 — scheduled units the backfill would miss.
const a = [...scheduledIds].filter((id) => {
  const u = byId.get(id);
  return u && u.manufacturing_assigned_at === null && !hasActivity(u);
}).length;

// (b) Expected 0 — external units without a timestamp.
const b = external.filter((u) => u.manufacturing_assigned_at === null).length;

// (b2) Expected 0 — installed units that are subcontracted.
const b2 = units.filter((u) =>
  (u.status === "installed" || u.installed_at !== null) && u.manufacturing_partner_id !== "mp-internal").length;

// (c) Rows the backfill will touch.
const a1 = nullAssigned.filter((u) => u.status === "installed" || u.installed_at !== null).length;
const a2 = nullAssigned.filter((u) =>
  !(u.status === "installed" || u.installed_at !== null) && (hasActivity(u) ||
   u.manufacturing_partner_id !== "mp-internal" || scheduledIds.has(u.id))).length;

// MR2 dashboard bucket, now and after backfill.
const bucketNow = units.filter((u) =>
  u.status !== "installed" && u.manufacturing_assigned_at === null && (u.window_count ?? 0) > 0).length;
const bucketAfter = units.filter((u) =>
  u.status !== "installed" && u.manufacturing_assigned_at === null && (u.window_count ?? 0) > 0 &&
  !(hasActivity(u) || u.manufacturing_partner_id !== "mp-internal" || scheduledIds.has(u.id))).length;

const gate = (label, val, want) =>
  `${val === want ? "PASS" : "FAIL"}  ${label.padEnd(52)} ${val} (want ${want})`;

console.log("=== MR3 PRE-FLIGHT (read-only) " + new Date().toISOString() + " ===\n");
console.log(gate("(a) scheduled units the backfill misses", a, 0));
console.log(gate("(b) external units with no routing timestamp", b, 0));
console.log(gate("(b2) installed units that are subcontracted", b2, 0));
console.log("\n--- census ---");
console.log(`units total                       ${units.length}`);
console.log(`external (not mp-internal)        ${external.length}   <-- literal for the §3.6 step-3 guard`);
console.log(`manufacturing_assigned_at IS NULL ${nullAssigned.length}`);
console.log(`scheduled units (in queue)        ${scheduledIds.size}`);
console.log("\n--- backfill impact ---");
console.log(`(a1) installed units stamped      ${a1}`);
console.log(`(a2) activity units stamped       ${a2}`);
console.log(`total stamped                     ${a1 + a2}`);
console.log(`left unrouted afterwards          ${nullAssigned.length - a1 - a2}`);
console.log("\n--- MR2 dashboard bucket ---");
console.log(`before backfill                   ${bucketNow}`);
console.log(`after backfill                    ${bucketAfter}`);
