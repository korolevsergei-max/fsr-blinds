# Performance Baseline

Date: 2026-06-01  
Next.js: 16.2.1 (Turbopack)  
Commit: post-instrumentation setup (dead deps removed, Speed Insights added, optimizePackageImports enabled)

## Notes on measurement

This build uses Turbopack, which does **not** emit the per-route "First Load JS" table that webpack-mode builds do. Sizes below are extracted from `.next/static/chunks` and the shared chunk list in each route's `build-manifest.json`.

All sizes are **uncompressed / gzip-compressed** (simulated at level 6).

---

## Shared base bundle (loaded on every route)

These 7 chunks appear in every route's `build-manifest.json` under `polyfillFiles` + `rootMainFiles`:

| Chunk | Raw | Gzip |
|---|---|---|
| `03~yq9q893hmn.js` (polyfills) | 110.0 kB | 38.5 kB |
| `092ppf.jo5imc.js` (framework) | 221.0 kB | 69.0 kB |
| `0o9k22~.s6xvc.js` | 107.0 kB | 28.4 kB |
| `0dnfuohlb8jlh.js` | 43.4 kB | 9.0 kB |
| `072wl6lcnqcg1.js` | 32.9 kB | 9.4 kB |
| `08.gdx.x9-k0w.js` | 30.6 kB | 9.6 kB |
| `turbopack-177-p9tqjbfh7.js` | 10.3 kB | 4.1 kB |
| **Total shared** | **555.2 kB** | **168.2 kB** |

All main routes (`/login`, `/management`, `/cutter`, `/installer`, `/assembler`, `/qc`, `/scheduler`) load the same shared base. Route-specific split chunks are additional on top of this.

## Total static JS (all 108 chunks)

| Metric | Value |
|---|---|
| Raw | 5,163 kB |
| Gzip (≈ wire size) | 1,498 kB |
| Chunk count | 108 |

## What changed in this commit

- Removed `lucide-react` from dependencies (confirmed 0 imports in `src/`)
- Moved `xlsx` to devDependencies (only used in `scripts/`, not `src/`)
- Added `optimizePackageImports` for `@phosphor-icons/react` and `framer-motion`
- Added `compiler.removeConsole` (strips `console.*` except `console.error` in prod)
- Added `@next/bundle-analyzer` + `npm run analyze` script
- Added `@vercel/speed-insights` for real-user LCP/INP/TTFB monitoring

## How to compare in future PRs

Run `npm run build` and compare the shared bundle total and overall chunk sizes. For a proper per-route diff, run `npm run analyze` (requires `ANALYZE=true next build`) and compare the Webpack bundle treemap.

When Turbopack adds bundle size reporting, update this methodology.

---

## React Compiler enablement (PR: `perf/react-compiler`)

Enabled the React Compiler (`reactCompiler: true` in `next.config.ts`, `babel-plugin-react-compiler@1.0.0` devDep). The compiler auto-memoizes components/hooks at build time to cut runtime re-renders — it does **not** shrink the bundle; it adds a small memoization-cache layer per component, so JS size grows slightly. The win is fewer re-renders when the shared dataset store is patched by Supabase Realtime, not a smaller download.

Apples-to-apples, **same commit**, `.next/static/chunks` (raw / gzip level 6):

| Build | Chunks | Raw | Gzip |
|---|---|---|---|
| Compiler **off** | 108 | 5,287.4 kB | 1,533.7 kB |
| Compiler **on** | 110 | 5,598.0 kB | 1,684.2 kB |
| **Delta** | +2 | **+310.6 kB (+5.9%)** | **+150.5 kB (+9.8%)** |

(Note: the original baseline table above, 1,498 kB gzip, predates several feature commits, so the compiler-off number here is the correct reference point for this delta.)

Verification at enablement: `npm run build` ✓, `npm run typecheck` ✓, `npm run test` ✓ (79/79). `npm run lint` has one **pre-existing** error (`react-hooks/set-state-in-effect` in `manufacturing-role-queue.tsx:148`) and pre-existing unused-var warnings — present on `main`, not introduced by the compiler. Compiler transform confirmed on real components (e.g. `accounts-manager.tsx` → 7 memo caches, `button.tsx`/`cutter-queue.tsx` → 1 each, all importing `react/compiler-runtime`). `/management` and `/cutter` smoke-tested via dev server: normal 307→`/login` auth redirects, no runtime errors.

