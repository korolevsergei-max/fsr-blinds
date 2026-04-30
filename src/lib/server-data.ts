import { cache } from "react";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getLinkedSchedulerId } from "@/lib/auth";
import { getSchedulerScopedUnitIds } from "@/lib/scheduler-scope";
import type { AppDataset } from "@/lib/app-dataset";
import type {
  Notification,
  UnitActivityLog,
  UnitPhotoStage,
  UnitStatus,
  WindowManufacturingEscalation,
  WindowPostInstallIssue,
  WindowPostInstallIssueNote,
} from "@/lib/types";
import { deriveUnitStatusFromCounts } from "@/lib/unit-status-helpers";
import { deriveCurrentStageFromCounts } from "@/lib/current-stage";
import {
  mapClient,
  mapBuilding,
  mapInstaller,
  mapUnit,
  mapActivityLog,
  mapRoom,
  mapWindow,
  mapSchedule,
  mapCutter,
  mapScheduler,
  normalizeScheduleEntries,
  type ClientRow,
  type BuildingRow,
  type InstallerRow,
  type UnitRow,
  type UnitActivityLogRow,
  type RoomRow,
  type WindowRow,
  type ScheduleRow,
  type CutterRow,
  type SchedulerRow,
} from "@/lib/dataset-mappers";
import { mapManufacturingEscalation } from "@/lib/manufacturing-escalations";
import { selectInChunks } from "@/lib/supabase-chunking";

type MediaUploadRow = {
  id: string;
  public_url: string;
  label: string | null;
  unit_id: string;
  room_id: string | null;
  window_id: string | null;
  upload_kind: string;
  stage: string | null;
  phase: string | null;
  created_at: string;
  uploaded_by_user_id: string | null;
  uploaded_by_name: string | null;
  uploaded_by_role: string | null;
};

