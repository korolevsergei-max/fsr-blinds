import { createClient } from "@/lib/supabase/server";
import type { RiskFlag, BlindType, WindowProductionStatus, ProductionStatus } from "@/lib/types";

export interface AssemblerUnit {
  id: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  windowCount: number;
  manufacturingRiskFlag: RiskFlag;
  cutCount: number;
  assembledCount: number;
  qcApprovedCount: number;
}

export interface AssemblerWindow {
  id: string;
  roomId: string;
  label: string;
  blindType: BlindType;
  width: number | null;
  height: number | null;
  depth: number | null;
  blindWidth: number | null;
  blindHeight: number | null;
  blindDepth: number | null;
  notes: string;
  production: WindowProductionStatus | null;
}

export interface AssemblerRoom {
  id: string;
  unitId: string;
  name: string;
}

export interface AssemblerUnitDetail {
  unit: AssemblerUnit;
  rooms: AssemblerRoom[];
  windows: AssemblerWindow[];
}

function mapProductionStatus(p: Record<string, unknown>): WindowProductionStatus {
  return {
    id: p.id as string,
    windowId: p.window_id as string,
    unitId: p.unit_id as string,
    status: p.status as ProductionStatus,
    cutByCutterId: (p.cut_by_cutter_id as string) ?? null,
    cutAt: (p.cut_at as string) ?? null,
    cutNotes: (p.cut_notes as string) ?? "",
    assembledByAssemblerId: (p.assembled_by_assembler_id as string) ?? null,
    assembledAt: (p.assembled_at as string) ?? null,
    assembledNotes: (p.assembled_notes as string) ?? "",
    qcApprovedByAssemblerId: (p.qc_approved_by_assembler_id as string) ?? null,
    qcApprovedAt: (p.qc_approved_at as string) ?? null,
    qcNotes: (p.qc_notes as string) ?? "",
    issueStatus: (p.issue_status as "none" | "open" | "resolved") ?? "none",
    issueReason: (p.issue_reason as string) ?? "",
    issueNotes: (p.issue_notes as string) ?? "",
    issueReportedByRole: (p.issue_reported_by_role as string) ?? null,
    issueReportedAt: (p.issue_reported_at as string) ?? null,
    issueResolvedAt: (p.issue_resolved_at as string) ?? null,
    createdAt: p.created_at as string,
  };
}

/** Units where at least one window is in 'cut' or 'assembled' status (ready for assembler). */
export async function loadAssemblerDataset(): Promise<{ units: AssemblerUnit[] }> {
  const supabase = await createClient();

  // Get all window_production_status rows to find units with cut/assembled windows
  const { data: prodRows } = await supabase
    .from("window_production_status")
    .select("unit_id, status");

  if (!prodRows || prodRows.length === 0) return { units: [] };

  // Find unit IDs that have at least one window in any production state (keep units visible through QC)
  const unitIdsReady = [
    ...new Set(
      prodRows
        .filter((r) => r.status === "cut" || r.status === "assembled" || r.status === "qc_approved")
        .map((r) => r.unit_id)
    ),
  ];

  if (unitIdsReady.length === 0) return { units: [] };

  const { data: units } = await supabase
    .from("units")
    .select(
      "id, unit_number, building_name, client_name, installation_date, window_count, manufacturing_risk_flag"
    )
    .in("id", unitIdsReady)
    .order("installation_date", { ascending: true, nullsFirst: false });

  if (!units) return { units: [] };

  // Build counts per unit
  const cutMap = new Map<string, number>();
  const assembledMap = new Map<string, number>();
  const qcMap = new Map<string, number>();
  for (const row of prodRows) {
    if (row.status === "cut" || row.status === "assembled" || row.status === "qc_approved") {
      cutMap.set(row.unit_id, (cutMap.get(row.unit_id) ?? 0) + 1);
    }
    if (row.status === "assembled" || row.status === "qc_approved") {
      assembledMap.set(row.unit_id, (assembledMap.get(row.unit_id) ?? 0) + 1);
    }
    if (row.status === "qc_approved") {
      qcMap.set(row.unit_id, (qcMap.get(row.unit_id) ?? 0) + 1);
    }
  }

  return {
    units: units.map((u) => ({
      id: u.id,
      unitNumber: u.unit_number,
      buildingName: u.building_name,
      clientName: u.client_name,
      installationDate: u.installation_date ?? null,
      windowCount: u.window_count ?? 0,
      manufacturingRiskFlag: (u.manufacturing_risk_flag ?? "green") as RiskFlag,
      cutCount: cutMap.get(u.id) ?? 0,
      assembledCount: assembledMap.get(u.id) ?? 0,
      qcApprovedCount: qcMap.get(u.id) ?? 0,
    })),
  };
}

export async function loadAssemblerUnitDetail(unitId: string): Promise<AssemblerUnitDetail | null> {
  const supabase = await createClient();

  const [unitRes, roomsRes, windowsRes, productionRes] = await Promise.all([
    supabase
      .from("units")
      .select(
        "id, unit_number, building_name, client_name, installation_date, window_count, manufacturing_risk_flag"
      )
      .eq("id", unitId)
      .single(),
    supabase
      .from("rooms")
      .select("id, unit_id, name")
      .eq("unit_id", unitId)
      .order("name"),
    supabase
      .from("windows")
      .select(
        "id, room_id, label, blind_type, width, height, depth, blind_width, blind_height, blind_depth, notes"
      )
      .order("label"),
    supabase
      .from("window_production_status")
      .select("*")
      .eq("unit_id", unitId),
  ]);

  if (unitRes.error || !unitRes.data) return null;

  const u = unitRes.data;
  const rooms: AssemblerRoom[] = (roomsRes.data ?? []).map((r) => ({
    id: r.id,
    unitId: r.unit_id,
    name: r.name,
  }));

  const roomIds = new Set(rooms.map((r) => r.id));
  const productionMap = new Map<string, WindowProductionStatus>(
    (productionRes.data ?? []).map((p) => [
      p.window_id,
      mapProductionStatus(p as unknown as Record<string, unknown>),
    ])
  );

  const cutCount = [...productionMap.values()].filter(
    (p) => p.status === "cut" || p.status === "assembled" || p.status === "qc_approved"
  ).length;
  const assembledCount = [...productionMap.values()].filter(
    (p) => p.status === "assembled" || p.status === "qc_approved"
  ).length;
  const qcApprovedCount = [...productionMap.values()].filter(
    (p) => p.status === "qc_approved"
  ).length;

  const unit: AssemblerUnit = {
    id: u.id,
    unitNumber: u.unit_number,
    buildingName: u.building_name,
    clientName: u.client_name,
    installationDate: u.installation_date ?? null,
    windowCount: u.window_count ?? 0,
    manufacturingRiskFlag: (u.manufacturing_risk_flag ?? "green") as RiskFlag,
    cutCount,
    assembledCount,
    qcApprovedCount,
  };

  const windows: AssemblerWindow[] = (windowsRes.data ?? [])
    .filter((w) => roomIds.has(w.room_id))
    .map((w) => ({
      id: w.id,
      roomId: w.room_id,
      label: w.label,
      blindType: w.blind_type as BlindType,
      width: w.width ?? null,
      height: w.height ?? null,
      depth: w.depth ?? null,
      blindWidth: w.blind_width ?? null,
      blindHeight: w.blind_height ?? null,
      blindDepth: w.blind_depth ?? null,
      notes: w.notes ?? "",
      production: productionMap.get(w.id) ?? null,
    }));

  return { unit, rooms, windows };
}