---

## Phase 0 measurement refresh (2026-06-27)

Purpose: refresh and extend the 2026-06-01 baseline for the navigation performance playbook. This pass made no application behavior changes; it only ran build/inspection commands and updated this document.

### Measurement environment

| Item | Value |
|---|---|
| Local machine | macOS darwin 24.6.0 |
| Node / npm | Node `v24.10.0`, npm `11.6.2` |
| Next.js | `16.2.1` |
| Build command | `npm run analyze` (`ANALYZE=true next build`) |
| Vercel CLI | `50.28.0`, authenticated as `korolevsergei-max`, project `fsr-blinds` linked |
| Supabase CLI | `2.84.2`, linked project `FSRblinds` / `fbjjqfmsroryfgfushmb` |
| Browser lab tooling | No `lighthouse` CLI or detectable Chrome binary available in this session |

`npm run analyze` completed successfully. Next reported that `@next/bundle-analyzer` is not compatible with Turbopack builds and suggested `next experimental-analyze` or `next build --webpack`, so this refresh keeps the existing manifest-based Turbopack methodology: gzip `.next/static/**/*.js` at level 6 and combine root build-manifest chunks with each route's `page_client-reference-manifest.js` `entryJSFiles`.

### Bundle baseline

Shared base JS is unchanged from the original 2026-06-01 measurement:

| Metric | Raw | Gzip | Chunks |
|---|---:|---:|---:|
| Shared base loaded on every route | 555.2 kB | 168.2 kB | 7 |
| Total static JS in `.next/static` | 5,472.0 kB | 1,653.6 kB | 121 |

Change versus original baseline: shared base is flat at `168.2 kB gzip`; total static JS is up from `1,498 kB gzip` to `1,653.6 kB gzip` (`+155.6 kB`, `+13` chunks). Change versus the React Compiler-on note above: total static JS is down from `1,684.2 kB gzip` to `1,653.6 kB gzip` (`-30.6 kB`).

Estimated first-load JS by hot route, using shared root chunks plus route entry chunks:

| Route | First-load JS raw | First-load JS gzip | Additional route JS gzip |
|---|---:|---:|---:|
| `/management/units` | 1,161.3 kB | 346.2 kB | 178.0 kB |
| `/management/schedule` | 1,124.1 kB | 336.8 kB | 168.6 kB |
| `/scheduler/units` | 1,123.7 kB | 336.1 kB | 167.9 kB |
| `/management` | 1,109.8 kB | 331.2 kB | 163.0 kB |
| `/scheduler` | 1,099.8 kB | 328.4 kB | 160.3 kB |
| `/installer/schedule` | 1,086.1 kB | 327.1 kB | 159.0 kB |
| `/installer` | 1,042.6 kB | 312.6 kB | 144.4 kB |
| `/cutter/queue` | 876.7 kB | 268.1 kB | 99.9 kB |
| `/assembler/queue` | 854.6 kB | 263.0 kB | 94.9 kB |
| `/qc/queue` | 854.2 kB | 262.7 kB | 94.5 kB |
| `/cutter` | 848.4 kB | 261.2 kB | 93.0 kB |
| `/assembler` | 846.3 kB | 260.7 kB | 92.5 kB |
| `/qc` | 845.9 kB | 260.3 kB | 92.2 kB |
| `/login` | 866.5 kB | 254.9 kB | 86.7 kB |

Heaviest static JS chunks in the current production build:

