import { createClient } from "@/lib/supabase/server";
import type { RiskFlag, BlindType, UnitStatus, WindowProductionStatus, ProductionStatus, WindowInstallation, WandChain, FabricAdjustmentSide } from "@/lib/types";

export interface CutterUnit {
  id: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  status: UnitStatus;
  windowCount: number;
  manufacturingRiskFlag: RiskFlag;
}

export interface CutterRoom {
  id: string;
  unitId: string;
  name: string;
  windowCount: number;
}

export interface CutterWindow {
  id: string;
  roomId: string;
  label: string;
  blindType: BlindType;
  chainSide: "left" | "right" | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  windowInstallation: WindowInstallation;
  wandChain: WandChain | null;
  fabricAdjustmentSide: FabricAdjustmentSide;
  fabricAdjustmentInches: number | null;
  notes: string;
  production: WindowProductionStatus | null;
}

export interface CutterDataset {
  units: CutterUnit[];
}

export interface CutterUnitDetail {
  unit: CutterUnit;
  rooms: CutterRoom[];
  windows: CutterWindow[];
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
    qcApprovedByQcId: (p.qc_approved_by_qc_id as string) ?? null,
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

/** All units in 'measured' status with an installation date — the cutting queue. */
export async function loadCutterDataset(): Promise<CutterDataset> {
  const supabase = await createClient();

  const { data: units, error } = await supabase
    .from("units")
    .select(
      "id, unit_number, building_name, client_name, installation_date, status, window_count, manufacturing_risk_flag"
    )
    .eq("status", "measured")
    .order("installation_date", { ascending: true, nullsFirst: false });

  if (error || !units) return { units: [] };

  return {
    units: units.map((u) => ({
      id: u.id,
      unitNumber: u.unit_number,
      buildingName: u.building_name,
      clientName: u.client_name,
      installationDate: u.installation_date ?? null,
      status: u.status as UnitStatus,
      windowCount: u.window_count ?? 0,
      manufacturingRiskFlag: (u.manufacturing_risk_flag ?? "green") as RiskFlag,
    })),
  };
}

/** Full detail for one unit: rooms, windows, and production statuses. */
export async function loadCutterUnitDetail(
  unitId: string
): Promise<CutterUnitDetail | null> {
  const supabase = await createClient();

  const [unitRes, roomsRes, windowsRes, productionRes] = await Promise.all([
    supabase
      .from("units")
      .select(
        "id, unit_number, building_name, client_name, installation_date, status, window_count, manufacturing_risk_flag"
      )
      .eq("id", unitId)
      .single(),
    supabase
      .from("rooms")
      .select("id, unit_id, name, window_count")
      .eq("unit_id", unitId)
      .order("name"),
    supabase
      .from("windows")
      .select(
        "id, room_id, label, blind_type, chain_side, width, height, depth, window_installation, wand_chain, fabric_adjustment_side, fabric_adjustment_inches, notes"
      )
      .order("label"),
    supabase
      .from("window_production_status")
      .select("*")
      .eq("unit_id", unitId),
  ]);

  if (unitRes.error || !unitRes.data) return null;

  const u = unitRes.data;
  const unit: CutterUnit = {
    id: u.id,
    unitNumber: u.unit_number,
    buildingName: u.building_name,
    clientName: u.client_name,
    installationDate: u.installation_date ?? null,
    status: u.status as UnitStatus,
    windowCount: u.window_count ?? 0,
    manufacturingRiskFlag: (u.manufacturing_risk_flag ?? "green") as RiskFlag,
  };

  const rooms: CutterRoom[] = (roomsRes.data ?? []).map((r) => ({
    id: r.id,
    unitId: r.unit_id,
    name: r.name,
    windowCount: r.window_count ?? 0,
  }));

  const roomIds = new Set(rooms.map((r) => r.id));
  const productionMap = new Map<string, WindowProductionStatus>(
    (productionRes.data ?? []).map((p) => [
      p.window_id,
      mapProductionStatus(p as unknown as Record<string, unknown>),
    ])
  );

  const windows: CutterWindow[] = (windowsRes.data ?? [])
    .filter((w) => roomIds.has(w.room_id))
    .map((w) => ({
      id: w.id,
      roomId: w.room_id,
      label: w.label,
      blindType: w.blind_type as BlindType,
      chainSide: (w.chain_side as "left" | "right" | null) ?? null,
      width: w.width ?? null,
      height: w.height ?? null,
      depth: w.depth ?? null,
      windowInstallation: (w.window_installation as WindowInstallation) ?? "inside",
      wandChain: (w.wand_chain as WandChain | null) ?? null,
      fabricAdjustmentSide: (w.fabric_adjustment_side as FabricAdjustmentSide) ?? "none",
      fabricAdjustmentInches: w.fabric_adjustment_inches ?? null,
      notes: w.notes ?? "",
      production: productionMap.get(w.id) ?? null,
    }));

  return { unit, rooms, windows };
}
