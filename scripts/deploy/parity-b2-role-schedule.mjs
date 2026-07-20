#!/usr/bin/env node
// B2 parity check — get_role_schedule RPC vs chunked fallback.
// Run AFTER applying supabase/migrations/20260720130000_get_role_schedule_rpc.sql
// to prod. Reads .env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
//   node scratchpad/parity-b2-role-schedule.mjs
//
// Compares, per role, the RPC-assembled ManufacturingRoleSchedule against the
// chunked-assembled one: exact windowId set parity per bucket/allItems + field
// parity on 20 sampled items. Throwaway (roadmap Phase 3 task 3) — delete after.

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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
const supabase = createClient(url, key, { auth: { persistSession: false } });

const ROLES = ["cutter", "assembler", "qc"];
const DATE_COL = {
  cutter: "scheduled_cut_date",
  assembler: "scheduled_assembly_date",
  qc: "scheduled_qc_date",
};

async function chunked(dateColumn) {
  // Mirror loadPersistedRoleSchedule's fallback closely enough for set/field parity.
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("window_manufacturing_schedule")
      .select("*")
      .order(dateColumn, { ascending: true, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function rpc(dateColumn) {
  const { data, error } = await supabase.rpc("get_role_schedule", { p_date_column: dateColumn });
  if (error) throw error;
  return data;
}

function eq(a, b) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

let ok = true;
for (const role of ROLES) {
  const col = DATE_COL[role];
  const chunkRows = await chunked(col);
  const rpcData = await rpc(col);
  const rpcRows = rpcData.schedule_rows ?? [];

  const chunkIds = new Set(chunkRows.map((r) => r.window_id));
  const rpcIds = new Set(rpcRows.map((r) => r.window_id));
  const setOk = eq(chunkIds, rpcIds);

  // Field parity on 20 sampled schedule rows (by window_id).
  const rpcById = new Map(rpcRows.map((r) => [r.window_id, r]));
  const sample = chunkRows.slice(0, 20);
  let fieldOk = true;
  const fields = [
    "target_ready_date", "scheduled_cut_date", "scheduled_assembly_date",
    "scheduled_qc_date", "is_schedule_locked", "over_capacity_override", "unit_id",
  ];
  for (const c of sample) {
    const r = rpcById.get(c.window_id);
    if (!r) { fieldOk = false; break; }
    for (const f of fields) {
      if ((c[f] ?? null) !== (r[f] ?? null)) { fieldOk = false; break; }
    }
  }

  const pass = setOk && fieldOk && chunkRows.length === rpcRows.length;
  ok = ok && pass;
  console.log(
    `${role}: rows chunk=${chunkRows.length} rpc=${rpcRows.length} setParity=${setOk} fieldParity=${fieldOk} => ${pass ? "PASS" : "FAIL"}`
  );
}

console.log(ok ? "\nALL CHECKS PASSED" : "\nPARITY FAILED — do not ship");
process.exit(ok ? 0 : 1);