type ManufacturingEscalationRow = {
  id: string;
  window_id: string;
  unit_id: string;
  source_role: "cutter" | "assembler" | "qc";
  target_role: "cutter" | "assembler" | "qc";
  escalation_type: "pushback" | "blocker";
  status: "open" | "resolved";
  reason: string | null;
  notes: string | null;
  opened_by_user_id: string | null;
  opened_at: string;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

type PostInstallIssueRow = {
  id: string;
  window_id: string;
  unit_id: string;
  opened_by_user_id: string;
  opened_by_role: "owner" | "scheduler";
  opened_at: string;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  status: "open" | "resolved";
  created_at: string;
};

type PostInstallIssueNoteRow = {
  id: string;
  issue_id: string;
  author_user_id: string;
  author_role: string;
  body: string;
  created_at: string;
};

/**
 * Transforms raw RPC / multi-query results into a typed AppDataset.
 * Shared by both the fast RPC path and the legacy multi-query fallback.
 */
function buildDatasetFromRaw(raw: {
  clients: ClientRow[];
  buildings: BuildingRow[];
  units: UnitRow[];
  rooms: RoomRow[];
  windows: WindowRow[];
  installers: InstallerRow[];
  schedule_entries: ScheduleRow[];
  cutters: CutterRow[];
  schedulers: SchedulerRow[];
  scheduler_unit_assignments: { unit_id: string; scheduler_id: string; assigned_at: string }[];
}): AppDataset {
  const schedulersData = raw.schedulers ?? [];
  const schedulerMap = new Map(schedulersData.map((s) => [s.id, s.name]));
  const assignmentMap = new Map(
    (raw.scheduler_unit_assignments ?? []).map((a) => [
      a.unit_id,
      { id: a.scheduler_id, name: schedulerMap.get(a.scheduler_id) || "Unknown", assigned_at: a.assigned_at },
    ])
  );

  const units = (raw.units ?? []).map((r) => {
    const assignment = assignmentMap.get(r.id);
    return mapUnit(
      { ...r, assigned_at: assignment?.assigned_at },
      assignment?.name,
      assignment?.id
    );
  });
  const schedule = normalizeScheduleEntries(units, (raw.schedule_entries ?? []).map(mapSchedule));

  const installers = (raw.installers ?? []).map(mapInstaller);
  const schedulers = schedulersData.map(mapScheduler);

  // Allow Schedulers to act as Installers
  const combinedInstallers = [
    ...installers,
    ...schedulers.map((sch) => ({
      id: `sch-${sch.id}`,
      name: `SC: ${sch.name}`,
      email: sch.email,
      phone: sch.phone,
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(sch.name)}`,
      authUserId: sch.authUserId,
    })),
  ];

  return {
    clients: (raw.clients ?? []).map(mapClient),
    buildings: (raw.buildings ?? []).map(mapBuilding),
    units,
    rooms: (raw.rooms ?? []).map(mapRoom),
    windows: (raw.windows ?? []).map(mapWindow),
    installers: combinedInstallers,
    schedule,
    cutters: (raw.cutters ?? []).map(mapCutter),
    schedulers,
    manufacturingEscalations: [],
    postInstallIssues: [],
  };
}

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

async function withManufacturingEscalations(dataset: AppDataset): Promise<AppDataset> {
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
 * Overrides each unit's `status` with a fresh derivation from current window
 * data + QC approvals. Schedules a background write-back so the cached
 * `units.status` self-heals over time.
 *
 * Lets the dashboard show accurate pipeline counts even if some past mutation
 * skipped `recomputeUnitStatus`.
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

  if (drift.length > 0) {
    after(async () => {
      const followUp = await createClient();
      for (const d of drift) {
        await followUp.from("units").update({ status: d.status }).eq("id", d.id);
        await followUp
          .from("schedule_entries")
          .update({ status: d.status })
          .eq("unit_id", d.id);
      }
    });
  }

  return { ...dataset, units };
}

async function finalizeDataset(dataset: AppDataset): Promise<AppDataset> {
  const withIssues = await withPostInstallIssues(dataset);
  const withLiveStatuses = await withLiveUnitStatuses(withIssues);
  return withManufacturingEscalations(withLiveStatuses);
}

export const loadFullDataset = cache(async (): Promise<AppDataset> => {
  const supabase = await createClient();

  // Fast path: single RPC call (requires migration 20260408110000)
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_full_dataset");
  if (!rpcError && rpcData) {
    return finalizeDataset(buildDatasetFromRaw(rpcData as {
      clients: ClientRow[];
      buildings: BuildingRow[];
      units: UnitRow[];
      rooms: RoomRow[];
      windows: WindowRow[];
      installers: InstallerRow[];
      schedule_entries: ScheduleRow[];
      cutters: CutterRow[];
      schedulers: SchedulerRow[];
      scheduler_unit_assignments: { unit_id: string; scheduler_id: string; assigned_at: string }[];
    }));
  }

  // Fallback: multiple parallel queries (works before RPC migration is applied)
  const [
    clientsRes,
    buildingsRes,
    unitsRes,
    roomsRes,
    windowsRes,
    installersRes,
    scheduleRes,
  ] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase.from("buildings").select("*").order("name"),
    supabase.from("units").select("*").order("unit_number"),
    supabase.from("rooms").select("*").order("name"),
    supabase.from("windows").select("*").order("label"),
    supabase.from("installers").select("*").order("name"),
    supabase.from("schedule_entries").select("*").order("task_date"),
  ]);

  const [cuttersRes, schedulersRes, assignmentsRes] = await Promise.all([
    supabase.from("cutters").select("*").order("name"),
    supabase.from("schedulers").select("*").order("name"),
    supabase.from("scheduler_unit_assignments").select("unit_id, scheduler_id, assigned_at"),
  ]);

  const coreResponses = [clientsRes, buildingsRes, unitsRes, roomsRes, windowsRes, installersRes, scheduleRes];
  const firstError = coreResponses.find((r) => r.error)?.error;
  if (firstError) {
    const baseMessage = `Supabase: ${firstError.message}.`;
    if (/invalid api key/i.test(firstError.message)) {
      throw new Error(
        `${baseMessage} Update NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) in .env.local and restart dev server.`
      );
    }
    throw new Error(
      `${baseMessage} Apply supabase/migrations in the SQL editor if tables are missing.`
    );
  }

  return finalizeDataset(buildDatasetFromRaw({
    clients: (clientsRes.data as ClientRow[]) ?? [],
    buildings: (buildingsRes.data as BuildingRow[]) ?? [],
    units: (unitsRes.data as UnitRow[]) ?? [],
    rooms: (roomsRes.data as RoomRow[]) ?? [],
    windows: (windowsRes.data as WindowRow[]) ?? [],
    installers: (installersRes.data as InstallerRow[]) ?? [],
    schedule_entries: (scheduleRes.data as ScheduleRow[]) ?? [],
    cutters: cuttersRes.error ? [] : (cuttersRes.data as CutterRow[]) ?? [],
    schedulers: schedulersRes.error ? [] : (schedulersRes.data as SchedulerRow[]) ?? [],
    scheduler_unit_assignments: (assignmentsRes.data as { unit_id: string; scheduler_id: string; assigned_at: string }[]) ?? [],
  }));
});

function emptyDataset(): AppDataset {
  return {
    clients: [],
    buildings: [],
    units: [],
    rooms: [],
    windows: [],
    installers: [],
    schedule: [],
    cutters: [],
    schedulers: [],
    manufacturingEscalations: [],
    postInstallIssues: [],
  };
}

/** unit_id → scheduler_id for rows in `scheduler_unit_assignments` (at most one per unit). */
export async function loadUnitSchedulerAssignmentMap(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduler_unit_assignments")
    .select("unit_id, scheduler_id");
  if (error) return {};
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[(row as { unit_id: string }).unit_id] = (row as { scheduler_id: string }).scheduler_id;
  }
  return map;
}

/** Loads a map of schedulerId → allowed buildingIds (for the owner Accounts UI). */
export async function loadAllSchedulerBuildingAccess(): Promise<Record<string, string[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduler_building_access")
    .select("scheduler_id, building_id");
  if (error) return {};

  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    if (!map[row.scheduler_id]) map[row.scheduler_id] = [];
    map[row.scheduler_id].push(row.building_id);
  }
  return map;
}

/**
 * Loads a dataset scoped to the current scheduler: units from
 * `scheduler_unit_assignments` plus units assigned to installers on this scheduler's team
 * (`installers.scheduler_id`). The latter keeps units visible after handoff to a team installer.
 */
export async function loadSchedulerDataset(): Promise<AppDataset> {
  const user = await getCurrentUser();
  if (!user || user.role !== "scheduler") {
    return emptyDataset();
  }

  const schedulerId = await getLinkedSchedulerId(user.id);
  if (!schedulerId) return emptyDataset();

  const supabase = await createClient();

  const scopedUnitIds = await getSchedulerScopedUnitIds(supabase, schedulerId);

  if (scopedUnitIds.length === 0) return emptyDataset();

  const unitData = await selectInChunks<UnitRow>(scopedUnitIds, (chunk) =>
    supabase
      .from("units")
      .select("*")
      .in("id", chunk)
      .order("unit_number")
      .then((res) => ({ data: res.data as UnitRow[] | null, error: res.error })),
  );
  const { data: assignmentsData } = await supabase
    .from("scheduler_unit_assignments")
    .select("unit_id, assigned_at")
    .eq("scheduler_id", schedulerId);
  const assignmentAtMap = new Map(
    ((assignmentsData ?? []) as { unit_id: string; assigned_at: string }[]).map((a) => [
      a.unit_id,
      a.assigned_at,
    ])
  );

  const { data: schedulerRow } = await supabase.from("schedulers").select("name").eq("id", schedulerId).single();
  const schedulerName = (schedulerRow as { name: string })?.name || "Unknown";

  const units = unitData.map((r) =>
    mapUnit({ ...r, assigned_at: assignmentAtMap.get(r.id) }, schedulerName, schedulerId)
  );

  // Derive unique building and client id sets from the loaded units.
  const allowedBuildingIds = [...new Set(units.map((u) => u.buildingId))];
  const allowedClientIds = [...new Set(units.map((u) => u.clientId))];
  const allowedUnitIds = units.map((u) => u.id);

  const [buildingRows, clientRows, schedulerRoomRows, schedulerScheduleRows, installerRows] = await Promise.all([
    selectInChunks<BuildingRow>(allowedBuildingIds, (chunk) =>
      supabase
        .from("buildings")
        .select("*")
        .in("id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as BuildingRow[] | null, error: res.error })),
    ),
    selectInChunks<ClientRow>(allowedClientIds, (chunk) =>
      supabase
        .from("clients")
        .select("*")
        .in("id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as ClientRow[] | null, error: res.error })),
    ),
    selectInChunks<RoomRow>(allowedUnitIds, (chunk) =>
      supabase
        .from("rooms")
        .select("*")
        .in("unit_id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as RoomRow[] | null, error: res.error })),
    ),
    selectInChunks<ScheduleRow>(allowedUnitIds, (chunk) =>
      supabase
        .from("schedule_entries")
        .select("*")
        .in("unit_id", chunk)
        .order("task_date")
        .then((res) => ({ data: res.data as ScheduleRow[] | null, error: res.error })),
    ),
    // Scope installers to this scheduler's team.
    supabase.from("installers").select("*").eq("scheduler_id", schedulerId).order("name"),
  ]);

  const buildings = buildingRows.map(mapBuilding);
  const clients = clientRows.map(mapClient);
  const rooms = schedulerRoomRows.map(mapRoom);

  // Fall back to all installers when the scheduler has no team yet.
  let installers = ((installerRows.data as InstallerRow[]) ?? []).map(mapInstaller);
  if (installers.length === 0) {
    const { data: allInstallers } = await supabase.from("installers").select("*").order("name");
    installers = ((allInstallers as InstallerRow[]) ?? []).map(mapInstaller);
  }

  // Same synthetic pick-list row as `loadFullDataset`: schedulers can assign units to themselves.
  const selfPickId = `sch-${schedulerId}`;
  if (!installers.some((i) => i.id === selfPickId)) {
    const { data: selfRow } = await supabase
      .from("schedulers")
      .select("*")
      .eq("id", schedulerId)
      .single();
    if (selfRow) {
      const sch = mapScheduler(selfRow as SchedulerRow);
      installers = [
        {
          id: selfPickId,
          name: `SC: ${sch.name}`,
          email: sch.email,
          phone: sch.phone,
          avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(sch.name)}`,
          authUserId: sch.authUserId,
        },
        ...installers,
      ];
    }
  }

  const allowedRoomIds = rooms.map((r) => r.id);
  const schedulerWindowRows = await selectInChunks<WindowRow>(allowedRoomIds, (chunk) =>
    supabase
      .from("windows")
      .select("*")
      .in("room_id", chunk)
      .order("label")
      .then((res) => ({ data: res.data as WindowRow[] | null, error: res.error })),
  );

  const windows = schedulerWindowRows.map(mapWindow);
  const schedule = normalizeScheduleEntries(
    units,
    schedulerScheduleRows.map(mapSchedule)
  );

  return finalizeDataset({
    clients,
    buildings,
    units,
    rooms,
    windows,
    installers,
    schedule,
    cutters: [],
    schedulers: [],
    manufacturingEscalations: [],
    postInstallIssues: [],
  });
}