| Chunk | Raw | Gzip |
|---|---:|---:|
| `static/chunks/0~nzzthts-ri4.js` | 408.6 kB | 129.3 kB |
| `static/chunks/0o4fy.y5zv7p-.js` | 226.2 kB | 70.6 kB |
| `static/chunks/0xcdez3003l_x.js` | 220.6 kB | 53.5 kB |
| `static/chunks/0gr69n4ollusm.js` | 204.2 kB | 54.4 kB |
| `static/chunks/11clafn-hp5lf.js` | 193.4 kB | 44.2 kB |
| `static/chunks/0w.plr96fhqf5.js` | 153.5 kB | 48.1 kB |
| `static/chunks/0k66q~kkxj180.js` | 130.5 kB | 42.9 kB |
| `static/chunks/0~o8yjb-li-m2.js` | 130.5 kB | 42.8 kB |

The route manifests show the common heavy route chunks behind management/scheduler screens are `0gr69n4ollusm.js` (`54.4 kB gzip`) and `0k66q~kkxj180.js` (`42.9 kB gzip`). Installer pulls `0gr69n4ollusm.js` plus `0~o8yjb-li-m2.js` (`42.8 kB gzip`). Cutter/assembler/QC queue routes are lighter but still add about `94-100 kB gzip` above the shared base.

### Route loader timing and dataset counts

Code instrumentation still exists for:

- `[full-load] management units=... rooms=...→0 windows=...→0 schedule=... ...ms`
- `[scoped-load] scheduler=... units=... rooms=... windows=... ...ms`
- `[scoped-load] installer=... units=... rooms=... windows=... ...ms`
- `[unit-status-drift] ...`

Vercel production log queries returned no matching `[full-load]`, `[scoped-load]`, or `[unit-status-drift]` entries for the last `168h`, so this pass could not capture representative authenticated route loader timings from logs. Local terminals also had no recent server output. The counts below are direct read-only database counts from the linked Supabase project:

| Table | Rows |
|---|---:|
| `clients` | 2 |
| `buildings` | 5 |
| `units` | 460 |
| `rooms` | 866 |
| `windows` | 1,989 |
| `schedule_entries` | 387 |
| `window_production_status` | 1,939 |
| `window_manufacturing_schedule` | 1,570 |
| `notifications` | 870 |
| `notification_reads` | 662 |

`EXPLAIN (ANALYZE, BUFFERS) select public.get_full_dataset();` on this dataset:

| Plan | Execution | Buffers |
|---|---:|---:|
| `Result` calling `get_full_dataset()` | 194.199 ms | shared hit=1,617 |

The RPC still builds a full dataset server-side, then the owner path drops raw `rooms` and `windows` before sending the client payload.

### Supabase diagnostics

`supabase inspect db db-stats` reported:

| Metric | Value |
|---|---:|
| Database size | 24 MB |
| Total table size | 5,568 kB |
| Total index size | 3,664 kB |
| Stats age | 96 days 14:51 |
| Index hit rate | 1.00 |
| Table hit rate | 1.00 |
| WAL size | 128 MB |

Historical `pg_stat_statements` top database time is dominated by platform/realtime/auth volume:

| Query shape | Total time | Calls | Share |
|---|---:|---:|---:|
| `realtime.list_changes(...)` | 36m 19.705s | 324,780 | 23.3% |
| request/session `set_config(...)` | 13m 48.163s | 799,154 | 8.9% |
| `windows` by `id = ANY(...)` | 7m 13.154s | 60,042 | 4.6% |
| auth `users` by id | 3m 26.723s | 194,695 | 2.2% |
| `window_manufacturing_escalations` by window/status | 1m 38.963s | 60,341 | 1.1% |
| `user_profiles` role lookup by id | 1m 23.282s | 114,634 | 0.9% |
| auth sessions by id | 1m 21.869s | 197,822 | 0.9% |

High sequential-scan counts on hot app tables:

| Table | Estimated rows | Seq scans |
|---|---:|---:|
| `rooms` | 866 | 17,191 |
| `units` | 460 | 15,498 |
| `windows` | 1,989 | 13,186 |
| `window_manufacturing_escalations` | 10 | 14,949 |
| `installers` | 6 | 9,755 |
| `scheduler_unit_assignments` | 460 | 5,917 |
| `window_manufacturing_schedule` | 1,570 | 5,330 |
| `window_production_status` | 1,939 | 4,209 |
| `schedule_entries` | 387 | 3,356 |

Relevant index observations:

