import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  classifyUnappliedTransition,
  hasReached,
  transitionProductionStatus,
} from "./production-transition.ts";
import type { ProductionStatus } from "./types.ts";

/**
 * In-memory stand-in for window_production_status that honours the one thing
 * the helper relies on: an UPDATE only touches rows matching every .eq().
 */
function fakeSupabase(
  rows: Map<string, { status: ProductionStatus }>,
  options: { reportCount?: "exact" | "none" | "garbage"; updateError?: string } = {}
) {
  const calls: string[] = [];
  const client = {
    from() {
      return {
        update(patch: { status: ProductionStatus }) {
          const filters: Record<string, string> = {};
          const chain = {
            eq(column: string, value: string) {
              filters[column] = value;
              return chain;
            },
            then(resolve: (value: unknown) => void) {
              calls.push(`update:${filters.status}->${patch.status}`);
              if (options.updateError) {
                resolve({ error: { message: options.updateError }, count: null });
                return;
              }
              const row = rows.get(filters.window_id);
              let affected = 0;
              if (row && row.status === filters.status) {
                row.status = patch.status;
                affected = 1;
              }
              const count =
                options.reportCount === "none" ? null : options.reportCount === "garbage" ? Number.NaN : affected;
              resolve({ error: null, count });
            },
          };
          return chain;
        },
        select() {
          let windowId = "";
          const chain = {
            eq(_column: string, value: string) {
              windowId = value;
              return chain;
            },
            maybeSingle() {
              calls.push("read");
              const row = rows.get(windowId);
              return Promise.resolve({ data: row ? { status: row.status } : null, error: null });
            },
          };
          return chain;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const assemble = { from: "cut", to: "assembled", direction: "forward", patch: {} } as const;

test("a valid mark applies exactly once", async () => {
  const rows = new Map([["w1", { status: "cut" as ProductionStatus }]]);
  const { client } = fakeSupabase(rows);
  const result = await transitionProductionStatus(client, { windowId: "w1", ...assemble });
  assert.deepEqual(result, { ok: true, outcome: "applied" });
  assert.equal(rows.get("w1")?.status, "assembled");
});

test("a double tap succeeds without re-running side effects", async () => {
  const rows = new Map([["w1", { status: "cut" as ProductionStatus }]]);
  const { client } = fakeSupabase(rows);
  await transitionProductionStatus(client, { windowId: "w1", ...assemble });
  const second = await transitionProductionStatus(client, { windowId: "w1", ...assemble });
  assert.deepEqual(second, { ok: true, outcome: "already_done" });
  assert.equal(rows.get("w1")?.status, "assembled");
});

test("a stale card never reports success and never writes", async () => {
  // QC returned it to the cutter while the assembler's card was still on screen.
  const rows = new Map([["w1", { status: "pending" as ProductionStatus }]]);
  const { client } = fakeSupabase(rows);
  const result = await transitionProductionStatus(client, { windowId: "w1", ...assemble });
  assert.equal(result.ok, false);
  assert.equal(rows.get("w1")?.status, "pending");
});

test("marking cut cannot drag an assembled blind back to cut", async () => {
  const rows = new Map([["w1", { status: "assembled" as ProductionStatus }]]);
  const { client } = fakeSupabase(rows);
  const result = await transitionProductionStatus(client, {
    windowId: "w1",
    from: "pending",
    to: "cut",
    direction: "forward",
    patch: {},
  });
  assert.deepEqual(result, { ok: true, outcome: "already_done" });
  assert.equal(rows.get("w1")?.status, "assembled");
});

test("an undo racing a later mark cannot regress the blind", async () => {
  // Undo assembly issued, but QC approved first.
  const rows = new Map([["w1", { status: "qc_approved" as ProductionStatus }]]);
  const { client } = fakeSupabase(rows);
  const result = await transitionProductionStatus(client, {
    windowId: "w1",
    from: "assembled",
    to: "cut",
    direction: "backward",
    patch: {},
  });
  assert.equal(result.ok, false);
  assert.equal(rows.get("w1")?.status, "qc_approved");
});

test("a missing row is reported as missing, not as success", async () => {
  const { client } = fakeSupabase(new Map());
  const result = await transitionProductionStatus(client, { windowId: "w1", ...assemble });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.missingRow, true);
});

test("without a usable row count, a verified write still counts as applied", async () => {
  for (const reportCount of ["none", "garbage"] as const) {
    const rows = new Map([["w1", { status: "cut" as ProductionStatus }]]);
    const { client } = fakeSupabase(rows, { reportCount });
    const result = await transitionProductionStatus(client, { windowId: "w1", ...assemble });
    assert.deepEqual(result, { ok: true, outcome: "applied" }, reportCount);
  }
});

test("without a usable row count, an unapplied write is still rejected", async () => {
  const rows = new Map([["w1", { status: "pending" as ProductionStatus }]]);
  const { client } = fakeSupabase(rows, { reportCount: "garbage" });
  const result = await transitionProductionStatus(client, { windowId: "w1", ...assemble });
  assert.equal(result.ok, false);
});

test("a database error is surfaced, not swallowed", async () => {
  const rows = new Map([["w1", { status: "cut" as ProductionStatus }]]);
  const { client } = fakeSupabase(rows, { updateError: "permission denied" });
  const result = await transitionProductionStatus(client, { windowId: "w1", ...assemble });
  assert.deepEqual(result, {
    ok: false,
    error: "permission denied",
    current: null,
    missingRow: false,
  });
});

test("classification and ordering helpers", () => {
  assert.equal(classifyUnappliedTransition("forward", "assembled", "qc_approved"), "already_done");
  assert.equal(classifyUnappliedTransition("forward", "assembled", "pending"), "stale");
  assert.equal(classifyUnappliedTransition("forward", "cut", null), "stale");
  assert.equal(classifyUnappliedTransition("backward", "pending", "pending"), "already_done");
  assert.equal(classifyUnappliedTransition("backward", "cut", "qc_approved"), "stale");
  assert.equal(hasReached("cut", "cut"), true);
  assert.equal(hasReached("pending", "cut"), false);
  assert.equal(hasReached(null, "cut"), false);
});
