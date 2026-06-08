#!/usr/bin/env node
/**
 * backup-snapshot.mjs — credential-light logical backup of FSR Blinds.
 *
 * Uses only the SUPABASE service-role key (no Postgres password, no extra tools)
 * to export every public table as JSON and download every Storage object. This is
 * the "I want a backup right now / I don't have the DB password handy" path, and a
 * manual disaster-recovery fallback. The nightly GitHub Action uses a full pg_dump
 * (scripts/backup-run.sh) instead, which is more complete.
 *
 * Reads credentials from the environment, falling back to .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY      (server-only secret; never logged)
 *
 * Usage:
 *   node scripts/backup-snapshot.mjs               # full: data + storage -> ./backup/<stamp>/
 *   node scripts/backup-snapshot.mjs --data-only   # tables only, skip photo download
 *   node scripts/backup-snapshot.mjs --measure     # count rows + storage objects, download nothing
 *   node scripts/backup-snapshot.mjs --out DIR     # custom output root (default ./backup)
 *
 * Output layout: <out>/<UTC-timestamp>/
 *   data/<table>.json   one file per table (full rows)
 *   storage/<bucket>/... downloaded objects, original paths preserved
 *   manifest.json        per-table row counts, per-bucket object counts + bytes
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// --- Tables to export (public schema). Keep in sync with supabase/migrations. ---
const TABLES = [
  "clients", "buildings", "units", "rooms", "windows",
  "installers", "cutters", "schedulers", "manufacturers", "qcs", "qc_persons",
  "schedule_entries", "scheduler_unit_assignments", "scheduler_building_access",
  "unit_activity_log", "daily_progress_snapshots",
  "media_uploads", "owner_verification_photos",
  "notifications", "notification_reads",
  "window_production_status", "window_manufacturing_schedule",
  "window_manufacturing_escalations",
  "window_post_install_issues", "window_post_install_issue_notes",
  "manufacturing_settings", "manufacturing_calendar_overrides",
  "user_profiles",
];
const BUCKETS = ["fsr-media", "fsr-owner-verification"];
const PAGE = 1000;

// --- args ---
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const MEASURE = flag("--measure");
const DATA_ONLY = flag("--data-only");
const OUT_ROOT = opt("--out", "./backup");

// --- env (process.env first, then .env.local) ---
async function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env.local — rely on process.env */ }
  return env;
}

const env = await loadEnv();
const SUPABASE_URL = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (env or .env.local).");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(OUT_ROOT, stamp);
const human = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);

// --- table export (paginated via Range header) ---
async function exportTable(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: { ...H, Range: `${from}-${to}`, "Range-Unit": "items", Prefer: "count=none" },
    });
    if (res.status === 404 || res.status === 400) {
      console.warn(`  ! ${table}: skipped (${res.status} — table absent or not exposed)`);
      return { table, rows: null, skipped: true };
    }
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  if (!MEASURE) {
    const f = join(outDir, "data", `${table}.json`);
    await mkdir(dirname(f), { recursive: true });
    await writeFile(f, JSON.stringify(rows, null, 0));
  }
  return { table, rows: rows.length, skipped: false };
}

// --- recursive storage listing ---
async function listBucket(bucket, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`list ${bucket}/${prefix}: ${res.status} ${await res.text()}`);
    const items = await res.json();
    for (const it of items) {
      const path = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null && it.metadata === null) {
        out.push(...await listBucket(bucket, path)); // folder -> recurse
      } else {
        out.push({ path, size: it.metadata?.size ?? 0 });
      }
    }
    if (items.length < 100) break;
  }
  return out;
}

async function downloadObject(bucket, path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`, { headers: H });
  if (!res.ok) throw new Error(`download ${bucket}/${path}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const f = join(outDir, "storage", bucket, path);
  await mkdir(dirname(f), { recursive: true });
  await writeFile(f, buf);
  return buf.length;
}

// --- run ---
console.log(`FSR Blinds snapshot  (${MEASURE ? "MEASURE" : DATA_ONLY ? "DATA-ONLY" : "FULL"})`);
console.log(`Project: ${SUPABASE_URL}`);
if (!MEASURE) console.log(`Output : ${outDir}`);
console.log("");

const manifest = { createdAt: new Date().toISOString(), project: SUPABASE_URL, tables: {}, storage: {} };

console.log("== Tables ==");
let totalRows = 0;
for (const t of TABLES) {
  const r = await exportTable(t);
  if (!r.skipped) { totalRows += r.rows; manifest.tables[t] = r.rows; console.log(`  ${t.padEnd(34)} ${r.rows} rows`); }
}
console.log(`  -> ${totalRows} rows across ${Object.keys(manifest.tables).length} tables`);

if (!DATA_ONLY) {
  console.log("\n== Storage ==");
  for (const bucket of BUCKETS) {
    const objs = await listBucket(bucket);
    const totalBytes = objs.reduce((s, o) => s + o.size, 0);
    manifest.storage[bucket] = { objects: objs.length, bytes: totalBytes };
    console.log(`  ${bucket.padEnd(26)} ${objs.length} objects, ${human(totalBytes)}`);
    if (!MEASURE) {
      let done = 0, downloaded = 0;
      for (const o of objs) { downloaded += await downloadObject(bucket, o.path); if (++done % 25 === 0) process.stdout.write(`\r    downloaded ${done}/${objs.length}...`); }
      process.stdout.write(`\r    downloaded ${objs.length}/${objs.length} (${human(downloaded)})        \n`);
    }
  }
}

if (!MEASURE) {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nSnapshot written to ${outDir}`);
} else {
  console.log("\n(measure only — nothing downloaded)");
}
