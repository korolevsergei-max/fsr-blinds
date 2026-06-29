import { createClient } from "@/lib/supabase/server";
import type { AppDataset } from "@/lib/app-dataset";
import type {
  UnitStatus,
  WindowManufacturingEscalation,
  WindowPostInstallIssue,
  WindowPostInstallIssueNote,
} from "@/lib/types";
import { deriveUnitStatusFromCounts } from "@/lib/unit-status-helpers";
import { deriveCurrentStageFromCounts } from "@/lib/current-stage";
import { mapManufacturingEscalation } from "@/lib/manufacturing-escalations";
import { selectInChunks } from "@/lib/supabase-chunking";
import type {
  ManufacturingEscalationRow,
  PostInstallIssueRow,
  PostInstallIssueNoteRow,
} from "./internal-types";

async function loadOpenManufacturingEscalations(
  dataset: AppDataset
): Promise<WindowManufacturingEscalation[]> {
  const unitIds = dataset.units.map((unit) => unit.id);
  if (unitIds.length === 0) return [];

  const supabase = await createClient();
  const rows = await selectInChunks<ManufacturingEscalationRow>(unitIds, (chunk) =>
    supabase
      .from("window_manufacturing_escalations")
      .select("*")
      .in("unit_id", chunk)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .then((res) => ({ data: res.data as ManufacturingEscalationRow[] | null, error: res.error })),
  );

  return rows.map(mapManufacturingEscalation);
}

export async function withManufacturingEscalations(dataset: AppDataset): Promise<AppDataset> {
  const manufacturingEscalations = await loadOpenManufacturingEscalations(dataset);
  return {
    ...dataset,
    manufacturingEscalations,
  };
}

