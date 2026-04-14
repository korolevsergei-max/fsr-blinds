import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEscalationHref, resolveActorRole } from "./escalation-helpers.ts";

// ---------------------------------------------------------------------------
// resolveEscalationHref
// ---------------------------------------------------------------------------

const BASE = "/management/units";
const UNIT_ID = "unit-1";

const measuredOnlyWindow = { id: "win-1", installed: false, bracketed: false };
const bracketedWindow    = { id: "win-2", installed: false, bracketed: true };
const installedWindow    = { id: "win-3", installed: true,  bracketed: true };

test("resolveEscalationHref – measured-only window → measurement/edit route", () => {
  const result = resolveEscalationHref(
    { windowId: "win-1", roomId: "room-1" },
    [measuredOnlyWindow, bracketedWindow, installedWindow],
    UNIT_ID,
    BASE
  );
  assert.equal(
    result,
    `${BASE}/${UNIT_ID}/rooms/room-1/windows/new?edit=win-1`
  );
});

test("resolveEscalationHref – bracketed (not installed) window → bracketing route", () => {
  const result = resolveEscalationHref(
    { windowId: "win-2", roomId: "room-1" },
    [measuredOnlyWindow, bracketedWindow, installedWindow],
    UNIT_ID,
    BASE
  );
  assert.equal(
    result,
    `${BASE}/${UNIT_ID}/rooms/room-1/windows/win-2/bracketing`
  );
});

test("resolveEscalationHref – installed window → installed route", () => {
  const result = resolveEscalationHref(
    { windowId: "win-3", roomId: "room-1" },
    [measuredOnlyWindow, bracketedWindow, installedWindow],
    UNIT_ID,
    BASE
  );
  assert.equal(
    result,
    `${BASE}/${UNIT_ID}/rooms/room-1/windows/win-3/installed`
  );
});

test("resolveEscalationHref – unknown windowId falls back to measurement/edit route", () => {
  const result = resolveEscalationHref(
    { windowId: "win-unknown", roomId: "room-1" },
    [measuredOnlyWindow, bracketedWindow, installedWindow],
    UNIT_ID,
    BASE
  );
  assert.equal(
    result,
    `${BASE}/${UNIT_ID}/rooms/room-1/windows/new?edit=win-unknown`
  );
});

// ---------------------------------------------------------------------------
// resolveActorRole
// ---------------------------------------------------------------------------

test("resolveActorRole – owner role → 'owner'", () => {
  assert.equal(resolveActorRole("owner"), "owner");
});

test("resolveActorRole – scheduler role → 'scheduler'", () => {
  assert.equal(resolveActorRole("scheduler"), "scheduler");
});

test("resolveActorRole – installer role → 'installer'", () => {
  assert.equal(resolveActorRole("installer"), "installer");
});

test("resolveActorRole – unknown role → 'installer'", () => {
  assert.equal(resolveActorRole("client"), "installer");
  assert.equal(resolveActorRole("assembler"), "installer");
  assert.equal(resolveActorRole("qc"), "installer");
});