- `window_manufacturing_schedule` has single-column date indexes and they are used: `idx_window_manufacturing_schedule_cut_date` (6,283 scans), `idx_window_manufacturing_schedule_assembly_date` (1,018), `idx_window_manufacturing_schedule_qc_date` (752).
- `window_manufacturing_schedule_window_id_key` is very hot (3,300,549 scans), as is `window_production_status_window_id_key` (890,656).
- `scheduler_unit_assignments_unit_id_key` exists and has 1,697 scans; `idx_sua_scheduler_id` exists but only 2 scans in the current stats window.
- `idx_units_status` exists but shows 0 scans; this does not cover `window_production_status.status`, which remains a Phase 1 index candidate.
- `schedule_entries` has `idx_schedule_entries_task_date` and `idx_schedule_entries_unit_id`; no observed `status` index in the index report.
- `notification_reads` has no composite index covering the unread-count/read-list filters (`user_role`, `user_id`, `notification_id`); the current sample query sequentially scanned all 662 rows.

### Hot query EXPLAINs

Current manufacturing schedule reads order by role date and pull the first 1,000 rows from the full table before application-side role/status filtering:

| Query | Plan | Execution | Buffers |
|---|---|---:|---:|
| schedule ordered by `scheduled_cut_date` | index scan on `idx_window_manufacturing_schedule_cut_date` | 65.499 ms | shared hit=281 |
| schedule ordered by `scheduled_assembly_date` | index scan on `idx_window_manufacturing_schedule_assembly_date` | 7.928 ms | shared hit=278 |
| schedule ordered by `scheduled_qc_date` | index scan on `idx_window_manufacturing_schedule_qc_date` | 13.623 ms | shared hit=276 |

The date indexes avoid a table sort, but the application still scans across the schedule globally (`1,570` rows today, paginated in `1,000`-row pages) and only later filters by production state. Phase 1 should beat these by adding DB-level role/status/date scoping and by removing read-triggered reflows.

Notification queries:

| Query | Plan | Execution | Notes |
|---|---|---:|---|
| `notifications` by recipient role/id ordered by `created_at desc` | `notifications_recipient_idx` + small sort | 1.203 ms | healthy on current data |
| `notification_reads` by user role/id | sequential scan | 3.066 ms | scanned 662 rows; add/verify composite index if this grows |

### Realtime and auth findings

The database stats reinforce the realtime/auth concerns in the navigation audit:

- Realtime polling is the largest historical DB consumer in this stats window (`36m19s`, `324,780` calls). The client still opens one broad sync channel with multiple table listeners, and `windows` changes are unfiltered at the subscription layer.
- Installer bottom nav and scheduler nav each open two extra notification channels (`notifications` and `notification_reads`) in addition to the main realtime sync channel. The notification list page opens another pair while mounted.
- Middleware still calls `supabase.auth.getUser()` on each matched navigation, and `getCurrentUser()` still calls `getUser()` again in layouts/pages, then reads `user_profiles`. The database stats show this shape clearly: auth user/session queries are called ~195k-198k times, and `user_profiles` role lookups are called 114,634 times in the current stats window.

### Weak-network and RUM status

The service worker/app-shell gap remains verified in code: `public/sw.js` deletes all `fsr-*` caches and unregisters itself on activate, and `ServiceWorkerRegistrar` unregisters all service workers and deletes `fsr-*` caches on mount. Combined with the bundle numbers above, every cold visit still pays the `168.2 kB gzip` shared base plus route chunks, with no app-shell cache reuse.

This session did not produce real-user or Chrome Slow 4G timings:

| Requested Phase 0 item | Status |
|---|---|
| Vercel Speed Insights LCP / INP / TTFB by route | Not captured. Vercel CLI is authenticated, but no CLI/API surface for reading Speed Insights rollups was available; the public docs found in this session describe the intake API, not a metrics-read API. Capture manually from the Vercel dashboard for owner, scheduler, installer, cutter, assembler, and QC routes. |
| Chrome DevTools Slow 4G + 4x CPU per role | Not captured. No Chrome/Lighthouse automation was available in this environment, and authenticated role sessions were not available to replay all portals. Capture manually with DevTools Network set to Slow 4G and Performance CPU set to 4x slowdown. |
| Concurrency probe | Not run. Keep staging-only and run after Phase 1 so it can demonstrate that queue page views no longer trigger facility-wide reflows. |