/**
 * Loads a dataset scoped to the current installer: only units assigned to them,
 * plus their buildings, clients, rooms, and windows.
 * ~10x smaller payload than loadFullDataset() for active installers.
 */
export async function loadInstallerDataset(installerId: string): Promise<AppDataset> {
  if (!installerId) return emptyDataset();

  const supabase = await createClient();

  const { data: unitData, error: unitError } = await supabase
    .from("units")
    .select("*")
    .eq("assigned_installer_id", installerId)
    .order("unit_number");

  if (unitError || !unitData?.length) return emptyDataset();

  const units = (unitData as UnitRow[]).map((r) => mapUnit(r));

  const allowedBuildingIds = [...new Set(units.map((u) => u.buildingId))];
  const allowedClientIds = [...new Set(units.map((u) => u.clientId))];
  const allowedUnitIds = units.map((u) => u.id);

  const [buildingRows, clientRows, roomRows, scheduleRows] = await Promise.all([
    selectInChunks<BuildingRow>(allowedBuildingIds, (chunk) =>
      supabase
        .from("buildings")
        .select("*")
        .in("id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as BuildingRow[] | null, error: res.error })),
    ),
    selectInChunks<ClientRow>(allowedClientIds, (chunk) =>
      supabase
        .from("clients")
        .select("*")
        .in("id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as ClientRow[] | null, error: res.error })),
    ),
    selectInChunks<RoomRow>(allowedUnitIds, (chunk) =>
      supabase
        .from("rooms")
        .select("*")
        .in("unit_id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as RoomRow[] | null, error: res.error })),
    ),
    selectInChunks<ScheduleRow>(allowedUnitIds, (chunk) =>
      supabase
        .from("schedule_entries")
        .select("*")
        .in("unit_id", chunk)
        .order("task_date")
        .then((res) => ({ data: res.data as ScheduleRow[] | null, error: res.error })),
    ),
  ]);

  const rooms = roomRows.map(mapRoom);
  const allowedRoomIds = rooms.map((r) => r.id);
  const windowRows = await selectInChunks<WindowRow>(allowedRoomIds, (chunk) =>
    supabase
      .from("windows")
      .select("*")
      .in("room_id", chunk)
      .order("label")
      .then((res) => ({ data: res.data as WindowRow[] | null, error: res.error })),
  );

  const schedule = normalizeScheduleEntries(
    units,
    scheduleRows.map(mapSchedule)
  );

  return finalizeDataset({
    clients: clientRows.map(mapClient),
    buildings: buildingRows.map(mapBuilding),
    units,
    rooms,
    windows: windowRows.map(mapWindow),
    installers: [],
    schedule,
    cutters: [],
    schedulers: [],
    manufacturingEscalations: [],
    postInstallIssues: [],
  });
}

export type InstallerMediaItem = {
  id: string;
  publicUrl: string;
  label: string | null;
  unitId: string;
  unitNumber: string;
  buildingId: string;
  buildingName: string;
  stage: UnitPhotoStage;
  createdAt: string;
};

export type UnitStageMediaItem = {
  id: string;
  publicUrl: string;
  label: string | null;
  unitId: string;
  roomId: string | null;
  roomName: string | null;
  windowId: string | null;
  windowLabel: string | null;
  uploadKind: string;
  stage: UnitPhotoStage;
  createdAt: string;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  uploadedByRole: string | null;
};

function normalizeMediaStage(
  stage: string | null,
  phase: string | null
): UnitPhotoStage {
  if (
    stage === "scheduled_bracketing" ||
    stage === "bracketed_measured" ||
    stage === "installed_pending_approval"
  ) {
    return stage;
  }
  return phase === "installation"
    ? "installed_pending_approval"
    : "bracketed_measured";
}

export async function loadInstallerMedia(
  installerId: string
): Promise<InstallerMediaItem[]> {
  const supabase = await createClient();
  const { data: units, error: ue } = await supabase
    .from("units")
    .select("id, unit_number, building_id, building_name")
    .eq("assigned_installer_id", installerId);
  if (ue) {
    throw new Error(ue.message);
  }
  type UnitMeta = { unit_number: string; building_id: string; building_name: string };
  const unitMap = new Map<string, UnitMeta>(
    (units ?? []).map((u) => [
      u.id,
      { unit_number: u.unit_number, building_id: u.building_id, building_name: u.building_name },
    ])
  );
  const unitIds = [...unitMap.keys()];
  if (unitIds.length === 0) {
    return [];
  }
  type InstallerMediaRow = {
    id: string;
    public_url: string;
    label: string | null;
    unit_id: string;
    stage: string | null;
    phase: string | null;
    created_at: string;
  };
  const media = await selectInChunks<InstallerMediaRow>(unitIds, (chunk) =>
    supabase
      .from("media_uploads")
      .select("id, public_url, label, unit_id, stage, phase, created_at")
      .in("unit_id", chunk)
      .order("created_at", { ascending: false })
      .then((res) => ({ data: res.data as InstallerMediaRow[] | null, error: res.error })),
  );
  return media.map((m) => {
    const meta = unitMap.get(m.unit_id);
    return {
      id: m.id,
      publicUrl: m.public_url,
      label: m.label,
      unitId: m.unit_id,
      unitNumber: meta?.unit_number ?? m.unit_id,
      buildingId: meta?.building_id ?? "",
      buildingName: meta?.building_name ?? "",
      stage: normalizeMediaStage(m.stage, m.phase),
      createdAt: m.created_at,
    };
  });
}

export async function loadUnitStageMedia(
  unitId: string
): Promise<UnitStageMediaItem[]> {
  const supabase = await createClient();

  // Try selecting with uploader columns (added in 20260414 migration).
  // If those columns don't exist yet, PostgREST returns a 400 — fall back
  // to the base column set so the app keeps working before migration runs.
  let media: MediaUploadRow[] | null = null;
  let hasUploaderColumns = true;

  const fullSelect =
    "id, public_url, label, unit_id, room_id, window_id, upload_kind, stage, phase, created_at, uploaded_by_user_id, uploaded_by_name, uploaded_by_role";
  const baseSelect =
    "id, public_url, label, unit_id, room_id, window_id, upload_kind, stage, phase, created_at";

  const [primaryResult, { data: rooms, error: roomError }] = await Promise.all([
    supabase
      .from("media_uploads")
      .select(fullSelect)
      .eq("unit_id", unitId)
      .order("created_at", { ascending: false }),
    supabase.from("rooms").select("id, name").eq("unit_id", unitId),
  ]);

  if (primaryResult.error) {
    // If the error looks like a missing-column error, retry without uploader cols.
    const msg = primaryResult.error.message ?? "";
    if (
      msg.includes("uploaded_by") ||
      msg.includes("column") ||
      primaryResult.error.code === "42703"
    ) {
      hasUploaderColumns = false;
      const fallback = await supabase
        .from("media_uploads")
        .select(baseSelect)
        .eq("unit_id", unitId)
        .order("created_at", { ascending: false });
      if (fallback.error) {
        throw new Error(
          `${fallback.error.message} Apply supabase/migrations/20250322140000_storage_and_media.sql if media_uploads is missing.`
        );
      }
      media = (fallback.data ?? []) as MediaUploadRow[];
    } else {
      throw new Error(
        `${primaryResult.error.message} Apply supabase/migrations/20250322140000_storage_and_media.sql if media_uploads is missing.`
      );
    }
  } else {
    media = (primaryResult.data ?? []) as MediaUploadRow[];
  }

  if (roomError) {
    throw new Error(roomError.message);
  }

  const roomMap = new Map((rooms ?? []).map((room) => [room.id, room.name]));
  const roomIds = [...roomMap.keys()];
  const { data: windows, error: windowError } = roomIds.length
    ? await supabase
        .from("windows")
        .select("id, room_id, label")
        .in("room_id", roomIds)
    : { data: [], error: null };

  if (windowError) {
    throw new Error(windowError.message);
  }

  const windowMap = new Map(
    (windows ?? []).map((window) => [window.id, { label: window.label, roomId: window.room_id }])
  );

  return (media ?? []).map((item) => {
    const windowMeta = item.window_id ? windowMap.get(item.window_id) : null;
    return {
      id: item.id,
      publicUrl: item.public_url,
      label: item.label,
      unitId: item.unit_id,
      roomId: item.room_id,
      roomName: item.room_id ? roomMap.get(item.room_id) ?? null : null,
      windowId: item.window_id,
      windowLabel: windowMeta?.label ?? null,
      uploadKind: item.upload_kind,
      stage: normalizeMediaStage(item.stage, item.phase),
      createdAt: item.created_at,
      uploadedByUserId: hasUploaderColumns ? (item.uploaded_by_user_id ?? null) : null,
      uploadedByName: hasUploaderColumns ? (item.uploaded_by_name ?? null) : null,
      uploadedByRole: hasUploaderColumns ? (item.uploaded_by_role ?? null) : null,
    };
  });
}

export async function loadNotifications(
  recipientRole: string,
  recipientId: string
): Promise<Notification[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_role", recipientRole)
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false });
  if (error) return [];

  const ids = (rows ?? []).map((r) => r.id);
  let readSet = new Set<string>();
  if (ids.length > 0) {
    const { data: reads } = await supabase
      .from("notification_reads")
      .select("notification_id")
      .eq("user_role", recipientRole)
      .eq("user_id", recipientId)
      .in("notification_id", ids);
    readSet = new Set((reads ?? []).map((r) => r.notification_id));
  }

  return (rows ?? []).map((r) => ({
    id: r.id,
    recipientRole: r.recipient_role,
    recipientId: r.recipient_id,
    type: r.type,
    title: r.title,
    body: r.body,
    relatedWeekStart: r.related_week_start,
    relatedUnitId: r.related_unit_id ?? null,
    createdAt: r.created_at,
    read: readSet.has(r.id),
  }));
}

/**
 * Lightweight loader for unit detail pages.
 * Fetches only the single unit, its rooms, and its windows.
 * ~10x faster than loadFullDataset for detail pages.
 * Returns an AppDataset with only units/rooms/windows populated.
 */
export async function loadUnitDetail(unitId: string): Promise<AppDataset> {
  const supabase = await createClient();

  const [unitRes, roomsRes] = await Promise.all([
    supabase.from("units").select("*").eq("id", unitId).single(),
    supabase.from("rooms").select("*").eq("unit_id", unitId).order("name"),
  ]);

  if (unitRes.error || !unitRes.data) return emptyDataset();

  const rooms = ((roomsRes.data as RoomRow[]) ?? []).map(mapRoom);
  const roomIds = rooms.map((r) => r.id);

  const windowsRes =
    roomIds.length > 0
      ? await supabase.from("windows").select("*").in("room_id", roomIds).order("label")
      : { data: [] };

  const unitRow = unitRes.data as UnitRow;
  const unit = mapUnit(unitRow);

  return finalizeDataset({
    ...emptyDataset(),
    units: [unit],
    rooms,
    windows: ((windowsRes.data as WindowRow[]) ?? []).map(mapWindow),
  });
}

export async function loadUnitActivityLog(
  unitId: string
): Promise<UnitActivityLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unit_activity_log")
    .select("*")
    .eq("unit_id", unitId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as UnitActivityLogRow[]).map(mapActivityLog);
}

export async function getUnreadNotificationCount(
  recipientRole: string,
  recipientId: string
): Promise<number> {
  const supabase = await createClient();
  const { count: total } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_role", recipientRole)
    .eq("recipient_id", recipientId);
  const { count: readCount } = await supabase
    .from("notification_reads")
    .select("*", { count: "exact", head: true })
    .eq("user_role", recipientRole)
    .eq("user_id", recipientId);
  return Math.max(0, (total ?? 0) - (readCount ?? 0));
}
