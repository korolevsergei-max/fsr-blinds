import assert from "node:assert/strict";
import test from "node:test";

import { pruneSettledWrites, reconcileSnapshot } from "./queue-reconcile.ts";

const items = ["w1", "w2", "w3", "w4"].map((windowId) => ({ windowId }));

test("a snapshot fetched mid-burst cannot put in-flight blinds back", () => {
  const result = reconcileSnapshot(items, new Set(["w2"]), new Map());
  assert.deepEqual(result.map((i) => i.windowId), ["w1", "w3", "w4"]);
});

test("a snapshot that predates a confirmed clear cannot resurrect it", () => {
  const settling = new Map([["w1", "2026-09-23T15:00:05.000Z"]]);
  const stillSettling = pruneSettledWrites(settling, "2026-09-23T15:00:04.000Z");
  assert.deepEqual([...stillSettling.keys()], ["w1"]);
  const result = reconcileSnapshot(items, new Set(), stillSettling);
  assert.equal(result.some((i) => i.windowId === "w1"), false);
});

test("a snapshot read after the clear is trusted, so real returns show up", () => {
  // e.g. QC sent the blind back to assembly after this tablet cleared it.
  const settling = new Map([["w1", "2026-09-23T15:00:05.000Z"]]);
  const stillSettling = pruneSettledWrites(settling, "2026-09-23T15:00:06.000Z");
  assert.equal(stillSettling.size, 0);
  const result = reconcileSnapshot(items, new Set(), stillSettling);
  assert.equal(result.some((i) => i.windowId === "w1"), true);
});

test("the snapshot is otherwise exhaustive — nothing else is dropped", () => {
  const result = reconcileSnapshot(items, new Set(["w2"]), new Map([["w3", "z"]]));
  assert.deepEqual(result.map((i) => i.windowId), ["w1", "w4"]);
  assert.deepEqual(reconcileSnapshot(items, new Set(), new Map()), items);
});

test("a snapshot without a read time is trusted outright", () => {
  assert.equal(pruneSettledWrites(new Map([["w1", "2026-09-23T15:00:05.000Z"]]), undefined).size, 0);
});