Manual Slow 4G capture checklist for the next pass:

| Role | Cold first paint | Cold interactive | Warm first paint | Warm interactive | Notes |
|---|---:|---:|---:|---:|---|
| Owner `/management` | TBD | TBD | TBD | TBD | Include `/management/units` and `/management/schedule` because they are the JS-heavy routes. |
| Scheduler `/scheduler` | TBD | TBD | TBD | TBD | Include `/scheduler/units`. |
| Installer `/installer` | TBD | TBD | TBD | TBD | Include `/installer/schedule` and offline upload smoke check. |
| Cutter `/cutter` | TBD | TBD | TBD | TBD | Include `/cutter/queue`. |
| Assembler `/assembler` | TBD | TBD | TBD | TBD | Include `/assembler/queue`. |
| QC `/qc` | TBD | TBD | TBD | TBD | Include `/qc/queue`. |

### Ranked baseline for later phases

Weak-connection axis:

| Rank | Offender | Phase to beat | Current number / evidence |
|---:|---|---|---|
| 1 | No app-shell caching | Phase 2 | SW and registrar unregister/delete caches; every route pays `168.2 kB gzip` shared JS plus route chunks. |
| 2 | Management/scheduler route JS | Phase 7 | `/management/units` `346.2 kB gzip`, `/management/schedule` `336.8 kB`, `/scheduler/units` `336.1 kB`. |
| 3 | Owner full dataset server work | Phase 4 | `get_full_dataset()` `194.199 ms`, `1,617` shared buffers on current small dataset; raw rooms/windows still built server-side before JS discards them. |
| 4 | Missing browser/RUM numbers | Phase 0 follow-up | Speed Insights and Slow 4G route timings still need manual capture. |

Many-users axis:

| Rank | Offender | Phase to beat | Current number / evidence |
|---:|---|---|---|
| 1 | Realtime fan-out | Phase 6 | `realtime.list_changes(...)` is the largest DB time bucket: `36m19.705s`, `324,780` calls, `23.3%` of total execution time. |
| 2 | Queue read path still schedules reflows | Phase 1 | Cutter/assembler/QC/management schedule pages still run `reflowManufacturingSchedules("load_queue")` after views; `loadPersistedRoleSchedule()` still self-heals inline if schedules are missing. |
| 3 | Manufacturing schedule global read | Phase 1 | Role reads use date indexes but still scan first `1,000` rows from the global `1,570`-row schedule; cutter sample took `65.499 ms`. |
| 4 | Auth/session repeat work | Phase 3 | Auth/session/user/profile shapes are heavily called: auth users ~194,695 calls, sessions ~197,822 calls, `user_profiles` role lookups 114,634 calls. |
| 5 | Notification read filters | Phase 6 or DB hardening | `notification_reads` role/user sample is a sequential scan over 662 rows (`3.066 ms` now, growth risk). |

---

## Phase 8 after-section (2026-06-28)

Purpose: finalize the navigation performance phases with a DB-hardening pass and regression evidence. This pass added one index migration, measured the current build, and documented the remaining manual/staging checks.

### Verification environment

| Item | Value |
|---|---|
| Local machine | macOS darwin 24.6.0 |
| Node / npm | Node `v24.10.0`, npm `11.6.2` |
| Next.js | `16.2.1` |
| Build command | `npm run analyze` (`ANALYZE=true next build`) |
| Supabase CLI | `2.84.2`, linked project `fbjjqfmsroryfgfushmb` |
| Vercel env check | `vercel env ls` showed Supabase URL/key env vars only; no `DATABASE_URL`/raw Postgres env var |

`npm run analyze` passed. The Next bundle-analyzer plugin still reports that it is not compatible with Turbopack, so bundle sizes below use the same manifest + gzip methodology as Phase 0.

### Bundle after current phases

