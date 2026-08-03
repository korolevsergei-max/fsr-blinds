# Consolidated Implementation Plan — 2026 H2

**Date:** 2026-07-19 · **Against:** `main` @ 2acd458
**Sources:** [DEEP_ASSESSMENT_2026H2.md](DEEP_ASSESSMENT_2026H2.md) (sequencing authority) + [MANUFACTURING_PERF_ASSESSMENT_2026-07-19.md](MANUFACTURING_PERF_ASSESSMENT_2026-07-19.md) (MF phases + B1/B2 amendments). This file is the quick-reference execution checklist — the detailed self-contained prompts for each phase live in [WORLD_CLASS_ROADMAP_2026H2.md](refactor/WORLD_CLASS_ROADMAP_2026H2.md) §4 and the two assessment docs. If this file and DEEP_ASSESSMENT_2026H2.md ever disagree, the deep assessment wins; update both.

Everything below is **unshipped as of 2026-07-19**, in execution order. One revertible commit per phase (or per sub-part where stated).

---

## The plan

| # | Phase | What it does | Model · thinking | Size |
|---|---|---|---|---|
| 1 | **MF0 — Unit-detail truncation bugfix** (ship first, alone) | Filter the windows query by the unit's room ids in both detail loaders (`cutter-data.ts`, `assembler-data.ts`); delete the two dead truncated loaders (`loadCutterDataset`, `loadAssemblerDataset`). Fixes the live defect: 369/393 units missing windows on detail pages (17 in-zone) | **Sonnet 5 · medium** | ½ session |
| 2 | **A1r — `/qc` middleware entry** | Add `/qc` to `PORTAL_REQUIRED_ROLE` in `src/lib/supabase/middleware.ts` (last open piece of the hygiene sweep) | **Haiku 4.5 · low** | ¼ session |
| 3 | **A2 — Observability floor** | `[perf]` timing lines that survive prod builds (`removeConsole` exclude), `scripts/perf-budget.mjs` + baseline JSON, RUM ritual. Makes every later phase measurable. Prompt: roadmap Phase 0 | **Sonnet 5 · medium** | 1 session |
| 4 | **A3 — Function region → `pdx1`** | Config-only move next to the DB (~60–75 ms shed per round-trip, every request). Verified still `iad1` on 2026-07-19. Re-baseline everything after. Prompt: roadmap Phase 1 | **any · low** (config + measurement) | ½ session |
| 5 | **A4 — Residual authz closure** | Guard or un-export the `revalidation.ts` actions (S1 — re-verified open); commit the traced authz matrix as `docs/security/ACTION_AUTHZ_MATRIX.md` (S2) | **Opus 4.8 · high** — a wrong guard locks out a real role | 1 session |
| 6 | **A5r — CSP enforce flip** | `Content-Security-Policy-Report-Only` → enforce, only after a clean violation soak across every portal | **Opus 4.8 · high** if reports show violations; otherwise trivial | flip |
| 7 | **B1 — Instant queue actions** (amended) | Optimistic + coalesced refresh on marks, pushbacks, undos; move the five inline `reflowManufacturingSchedules` awaits into `after()`; shrink the 6-path `revalidateManufacturingPaths()`. Do **NOT** delete the filter-refresh effects yet (they are the factory screens' only freshness — see MF2). Prompt: roadmap Phase 2 + its 2026-07-19 amendment note | **Opus 4.8 · high** — UX timing × realtime correctness | 1–2 sessions |
| 8 | **MF2 — Factory-portal freshness** | Scoped realtime subscription (or 60 s visibility-gated poll fallback) feeding B1's coalesced refresh so idle bench tablets see stage handoffs; *then* delete the 400 ms filter-refresh effects. Spec: mfg assessment §3 | **Opus 4.8 · high** — a missed status update on a factory tablet is a correctness bug | 1 session |
| 9 | **B2 — `get_role_schedule` RPC + payload projection** | Queue read ~3–5 s → <500 ms in one round-trip; `allItems` becomes the ~8-field projection the client actually uses (2.5 MB/view → ≤ ~300 KB); fold in the completed-view escalation dedupe (M4) and the process-screen SQL count aggregate (M6). Prompt: roadmap Phase 3 + mfg amendments | **Fable 5 · high** — SQL↔TS contract parity (M6 execution: **Sonnet 5 · medium**) | 1–2 sessions |
| 10 | **C1 — Archive completed schedule rows** | Bounded reads forever (archive, never delete). Growth re-measured at ~+41 rows/day — schedule before the table doubles (~fall). Prompt: roadmap Phase 4 | **Fable 5 · high** — data-model change + byte-parity gates | 2 sessions |
| 11 | **C2 — Risk flags: set-based + cron** | Replaces the ~170–230-query per-dashboard-view N+1 with one set-based update, mutation-triggered + daily cron (uses the last free Hobby cron slot). Prompt: roadmap Phase 5 | **Opus 4.8 · high** — notification idempotence | 1 session |
| 12 | **C3 — Auth trim + static login + revalidation diet** | Claims fast-path kills the per-navigation `user_profiles` read; `/login` prerenders; layout→page revalidation scope on the top-10 mutation sites. Prompt: roadmap Phase 6 (sub-part D already shipped) | **Opus 4.8 · high** — trust model must hold; re-run role-gating matrix | 1–2 sessions |
| 13 | **C4 — `windows.unit_id` + realtime scoping** | Denormalized column + server-side subscription filters. Prompt: roadmap Phase 7 | **Fable 5 · high** — missed-DELETE-event trap | 1–2 sessions |
| 14 | **D1 — Owner payload diet** | Projection on `get_owner_dataset` (509 KB → ~200 KB). Prompt: roadmap Phase 8 | **Fable 5 · high** design → **Sonnet 5 · medium** execution | 1–3 sessions |
| 15 | **D2 — Quality floor** | Hand-rolled runtime assertions at RPC/action boundaries, AbortSignal timeout wrapper on Supabase calls, GitHub Actions CI (lint/typecheck/test/perf-budget on PR) | **Fable 5 · high** design (API shapes every future file inherits) → **Sonnet 5 · medium** execution | 1–2 sessions |
| 16 | **D3 — Slow-4G walkthrough + concurrency probe** | Closes the QA debt; records the "after" column against the roadmap §1 targets. Prompt: roadmap Phase 9 | **any · low** + manual | 1 session |

---

## Thinking-effort legend

- **high** — extended thinking on, generous budget: design first, adversarial self-review before writing. For phases where a subtle mistake corrupts data, drops updates silently, or locks out a role.
- **medium** — standard reasoning: mechanical work with a clear spec.
- **low** — direct execution from a checklist.

Model IDs as of 2026-07: Fable 5 `claude-fable-5` · Opus 4.8 `claude-opus-4-8` · Sonnet 5 `claude-sonnet-5` · Haiku 4.5 `claude-haiku-4-5`. Re-check the lineup before each phase.

## Sequencing logic (one line each)

1. **#1 goes alone and first** — it is a live production bug, not a perf item.
2. **#2–6** are cheap closures plus the two multipliers (observability, region) that make everything after measurable and faster.
3. **#7–9** are the felt-latency core for the factory; order matters: coalescing hook (B1) → freshness that uses it (MF2) → cheap reads (B2).
4. **#10–13** are data-model durability.
5. **#14–16** are the quality floor and QA debt.

## After every phase

```
npm run lint && npm run typecheck && npm run build && npm test
```

(+ `npm run perf-budget` once #3 lands) · re-measure the phase's stated metric · one revertible commit · append a status note to [DEEP_ASSESSMENT_2026H2.md](DEEP_ASSESSMENT_2026H2.md) §5.

## Hard constraints (inherited — full text in DEEP_ASSESSMENT_2026H2 §4)

Production is live, `main` auto-deploys · no `reflowManufacturingSchedules` math changes (timing moves only, with parity checks) · realtime correctness beats performance · authorize only from service-role-written `app_metadata` · preserve RLS + installer offline-upload · Vercel Hobby limits (2 crons, function-region setting) · coalesced refreshes must stay under the shipped rate limits.
