#!/usr/bin/env node
// Perf budget gate: measures the shared-base JS and the heaviest routes' first-load
// gz size from a completed `next build` output, and fails if either regresses past
// scripts/perf-budget.baseline.json. Methodology: docs/refactor/PERF_BASELINE.md.
//
// Run after `npm run build` (needs .next/ to exist).

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nextDir = path.join(root, ".next");
const baselinePath = path.join(root, "scripts", "perf-budget.baseline.json");

const SHARED_BASE_LIMIT_KB = 175;
const ROUTE_GROWTH_LIMIT_PCT = 10;

// Routes tracked for regression (the heaviest routes as of the 2026-07-19 baseline).
const TRACKED_ROUTES = [
  "/management/units",
  "/management/schedule",
  "/scheduler/units",
  "/management",
  "/cutter/queue",
];

function fail(message) {
  console.error(`[perf-budget] FAIL: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(nextDir)) {
  console.error("[perf-budget] .next/ not found — run `npm run build` first.");
  process.exit(1);
}

const gzKbCache = new Map();
function gzKb(chunkFile) {
  const relPath = chunkFile.replace(/^\/?_next\//, "");
  if (gzKbCache.has(relPath)) return gzKbCache.get(relPath);
  let size = 0;
  try {
    const buf = readFileSync(path.join(nextDir, relPath));
    size = gzipSync(buf, { level: 6 }).length / 1024;
  } catch {
    size = 0;
  }
  gzKbCache.set(relPath, size);
  return size;
}

// --- Shared base (loaded on every route): rootMainFiles + polyfillFiles from build-manifest.json ---
const buildManifest = JSON.parse(readFileSync(path.join(nextDir, "build-manifest.json"), "utf8"));
const sharedFiles = new Set([...(buildManifest.rootMainFiles ?? []), ...(buildManifest.polyfillFiles ?? [])]);
const sharedBaseKb = [...sharedFiles].reduce((sum, f) => sum + gzKb(`static/${f.replace(/^static\//, "")}`), 0);

// --- Per-route first-load JS: parse each route's client-reference-manifest.js for its chunk list ---
function findManifests(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findManifests(full));
    } else if (entry.name.endsWith("_client-reference-manifest.js")) {
      out.push(full);
    }
  }
  return out;
}

function routeNameFromManifestPath(manifestPath) {
  const rel = path.relative(path.join(nextDir, "server", "app"), manifestPath);
  const withoutSuffix = rel.replace(/[\\/]page_client-reference-manifest\.js$/, "");
  return "/" + withoutSuffix.split(path.sep).filter(Boolean).join("/");
}

const manifestFiles = findManifests(path.join(nextDir, "server", "app"));
const routeChunksKb = new Map();

for (const manifestPath of manifestFiles) {
  const routeName = routeNameFromManifestPath(manifestPath) || "/";
  if (!TRACKED_ROUTES.includes(routeName)) continue;

  const src = readFileSync(manifestPath, "utf8");
  const match = src.match(/__RSC_MANIFEST\[[^\]]+\]\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) continue;
  let manifest;
  try {
    manifest = JSON.parse(match[1]);
  } catch {
    continue;
  }

  const chunkFiles = new Set(sharedFiles);
  for (const mod of Object.values(manifest.clientModules ?? {})) {
    for (const chunk of mod.chunks ?? []) {
      chunkFiles.add(chunk.replace(/^\/_next\//, ""));
    }
  }

  const totalKb = [...chunkFiles].reduce((sum, f) => sum + gzKb(f), 0);
  routeChunksKb.set(routeName, totalKb);
}

// --- Compare against baseline ---
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;

console.log(`[perf-budget] shared base: ${sharedBaseKb.toFixed(1)} kB gz (limit ${SHARED_BASE_LIMIT_KB} kB)`);
if (sharedBaseKb > SHARED_BASE_LIMIT_KB) {
  fail(`shared base ${sharedBaseKb.toFixed(1)} kB exceeds ${SHARED_BASE_LIMIT_KB} kB limit`);
}

for (const route of TRACKED_ROUTES) {
  const kb = routeChunksKb.get(route);
  if (kb === undefined) {
    console.warn(`[perf-budget] WARN: no manifest found for tracked route ${route} (skipping)`);
    continue;
  }
  const baseKb = baseline?.routes?.[route];
  if (baseKb === undefined) {
    console.log(`[perf-budget] ${route}: ${kb.toFixed(1)} kB gz (no baseline to compare)`);
    continue;
  }
  const growthPct = ((kb - baseKb) / baseKb) * 100;
  console.log(
    `[perf-budget] ${route}: ${kb.toFixed(1)} kB gz (baseline ${baseKb.toFixed(1)} kB, ${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%)`
  );
  if (growthPct > ROUTE_GROWTH_LIMIT_PCT) {
    fail(`${route} grew ${growthPct.toFixed(1)}% over baseline (limit ${ROUTE_GROWTH_LIMIT_PCT}%)`);
  }
}

if (!baseline) {
  console.log("[perf-budget] no baseline file found — run again after committing scripts/perf-budget.baseline.json");
}

if (process.exitCode === 1) {
  console.error("[perf-budget] budget exceeded — see failures above.");
} else {
  console.log("[perf-budget] OK");
}
