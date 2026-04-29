import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  PROGRESS_STAGE_LABELS,
  PROGRESS_STAGES,
  type ProgressStage,
} from "@/lib/types";
import { ProgressReport, type ProgressReportOption, type ProgressReportRow } from "./progress-report";

type SearchParams = Record<string, string | string[] | undefined>;

type RawSnapshotRow = {
  id: string;
  snapshot_date: string;
  stage: ProgressStage;
  unit_id: string;
  building_id: string;
  client_id: string;
  floor: number | null;
  expected_blinds: number;
  done_blinds: number;
  assigned_user_ids: unknown;
  assigned_display: string | null;
  units: { unit_number: string | null } | Array<{ unit_number: string | null }> | null;
  buildings: { name: string | null } | Array<{ name: string | null }> | null;
  clients: { name: string | null } | Array<{ name: string | null }> | null;
};

type SchedulerOption = ProgressReportOption & {
  authUserId: string | null;
};

const ROLE_FILTER_BY_STAGE: Partial<Record<ProgressStage, "installer" | "cutter" | "assembler" | "qc">> = {
  measurement: "installer",
  bracketing: "installer",
  installation: "installer",
  cutting: "cutter",
  assembling: "assembler",
  qc: "qc",
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function splitParam(value: string | string[] | undefined): string[] {
  const raw = firstParam(value);
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function todayInToronto(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addUtcDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function isDateKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function normalizeDateRange(params: SearchParams) {
  const today = todayInToronto();
  let to = isDateKey(firstParam(params.to)) ? firstParam(params.to)! : today;
  let from = isDateKey(firstParam(params.from)) ? firstParam(params.from)! : addUtcDays(to, -6);

  if (from > to) {
    [from, to] = [to, from];
  }

  const earliestAllowed = addUtcDays(to, -89);
  if (from < earliestAllowed) from = earliestAllowed;

  return { from, to };
}

function normalizeStage(value: string | undefined): ProgressStage {
  return PROGRESS_STAGES.includes(value as ProgressStage) ? (value as ProgressStage) : "cutting";
}

function unwrapName<T extends Record<string, string | null>>(
  value: T | T[] | null,
  key: keyof T,
  fallback: string
): string {
  const row = Array.isArray(value) ? value[0] : value;
  const name = row?.[key];
  return typeof name === "string" && name.trim() ? name : fallback;
}

function parseAssignedUserIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function intersects(left: string[], right: string[]) {
  if (right.length === 0) return true;
  return left.some((value) => right.includes(value));
}

function optionRows<T extends { id: string; name: string | null }>(rows: T[] | null): ProgressReportOption[] {
  return (rows ?? [])
    .map((row) => ({ value: row.id, label: row.name?.trim() || "Unnamed" }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

function sortRows(a: ProgressReportRow, b: ProgressReportRow) {
  return (
    a.snapshotDate.localeCompare(b.snapshotDate) ||
    a.buildingName.localeCompare(b.buildingName, undefined, { numeric: true }) ||
    (a.floor ?? Number.MAX_SAFE_INTEGER) - (b.floor ?? Number.MAX_SAFE_INTEGER) ||
    a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
  );
}

async function loadProgressReportData(params: SearchParams) {
  const supabase = await createClient();
  const stage = normalizeStage(firstParam(params.stage));
  const { from, to } = normalizeDateRange(params);
  const clientIds = splitParam(params.clients);
  const buildingIds = splitParam(params.buildings);
  const installerIds = splitParam(params.installers);
  const schedulerIds = splitParam(params.schedulers);
  const cutterIds = splitParam(params.cutters);
  const assemblerIds = splitParam(params.assemblers);
  const qcIds = splitParam(params.qcs);

  const [
    clientsRes,
    buildingsRes,
    installersRes,
    schedulersRes,
    cuttersRes,
    assemblersRes,
    qcsRes,
  ] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("buildings").select("id, name, client_id").order("name"),
    supabase.from("installers").select("id, name").order("name"),
    supabase.from("schedulers").select("id, name, auth_user_id").order("name"),
    supabase.from("cutters").select("id, name").order("name"),
    supabase.from("assemblers").select("id, name").order("name"),
    supabase.from("qcs").select("id, name").order("name"),
  ]);

  let query = supabase
    .from("daily_progress_snapshots")
    .select(
      "id, snapshot_date, stage, unit_id, building_id, client_id, floor, expected_blinds, done_blinds, assigned_user_ids, assigned_display, units(unit_number), buildings(name), clients(name)"
    )
    .eq("stage", stage)
    .gte("snapshot_date", from)
    .lte("snapshot_date", to);

  if (clientIds.length > 0) query = query.in("client_id", clientIds);
  if (buildingIds.length > 0) query = query.in("building_id", buildingIds);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load progress snapshots: ${error.message}`);

  const schedulerOptions: SchedulerOption[] = (schedulersRes.data ?? [])
    .map((row) => ({
      value: row.id,
      label: row.name?.trim() || "Unnamed",
      authUserId: row.auth_user_id ?? null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  const schedulerUnitIds =
    schedulerIds.length > 0 && stage !== "post_install_issue"
      ? await loadSchedulerUnitIds(supabase, schedulerIds)
      : null;
  const schedulerAuthIds = schedulerOptions
    .filter((scheduler) => schedulerIds.includes(scheduler.value) && scheduler.authUserId)
    .map((scheduler) => scheduler.authUserId as string);

  const activeRoleFilter = ROLE_FILTER_BY_STAGE[stage];
  const activeRoleIds =
    activeRoleFilter === "installer"
      ? installerIds
      : activeRoleFilter === "cutter"
        ? cutterIds
        : activeRoleFilter === "assembler"
          ? assemblerIds
          : activeRoleFilter === "qc"
            ? qcIds
            : [];

  const rows = ((data ?? []) as RawSnapshotRow[])
    .map((row): ProgressReportRow => ({
      id: row.id,
      snapshotDate: row.snapshot_date,
      stage: row.stage,
      unitId: row.unit_id,
      buildingId: row.building_id,
      clientId: row.client_id,
      clientName: unwrapName(row.clients, "name", "Unknown client"),
      buildingName: unwrapName(row.buildings, "name", "Unknown building"),
      unitNumber: unwrapName(row.units, "unit_number", "Unknown"),
      floor: row.floor,
      expectedBlinds: row.expected_blinds,
      doneBlinds: row.done_blinds,
      assignedUserIds: parseAssignedUserIds(row.assigned_user_ids),
      assignedDisplay: row.assigned_display,
    }))
    .filter((row) => intersects(row.assignedUserIds, activeRoleIds))
    .filter((row) => {
      if (schedulerIds.length === 0) return true;
      if (stage === "post_install_issue") return intersects(row.assignedUserIds, schedulerAuthIds);
      return schedulerUnitIds ? schedulerUnitIds.has(row.unitId) : false;
    })
    .sort(sortRows);

  return {
    rows,
    initialFilters: {
      stage,
      from,
      to,
      clients: clientIds,
      buildings: buildingIds,
      installers: installerIds,
      schedulers: schedulerIds,
      cutters: cutterIds,
      assemblers: assemblerIds,
      qcs: qcIds,
    },
    options: {
      stages: PROGRESS_STAGES.map((value) => ({ value, label: PROGRESS_STAGE_LABELS[value] })),
      clients: optionRows(clientsRes.data ?? []),
      buildings: (buildingsRes.data ?? [])
        .map((row) => ({
          value: row.id,
          label: row.name?.trim() || "Unnamed",
          clientId: row.client_id as string,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
      installers: optionRows(installersRes.data ?? []),
      schedulers: schedulerOptions.map(({ value, label }) => ({ value, label })),
      cutters: optionRows(cuttersRes.data ?? []),
      assemblers: optionRows(assemblersRes.data ?? []),
      qcs: optionRows(qcsRes.data ?? []),
    },
  };
}

async function loadSchedulerUnitIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schedulerIds: string[]
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("scheduler_unit_assignments")
    .select("unit_id")
    .in("scheduler_id", schedulerIds);

  if (error) return new Set();
  return new Set((data ?? []).map((row) => row.unit_id as string));
}

export default async function ProgressReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const data = await loadProgressReportData(params);

  return (
    <>
      <div className="border-b border-border-subtle bg-card px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary mb-2">Reports</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <Link
            href="/management/reports"
            className="inline-flex h-9 items-center rounded-full border-2 border-border bg-card px-4 text-[13px] font-semibold text-secondary transition-all hover:border-zinc-300 hover:text-foreground active:scale-[0.97]"
          >
            Status Grid
          </Link>
          <span className="inline-flex h-9 items-center rounded-full bg-zinc-900 px-4 text-[13px] font-semibold text-white shadow-sm">
            Progress Report
          </span>
        </div>
      </div>
      <ProgressReport {...data} />
    </>
  );
}