| Metric | Phase 0 gzip | Phase 8 gzip | Delta |
|---|---:|---:|---:|
| Shared base loaded on every route | 168.2 kB | 168.2 kB | 0.0 kB |
| Total static JS in `.next/static` | 1,653.6 kB | 1,447.0 kB | -206.6 kB |

Total static JS is now `4,869.2 kB raw / 1,447.0 kB gzip` across `113` chunks. The shared base remains `555.2 kB raw / 168.2 kB gzip` across `7` chunks.

Hot-route first-load JS after the current phases:

| Route | Phase 0 gzip | Phase 8 gzip | Delta |
|---|---:|---:|---:|
| `/management/units` | 346.2 kB | 301.1 kB | -45.1 kB |
| `/management/schedule` | 336.8 kB | 292.2 kB | -44.6 kB |
| `/scheduler/units` | 336.1 kB | 291.0 kB | -45.1 kB |
| `/management` | 331.2 kB | 286.4 kB | -44.8 kB |
| `/scheduler` | 328.4 kB | 283.6 kB | -44.8 kB |
| `/installer/schedule` | 327.1 kB | 282.5 kB | -44.6 kB |
| `/installer` | 312.6 kB | 269.7 kB | -42.9 kB |
| `/cutter/queue` | 268.1 kB | 223.4 kB | -44.7 kB |
| `/assembler/queue` | 263.0 kB | 218.4 kB | -44.6 kB |
| `/qc/queue` | 262.7 kB | 218.0 kB | -44.7 kB |
| `/cutter` | 261.2 kB | 216.5 kB | -44.7 kB |
| `/assembler` | 260.7 kB | 216.0 kB | -44.7 kB |
| `/qc` | 260.3 kB | 215.7 kB | -44.6 kB |
| `/login` | 254.9 kB | 254.9 kB | 0.0 kB |

Largest remaining production JS chunks:

| Chunk | Raw | Gzip |
|---|---:|---:|
| `static/chunks/0~nzzthts-ri4.js` | 408.6 kB | 129.3 kB |
| `static/chunks/0o4fy.y5zv7p-.js` | 226.2 kB | 70.6 kB |
| `static/chunks/0gr69n4ollusm.js` | 204.2 kB | 54.4 kB |
| `static/chunks/0xcdez3003l_x.js` | 220.6 kB | 53.5 kB |
| `static/chunks/0w.plr96fhqf5.js` | 153.5 kB | 48.1 kB |
| `static/chunks/11clafn-hp5lf.js` | 193.4 kB | 44.2 kB |
| `static/chunks/03~yq9q893hmn.js` | 110.0 kB | 38.5 kB |
| `static/chunks/0o9k22~.s6xvc.js` | 107.0 kB | 28.4 kB |

### DB hardening

Added `supabase/migrations/20260628003000_index_notification_reads_recipient.sql`:

| Table | Index | Why |
|---|---|---|
| `notification_reads` | `idx_notification_reads_user_notification (user_role, user_id, notification_id)` | Covers unread counts (`user_role`, `user_id`) and read-list lookups (`user_role`, `user_id`, `notification_id IN (...)`). The existing primary key is ordered `(notification_id, user_role, user_id)`, which remains necessary for upserts but is not selective for user-scoped reads. |

Manufacturing hot filters from Phase 1 remain covered by existing migrations:

| Query area | Index state |
|---|---|
| `window_production_status.status` and `(unit_id, status)` | Added in `20260627120000_index_manufacturing_hot_filters.sql` |
| `schedule_entries.status` | Added in `20260627120000_index_manufacturing_hot_filters.sql` |
| `scheduler_unit_assignments.unit_id` | Already covered by the unique constraint in `20260402000000_scheduler_unit_assignments.sql` |
| `window_manufacturing_schedule` role date ordering | Existing date indexes from `20260410110000_manufacturing_scheduler.sql`; no lossy status/date filter was added because Phase 1 documented that it would drop all-time completed output without a data-model change |

No hot index was dropped in this pass. The remaining apparently overlapping indexes either back a constraint/upsert path or support a different leading-column order.

### Supabase outlier snapshot

