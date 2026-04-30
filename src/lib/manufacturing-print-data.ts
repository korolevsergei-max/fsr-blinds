import { createClient } from "@/lib/supabase/server";
import type {
  BlindType,
  ChainSide,
  FabricAdjustmentSide,
  ManufacturingIssueStatus,
  ProductionStatus,
  WandChain,
  WindowInstallation,
} from "@/lib/types";
import type { ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";
import type { LabelMode } from "@/lib/cut-labels";
import { loadOpenManufacturingEscalationsByWindow } from "@/lib/manufacturing-escalations";
import { selectInChunks } from "@/lib/supabase-chunking";

type UnitRow = {
  id: string;
  building_id: string;
  client_id: string;
  unit_number: string;
  building_name: string;
  client_name: string;
  installation_date: string | null;
  complete_by_date: string | null;
};

type WindowRow = {
  id: string;
  room_id: string;
  label: string;
  blind_type: BlindType;
  width: number | null;
  height: number | null;
  depth: number | null;
  notes: string | null;
  window_installation: string | null;
  wand_chain: number | null;
  fabric_adjustment_side: string | null;
  fabric_adjustment_inches: number | null;
  chain_side: string | null;
};

type ScheduleRow = {
  window_id: string;
  unit_id: string;
  target_ready_date: string | null;
  scheduled_cut_date: string | null;
};

type ProductionRow = {
  window_id: string;
  status: ProductionStatus;
  issue_status: ManufacturingIssueStatus;
  issue_reason: string | null;
  issue_notes: string | null;
  cut_at: string | null;
  assembled_at: string | null;
  qc_approved_at: string | null;
  manufacturing_label_printed_at: string | null;
  packaging_label_printed_at: string | null;
};

export async function loadWindowsForPrint(
  windowIds: string[],
  options: { skipPrinted?: boolean; labelMode?: LabelMode } = {},
): Promise<ManufacturingWindowItem[]> {
  if (windowIds.length === 0) return [];

  const supabase = await createClient();

  const [schedules, windows, productionRows, escalationByWindow] = await Promise.all([
    selectInChunks<ScheduleRow>(windowIds, (chunk) =>
      supabase
        .from("window_manufacturing_schedule")
        .select("window_id, unit_id, target_ready_date, scheduled_cut_date")
        .in("window_id", chunk)
        .then((res) => ({ data: res.data as ScheduleRow[] | null, error: res.error })),
    ),
    selectInChunks<WindowRow>(windowIds, (chunk) =>
      supabase
        .from("windows")
        .select("id, room_id, label, blind_type, width, height, depth, notes, window_installation, wand_chain, fabric_adjustment_side, fabric_adjustment_inches, chain_side")
        .in("id", chunk)
        .then((res) => ({ data: res.data as WindowRow[] | null, error: res.error })),
    ),
    selectInChunks<ProductionRow>(windowIds, (chunk) =>
      supabase
        .from("window_production_status")
        .select("window_id, status, issue_status, issue_reason, issue_notes, cut_at, assembled_at, qc_approved_at, manufacturing_label_printed_at, packaging_label_printed_at")
        .in("window_id", chunk)
        .then((res) => ({ data: res.data as ProductionRow[] | null, error: res.error })),
    ),
    loadOpenManufacturingEscalationsByWindow(supabase, windowIds),
  ]);

  const unitIds = [...new Set(schedules.map((s) => s.unit_id))];
  const roomIds = [...new Set(windows.map((w) => w.room_id))];

  const [units, rooms] = await Promise.all([
    selectInChunks<UnitRow>(unitIds, (chunk) =>
      supabase
        .from("units")
        .select("id, building_id, client_id, unit_number, building_name, client_name, installation_date, complete_by_date")
        .in("id", chunk)
        .then((res) => ({ data: res.data as UnitRow[] | null, error: res.error })),
    ),
    selectInChunks<{ id: string; name: string }>(roomIds, (chunk) =>
      supabase
        .from("rooms")
        .select("id, name")
        .in("id", chunk)
        .then((res) => ({ data: res.data as Array<{ id: string; name: string }> | null, error: res.error })),
    ),
  ]);

  const unitsById = new Map(units.map((u) => [u.id, u]));
  const windowsById = new Map(windows.map((w) => [w.id, w]));
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const productionByWindow = new Map(productionRows.map((p) => [p.window_id, p]));
  const scheduleByWindow = new Map(schedules.map((s) => [s.window_id, s]));

  const itemsByWindowId = new Map<string, ManufacturingWindowItem>();

  for (const windowId of windowIds) {
    const schedule = scheduleByWindow.get(windowId);
    const win = windowsById.get(windowId);
    if (!win || !schedule) continue;

    const unit = unitsById.get(schedule.unit_id);
    if (!unit) continue;

    const production = productionByWindow.get(windowId);
    const roomName = roomsById.get(win.room_id)?.name ?? "Room";
    const escalation = escalationByWindow.get(windowId) ?? null;

    const item: ManufacturingWindowItem = {
      windowId,
      unitId: schedule.unit_id,
      buildingId: unit.building_id,
      clientId: unit.client_id,
      unitNumber: unit.unit_number,
      buildingName: unit.building_name,
      clientName: unit.client_name,
      installationDate: unit.installation_date,
      completeByDate: unit.complete_by_date,
      targetReadyDate: schedule.target_ready_date,
      roomName,
      label: win.label,
      blindType: win.blind_type,
      width: win.width,
      height: win.height,
      depth: win.depth,
      notes: win.notes ?? "",
      productionStatus: production?.status ?? "pending",
      issueStatus: production?.issue_status ?? "none",
      issueReason: production?.issue_reason ?? "",
      issueNotes: production?.issue_notes ?? "",
      escalation,
      latestEscalation: escalation,
      escalationHistory: escalation ? [escalation] : [],
      wasReworkInCycle: escalation !== null,
      cutAt: production?.cut_at ?? null,
      assembledAt: production?.assembled_at ?? null,
      qcApprovedAt: production?.qc_approved_at ?? null,
      manufacturingLabelPrintedAt: production?.manufacturing_label_printed_at ?? null,
      packagingLabelPrintedAt: production?.packaging_label_printed_at ?? null,
      scheduledCutDate: schedule.scheduled_cut_date,
      scheduledAssemblyDate: null,
      scheduledQcDate: null,
      isScheduleLocked: false,
      overCapacityOverride: false,
      windowInstallation: (win.window_installation as WindowInstallation) ?? "inside",
      wandChain: (win.wand_chain as WandChain | null) ?? null,
      fabricAdjustmentSide: (win.fabric_adjustment_side as FabricAdjustmentSide) ?? "none",
      fabricAdjustmentInches: win.fabric_adjustment_inches,
      chainSide: (win.chain_side as ChainSide | null) ?? null,
    };

    if (item.productionStatus !== "pending") continue;

    if (options.skipPrinted && options.labelMode) {
      const mfgPrinted = production?.manufacturing_label_printed_at != null;
      const pkgPrinted = production?.packaging_label_printed_at != null;
      if (options.labelMode === "manufacturing" && mfgPrinted) continue;
      if (options.labelMode === "packaging" && pkgPrinted) continue;
      if (options.labelMode === "both" && mfgPrinted && pkgPrinted) continue;
    }

    itemsByWindowId.set(windowId, item);
  }

  return windowIds
    .map((windowId) => itemsByWindowId.get(windowId) ?? null)
    .filter((item): item is ManufacturingWindowItem => item !== null);
}