async function loadPostInstallIssues(
  unitIds: string[]
): Promise<WindowPostInstallIssue[]> {
  if (unitIds.length === 0) return [];

  const supabase = await createClient();
  const issues = await selectInChunks<PostInstallIssueRow>(unitIds, (chunk) =>
    supabase
      .from("window_post_install_issues")
      .select("*")
      .in("unit_id", chunk)
      .order("opened_at", { ascending: false })
      .then((res) => ({ data: res.data as PostInstallIssueRow[] | null, error: res.error })),
  );
  const issueIds = issues.map((issue) => issue.id);
  if (issueIds.length === 0) return [];

  const profileIdSeed = [
    ...new Set(
      issues
        .flatMap((issue) => [issue.opened_by_user_id, issue.resolved_by_user_id])
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const [noteRowsAll, profileSeedRows] = await Promise.all([
    selectInChunks<PostInstallIssueNoteRow>(issueIds, (chunk) =>
      supabase
        .from("window_post_install_issue_notes")
        .select("*")
        .in("issue_id", chunk)
        .order("created_at", { ascending: true })
        .then((res) => ({ data: res.data as PostInstallIssueNoteRow[] | null, error: res.error })),
    ),
    selectInChunks<{ id: string; display_name: string }>(profileIdSeed, (chunk) =>
      supabase
        .from("user_profiles")
        .select("id, display_name")
        .in("id", chunk)
        .then((res) => ({ data: res.data as Array<{ id: string; display_name: string }> | null, error: res.error })),
    ),
  ]);

  const noteRows = noteRowsAll.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const noteAuthorIds = [...new Set(noteRows.map((note) => note.author_user_id))];
  let noteProfileRows: Array<{ id: string; display_name: string }> = profileSeedRows;
  const missingAuthorIds = noteAuthorIds.filter(
    (id) => !noteProfileRows.some((profile) => profile.id === id),
  );
  if (missingAuthorIds.length > 0) {
    const authorProfiles = await selectInChunks<{ id: string; display_name: string }>(
      missingAuthorIds,
      (chunk) =>
        supabase
          .from("user_profiles")
          .select("id, display_name")
          .in("id", chunk)
          .then((res) => ({ data: res.data as Array<{ id: string; display_name: string }> | null, error: res.error })),
    );
    noteProfileRows = [...noteProfileRows, ...authorProfiles];
  }

  const profileNameById = new Map(
    noteProfileRows.map((profile) => [profile.id as string, profile.display_name as string])
  );
  const notesByIssue = new Map<string, WindowPostInstallIssueNote[]>();
  for (const note of noteRows) {
    const mapped: WindowPostInstallIssueNote = {
      id: note.id,
      issueId: note.issue_id,
      authorUserId: note.author_user_id,
      authorRole: note.author_role,
      authorName: profileNameById.get(note.author_user_id) ?? null,
      body: note.body,
      createdAt: note.created_at,
    };
    const list = notesByIssue.get(note.issue_id);
    if (list) list.push(mapped);
    else notesByIssue.set(note.issue_id, [mapped]);
  }

  return issues.map((issue) => ({
    id: issue.id,
    windowId: issue.window_id,
    unitId: issue.unit_id,
    openedByUserId: issue.opened_by_user_id,
    openedByRole: issue.opened_by_role,
    openedByName: profileNameById.get(issue.opened_by_user_id) ?? null,
    openedAt: issue.opened_at,
    resolvedByUserId: issue.resolved_by_user_id,
    resolvedByName: issue.resolved_by_user_id
      ? profileNameById.get(issue.resolved_by_user_id) ?? null
      : null,
    resolvedAt: issue.resolved_at,
    status: issue.status,
    createdAt: issue.created_at,
    notes: notesByIssue.get(issue.id) ?? [],
  }));
}

async function withPostInstallIssues(dataset: AppDataset): Promise<AppDataset> {
  const unitIds = dataset.units.map((unit) => unit.id);
  const postInstallIssues = await loadPostInstallIssues(unitIds);
  const unitsWithOpenIssues = new Set(
    postInstallIssues
      .filter((issue) => issue.status === "open")
      .map((issue) => issue.unitId)
  );

  return {
    ...dataset,
    units: dataset.units.map((unit) => ({
      ...unit,
      hasOpenPostInstallIssue: unitsWithOpenIssues.has(unit.id),
    })),
    postInstallIssues,
  };
}

/**
 * Overrides each unit's `status` (in memory) with a fresh derivation from current
 * window data + QC approvals, and computes `currentStage` (which is not persisted).
 *
 * Lets the dashboard show accurate pipeline counts even if some past mutation
 * skipped `recomputeUnitStatus`. This is read-only: `units.status` is persisted at
 * every mutation by `recomputeUnitStatus`, so the formerly here `after()` write-back
 * was pure self-heal and has been removed (DATA_SCOPING_PLAN.md §3). Any drift between
 * persisted and derived status is logged so we can confirm no mutation misses
 * `recomputeUnitStatus`; legacy drift is healed once by the backfill migration.
 */
async function withLiveUnitStatuses(dataset: AppDataset): Promise<AppDataset> {
  if (dataset.units.length === 0) return dataset;

  const supabase = await createClient();
  const unitIds = dataset.units.map((u) => u.id);

  const prodRows = await selectInChunks<{ unit_id: string; status: string }>(unitIds, (chunk) =>
    supabase
      .from("window_production_status")
      .select("unit_id, status")
      .in("unit_id", chunk)
      .then((res) => ({ data: res.data as Array<{ unit_id: string; status: string }> | null, error: res.error })),
  );

  const qcCountByUnit = new Map<string, number>();
  const assembledOrLaterByUnit = new Map<string, number>();
  const cutOrLaterByUnit = new Map<string, number>();
  for (const row of prodRows) {
    if (row.status === "qc_approved") {
      qcCountByUnit.set(row.unit_id, (qcCountByUnit.get(row.unit_id) ?? 0) + 1);
    }
    if (row.status === "assembled" || row.status === "qc_approved") {
      assembledOrLaterByUnit.set(row.unit_id, (assembledOrLaterByUnit.get(row.unit_id) ?? 0) + 1);
    }
    if (row.status === "cut" || row.status === "assembled" || row.status === "qc_approved") {
      cutOrLaterByUnit.set(row.unit_id, (cutOrLaterByUnit.get(row.unit_id) ?? 0) + 1);
    }
  }

  const unitIdByRoom = new Map(dataset.rooms.map((r) => [r.id, r.unitId]));
  const windowsByUnit = new Map<string, typeof dataset.windows>();
  for (const w of dataset.windows) {
    const unitId = unitIdByRoom.get(w.roomId);
    if (!unitId) continue;
    const list = windowsByUnit.get(unitId);
    if (list) list.push(w);
    else windowsByUnit.set(unitId, [w]);
  }

  const drift: Array<{ id: string; status: UnitStatus }> = [];
  const units = dataset.units.map((unit) => {
    const ws = windowsByUnit.get(unit.id) ?? [];
    const totalWindows = ws.length;
    const installedCount = ws.filter((w) => w.installed).length;
    const measuredCount = ws.filter((w) => w.measured).length;
    const bracketedCount = ws.filter((w) => w.bracketed).length;
    const qcCount = qcCountByUnit.get(unit.id) ?? 0;
    const assembledCount = assembledOrLaterByUnit.get(unit.id) ?? 0;
    const cutCount = cutOrLaterByUnit.get(unit.id) ?? 0;
    // Legacy units installed before per-blind QC tracking lack qc_approved rows;
    // treat them as fully manufactured so we don't downgrade installed → bracketed.
    const manufacturedCount =
      totalWindows > 0 && installedCount >= totalWindows && qcCount < totalWindows
        ? totalWindows
        : qcCount;
    const derived = deriveUnitStatusFromCounts({
      totalWindows,
      measuredCount,
      bracketedCount,
      manufacturedCount,
      installedCount,
    });
    const currentStage = deriveCurrentStageFromCounts({
      totalWindows,
      measuredCount,
      bracketedCount,
      cutCount,
      assembledCount,
      qcCount,
      installedCount,
      hasOpenPostInstallIssue: unit.hasOpenPostInstallIssue,
    });
    const updated = { ...unit, currentStage };
    if (derived !== unit.status) {
      drift.push({ id: unit.id, status: derived });
      updated.status = derived;
    }
    return updated;
  });

  // Read-only drift log. `recomputeUnitStatus` persists `units.status` at every
  // mutation, so a non-empty drift here means a mutation path skipped it (or predates
  // the backfill). We no longer write back on every read (DATA_SCOPING_PLAN.md §3);
  // the in-memory override above keeps the dashboard accurate regardless.
  if (drift.length > 0) {
    console.warn(
      `[unit-status-drift] ${drift.length} unit(s) have persisted status differing ` +
        `from derived status (recomputeUnitStatus may have been skipped). Sample: ` +
        drift
          .slice(0, 10)
          .map((d) => `${d.id}→${d.status}`)
          .join(", ")
    );
  }

  return { ...dataset, units };
}

export async function finalizeDataset(
  dataset: AppDataset,
  opts: { deriveStatusFromWindows?: boolean; preEnriched?: boolean } = {}
): Promise<AppDataset> {
  // `deriveStatusFromWindows` re-derives each unit's `status` + `currentStage` from the
  // loaded windows/rooms (`withLiveUnitStatuses`). The owner global load passes `false`:
  // it ships no windows/rooms, no global owner screen reads `currentStage`, and
  // `units.status` is persisted at every mutation by `recomputeUnitStatus` (drift confirmed
  // 0), so re-deriving is redundant. Scoped routes (unit detail, scheduler, installer) keep
  // the default `true` because they display `currentStage` and load their own windows.
  //
  // `preEnriched` (Phase 11): the dataset already carries `manufacturingEscalations` (open) and
  // each unit's `hasOpenPostInstallIssue`, because the owner/scheduler dataset RPC folded those
  // reads in (get_owner_dataset / get_scheduler_dataset). Skip the now-redundant
  // withPostInstallIssues + withManufacturingEscalations round-trips — they only re-fetch what
  // the RPC already returned, and the global screens never read the post-install notes/array
  // that the full withPostInstallIssues also loads. The non-RPC fallback paths leave this
  // unset, so they keep doing the full enrichment (byte-identical, rollback-safe).
  const { deriveStatusFromWindows = true, preEnriched = false } = opts;
  if (preEnriched) {
    return deriveStatusFromWindows ? withLiveUnitStatuses(dataset) : dataset;
  }
  const withIssues = await withPostInstallIssues(dataset);
  const withLiveStatuses = deriveStatusFromWindows
    ? await withLiveUnitStatuses(withIssues)
    : withIssues;
  return withManufacturingEscalations(withLiveStatuses);
}