`supabase inspect db outliers --linked` succeeded. The visible top total-time entries were Supabase dashboard/metadata introspection (`pg_available_extensions`, function/table metadata), a one-time `production_entered_at` backfill, and the Lansdowne seed migration. The previously-hot manufacturing queue read/reflow shapes did not appear in the returned outlier list.

Follow-up `calls`, `index-stats`, and `db-stats` inspections failed while initializing the temporary CLI login role against `aws-0-us-west-2.pooler.supabase.com` with password-auth failures, then a Supavisor circuit breaker. Do not keep retrying those commands until the linked CLI auth state is refreshed.

### Connection path

The deployed app does not use a raw Postgres `DATABASE_URL` in Vercel. `vercel env ls` shows only:

| Env var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase HTTP API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin Supabase client key |

Code search found no runtime `postgres://`, `postgresql://`, `DATABASE_URL`, or `POSTGRES_*` usage. The serverless app path uses Supabase SSR / Supabase JS clients over the Supabase API, so Vercel functions are not opening direct TCP `5432` Postgres connections. CLI inspection attempts target the Supavisor pooler host (`aws-0-us-west-2.pooler.supabase.com`), which is the correct pooled path for direct inspection/maintenance access once credentials are healthy.

### Materialized summaries

No materialized owner summary is warranted yet. The Phase 4 `get_owner_dashboard_counts(date)` RPC did not appear in the outlier snapshot, and the current dataset is still small (`460` units in Phase 0). Revisit only if future `pg_stat_statements` shows the owner dashboard count RPC as a top total-time or p95 contributor.

### Regression status and residual risk

| Check | Result |
|---|---|
| `npm run analyze` | Passed after repairing pre-existing portal syntax in four modified filter components |
| `supabase inspect db outliers --linked` | Passed; no manufacturing queue/reflow query in visible top outliers |
| Slow 4G role walkthrough | Not run in this environment; still requires authenticated browser sessions for owner, scheduler, installer, cutter, assembler, and QC |
| Concurrent queue simulation | Not run; still requires staging load probe with 10-20 users hitting cutter/assembler/QC queues |
| Supabase `calls`/`index-stats`/`db-stats` refresh | Blocked by temporary CLI login-role auth/circuit-breaker failures |

Residual risk: completed manufacturing views still read all-time schedule rows, scheduler nav still has two notification channels, and true server-side realtime scoping for scheduler/installer `windows` events still needs a data-model change such as denormalizing `unit_id` onto `windows`.

---

## Phase 9 scoped-RPC timing (2026-06-28)

Scheduler/installer dataset loaders moved from 6+ chunked PostgREST round-trips to a single
`get_scheduler_dataset(text)` / `get_installer_dataset(text)` RPC (migration
`20260628120000_scheduler_installer_dataset_scoping.sql`). Round-trips, not payload, were the
dominant lever (confirmed below). Warm timing (2 warmup + median of 5) against the linked prod
DB via a throwaway service-role validator that diffed the RPC against an exact re-implementation
of the chunked round-trip sequence:

| Loader | Scope | Chunked path (old) | RPC (new) | Speedup |
|---|---|---:|---:|---:|
| `loadSchedulerDataset` (Tom U) | 460 units / 866 rooms / 1989 windows | ~2038 ms | ~433 ms | ~4.7× |
| `loadInstallerDataset` (Mike Bull) | 8 units / 14 rooms / 34 windows | ~244 ms | ~81 ms | ~3.0× |

Notes:
- Times are network-inclusive from a dev machine to prod (Supabase API); the in-app serverless
  numbers will be lower but the round-trip ratio holds. Capture `[scoped-load] … rpc …ms` vs the
  chunked variant from `vercel logs` during a real authenticated session to confirm in-prod.
- Payload is unchanged (same rows returned), so server-side pagination (deferred) is not the
  dominant lever for these routes.
- Parity verified on live prod data: exact set parity for units/rooms/windows/buildings/clients/
  schedule/installers/assignments across the 1 scheduler and all 6 installers, plus field-value
  parity on sampled rows. The validator was deleted after use per the workflow.
