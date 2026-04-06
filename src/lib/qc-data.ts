import { createClient } from "@/lib/supabase/server";
import type { RiskFlag, BlindType, UnitStatus, WindowProductionStatus, ProductionStatus } from "@/lib/types";

export interface QCUnit {
  id: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  windowCount: number;
  manufacturingRiskFlag: RiskFlag;
  builtCount: number;
  qcApprovedCount: number;
}

export interface QCWindow {
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

export interface QCRoom {
  id: string;
  unitId: string;
  name: string;
}

export interface QCUnitDetail {
  unit: QCUnit;
  rooms: QCRoom[];
  windows: QCWindow[];
}

/** Units where at least one window is in 'built' status (ready for QC). */
export async function loadQCDataset(): Promise<{ units: QCUnit[] }> {
  const supabase = await createClient();

  // Get all window_production_status rows to find units with 'built' windows
  const { data: prodRows } = await supabase
    .from("window_production_status")
    .select("unit_id, status");

  if (!prodRows || prodRows.length === 0) return { units: [] };

  // Find unit IDs that have at least one 'built' window
  const unitIdsWithBuilt = [
    ...new Set(
      prodRows.filter((r) => r.status === "built").map((r) => r.unit_id)
    ),
  ];

  if (unitIdsWithBuilt.length === 0) return { units: [] };

  const { data: units } = await supabase
    .from("units")
    .select(
      "id, unit_number, building_name, client_name, installation_date, window_count, manufacturing_risk_flag"
    )
    .in("id", unitIdsWithBuilt)
    .order("installation_date", { ascending: true, nullsFirst: false });

  if (!units) return { units: [] };

  // Build counts per unit
  const builtMap = new Map<string, number>();
  const qcMap = new Map<string, number>();
  for (const row of prodRows) {
    if (row.status === "built" || row.status === "qc_approved") {
      builtMap.set(row.unit_id, (builtMap.get(row.unit_id) ?? 0) + 1);
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
      builtCount: builtMap.get(u.id) ?? 0,
      qcApprovedCount: qcMap.get(u.id) ?? 0,
    })),
  };
}

export async function loadQCUnitDetail(unitId: string): Promise<QCUnitDetail | null> {
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
  const rooms: QCRoom[] = (roomsRes.data ?? []).map((r) => ({
    id: r.id,
    unitId: r.unit_id,
    name: r.name,
  }));

  const roomIds = new Set(rooms.map((r) => r.id));
  const productionMap = new Map<string, WindowProductionStatus>(
    (productionRes.data ?? []).map((p) => [
      p.window_id,
      {
        id: p.id,
        windowId: p.window_id,
        unitId: p.unit_id,
        status: p.status as ProductionStatus,
        builtByManufacturerId: p.built_by_manufacturer_id ?? null,
        builtAt: p.built_at ?? null,
        builtNotes: p.built_notes ?? "",
        qcApprovedByQcId: p.qc_approved_by_qc_id ?? null,
        qcApprovedAt: p.qc_approved_at ?? null,
        qcNotes: p.qc_notes ?? "",
        createdAt: p.created_at,
      },
    ])
  );

  const builtCount = [...productionMap.values()].filter(
    (p) => p.status === "built" || p.status === "qc_approved"
  ).length;
  const qcApprovedCount = [...productionMap.values()].filter(
    (p) => p.status === "qc_approved"
  ).length;

  const unit: QCUnit = {
    id: u.id,
    unitNumber: u.unit_number,
    buildingName: u.building_name,
    clientName: u.client_name,
    installationDate: u.installation_date ?? null,
    windowCount: u.window_count ?? 0,
    manufacturingRiskFlag: (u.manufacturing_risk_flag ?? "green") as RiskFlag,
    builtCount,
    qcApprovedCount,
  };

  const windows: QCWindow[] = (windowsRes.data ?? [])
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
