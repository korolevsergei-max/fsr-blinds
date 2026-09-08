import assert from "node:assert/strict";
import test from "node:test";

import {
  installerPickerCaption,
  isCoordinatorPick,
  isSchedulerAlias,
  selectableInstallers,
} from "./scheduler-installer-alias.ts";
import { mapInstaller, type InstallerRow } from "./dataset-mappers.ts";
import type { Installer, Scheduler } from "./types";

/**
 * Mirrors `combineInstallersWithSchedulers` in src/lib/server-data/build.ts. That module is
 * not imported directly because it resolves `@/…` aliases, which the --experimental-strip-types
 * test runner does not understand; the shape asserted here is the contract that matters.
 */
function coordinatorPickFor(sch: Scheduler): Installer {
  return {
    id: `sch-${sch.id}`,
    name: `SC: ${sch.name}`,
    email: sch.email,
    phone: sch.phone,
    avatarUrl: "",
    authUserId: sch.authUserId,
    schedulerAliasId: null,
  };
}

function createInstaller(overrides: Partial<Installer> = {}): Installer {
  return {
    id: "inst-1",
    name: "Real Installer",
    email: "installer@example.com",
    phone: "555-0100",
    avatarUrl: "",
    authUserId: "auth-1",
    schedulerAliasId: null,
    ...overrides,
  };
}

function createScheduler(overrides: Partial<Scheduler> = {}): Scheduler {
  return {
    id: "sch-tom",
    name: "Tom",
    email: "tom@example.com",
    phone: "555-0200",
    authUserId: "auth-tom",
    ...overrides,
  };
}

const aliasRow = createInstaller({
  id: "inst-sa-sch-tom",
  name: "Tom",
  authUserId: null,
  schedulerAliasId: "sch-tom",
});

test("an alias row is a real installer, not a coordinator pick", () => {
  assert.equal(isSchedulerAlias(aliasRow), true);
  // The id must NOT collide with the `sch-` coordinator prefix, or every existing
  // `!id.startsWith("sch-")` filter would drop it out of the installer pickers.
  assert.equal(isCoordinatorPick(aliasRow.id), false);
});

test("a real installer is neither an alias nor a coordinator pick", () => {
  const installer = createInstaller();
  assert.equal(isSchedulerAlias(installer), false);
  assert.equal(isCoordinatorPick(installer.id), false);
});

test("the synthetic coordinator row is never mistaken for an alias", () => {
  const coordinator = coordinatorPickFor(createScheduler());
  assert.equal(coordinator.id, "sch-sch-tom");
  assert.equal(isCoordinatorPick(coordinator.id), true);
  // Selecting this clears assigned_installer_id, so it must never read as an alias.
  assert.equal(isSchedulerAlias(coordinator), false);
});

test("selectableInstallers keeps real installers and aliases, drops coordinator picks", () => {
  const installer = createInstaller();
  const picks = selectableInstallers([
    installer,
    aliasRow,
    coordinatorPickFor(createScheduler()),
    createInstaller({ id: "" }),
  ]);

  assert.deepEqual(
    picks.map((p) => p.id),
    ["inst-1", "inst-sa-sch-tom"]
  );
});

test("captions distinguish a scheduler who also installs from a plain installer", () => {
  assert.equal(installerPickerCaption(createInstaller()), "Installer");
  assert.equal(installerPickerCaption(aliasRow), "Scheduler · also installs");
});

test("mapInstaller carries scheduler_alias_id through, defaulting to null", () => {
  const row: InstallerRow = {
    id: "inst-sa-sch-tom",
    name: "Tom",
    email: "tom@example.com",
    phone: "555-0200",
    avatar_url: "",
    auth_user_id: null,
    scheduler_alias_id: "sch-tom",
  };
  assert.equal(mapInstaller(row).schedulerAliasId, "sch-tom");

  const plain: InstallerRow = { ...row, id: "inst-1", scheduler_alias_id: undefined };
  assert.equal(mapInstaller(plain).schedulerAliasId, null);
});

test("a scheduler's own alias row does not make their team look non-empty", () => {
  // The alias carries scheduler_id = its own scheduler, so it lands in `team_installers`.
  // Counting it as a team member would stop the all-installers fallback from firing and
  // collapse a brand-new scheduler's picker to just themselves. Mirrors the emptiness test
  // in loadSchedulerDataset / loadSchedulerUnitDetail.
  const hasRealTeam = (team: Installer[]) => team.some((i) => !i.schedulerAliasId);

  assert.equal(hasRealTeam([aliasRow]), false, "alias only => fall back to all installers");
  assert.equal(hasRealTeam([]), false, "no team => fall back to all installers");
  assert.equal(hasRealTeam([aliasRow, createInstaller()]), true, "real member => use the team");
});

test("an alias row is excluded from the orphan bucket, a real unlinked row is not", () => {
  // Mirrors the split in InstallersList: alias rows have no auth link BY DESIGN, so
  // filtering on authUserId alone would flag every scheduler as an orphaned record.
  const rows = [createInstaller(), aliasRow, createInstaller({ id: "inst-2", authUserId: null })];

  const aliases = rows.filter(isSchedulerAlias);
  const accounts = rows.filter((r) => !isSchedulerAlias(r));
  const orphans = accounts.filter((r) => !r.authUserId);

  assert.deepEqual(aliases.map((r) => r.id), ["inst-sa-sch-tom"]);
  assert.deepEqual(orphans.map((r) => r.id), ["inst-2"]);
});
