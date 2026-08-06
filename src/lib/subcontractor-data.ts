import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { assertRpcArrays } from "@/lib/contract";
import { queryTimeoutSignal } from "@/lib/query-timeout";
import type { ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";
import type {
  BlindType,
  ChainSide,
  FabricAdjustmentSide,
  ManufacturingIssueStatus,
  ManufacturingPartner,
  ProductionStatus,
  WandChain,
  WindowInstallation,
} from "@/lib/types";

type WorklistUnitRow = {
  id: string;
  building_id: string;
  client_id: string;
  unit_number: string;
  building_name: string;
  client_name: string;
  installation_date: string | null;
  complete_by_date: string | null;
  status: string;
  all_measured_at: string | null;
  manufacturing_assigned_at: string | null;
  production_entered_at: string | null;
};

type WorklistWindowRow = {
  id: string;
  room_id: string;
  unit_id: string;
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

type WorklistProductionRow = {
  window_id: string;
  unit_id: string;
  status: ProductionStatus;
  issue_status: ManufacturingIssueStatus;
  issue_reason: string | null;
  issue_notes: string | null;
  cut_at: string | null;
  assembled_at: string | null;
  qc_approved_at: string | null;
  manufacturing_label_printed_at: string | null;
  packaging_label_printed_at: string | null;
  cut_list_printed_at: string | null;
};

/**
 * A work-list row: the shared cutter item plus when it entered THIS partner's
 * queue. `queueAddedAt` is portal-specific, so it rides alongside rather than
 * being pushed into ManufacturingWindowItem, which the whole factory shares.
 */
export type SubcontractorWorkItem = ManufacturingWindowItem & {
  queueAddedAt: string | null;
};

export type SubcontractorWorklist = {
  partner: ManufacturingPartner | null;
  items: SubcontractorWorkItem[];
};

export const EMPTY_WORKLIST: SubcontractorWorklist = { partner: null, items: [] };

/**
 * The day a unit became visible to its partner: the later of being assigned to
 * them and being fully measured. A unit handed over before measurement is not yet
 * manufacturable, so it only shows up — and only starts ageing — once measurement
 * completes.
 */
function queueAddedAt(unit: WorklistUnitRow): string | null {
  const assigned = unit.manufacturing_assigned_at;
  const measured = unit.all_measured_at;
  if (!assigned) return measured;
  if (!measured) return assigned;
  return assigned > measured ? assigned : measured;
}

/**
 * The subcontractor portal's single read.
 *
 * Items are `ManufacturingWindowItem` — the same shape the cutter's queue uses —
 * so `toCutListRow()` and `buildCutListPdf()` work on them unchanged and the
 * partner literally reads the sheet the in-house cutter would have.
 *
 * The schedule-shaped fields (scheduledCutDate / targetReadyDate / escalations)
 * are null by construction: subcontracted units are excluded from
 * reflowManufacturingSchedules, so they have no internal schedule rows at all.
 * The portal's columns deliberately omit those, so nothing renders an empty cell.
 */
export const loadSubcontractorWorklist = cache(async (): Promise<SubcontractorWorklist> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("get_subcontractor_worklist")
    .abortSignal(queryTimeoutSignal());

  if (error || !data) return EMPTY_WORKLIST;

  const raw = data as {
    partner: {
      id: string;
      name: string;
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      is_internal: boolean | null;
    } | null;
    units: WorklistUnitRow[];
    rooms: Array<{ id: string; unit_id: string; name: string }>;
    windows: WorklistWindowRow[];
    production: WorklistProductionRow[];
  };

  assertRpcArrays("get_subcontractor_worklist", raw, [
    "units",
    "rooms",
    "windows",
    "production",
  ]);

  const unitsById = new Map((raw.units ?? []).map((u) => [u.id, u]));
  const roomsById = new Map((raw.rooms ?? []).map((r) => [r.id, r]));
  const productionByWindow = new Map((raw.production ?? []).map((p) => [p.window_id, p]));

  const items: SubcontractorWorkItem[] = [];
  for (const window of raw.windows ?? []) {
    const unit = unitsById.get(window.unit_id);
    if (!unit) continue;
    const production = productionByWindow.get(window.id);

    items.push({
      windowId: window.id,
      unitId: unit.id,
      buildingId: unit.building_id,
      clientId: unit.client_id,
      unitNumber: unit.unit_number,
      buildingName: unit.building_name,
      clientName: unit.client_name,
      installationDate: unit.installation_date,
      completeByDate: unit.complete_by_date,
      targetReadyDate: null,
      roomName: roomsById.get(window.room_id)?.name ?? "Room",
      label: window.label,
      blindType: window.blind_type,
      width: window.width,
      height: window.height,
      depth: window.depth,
      notes: window.notes ?? "",
      productionStatus: production?.status ?? "pending",
      issueStatus: production?.issue_status ?? "none",
      issueReason: production?.issue_reason ?? "",
      issueNotes: production?.issue_notes ?? "",
      escalation: null,
      latestEscalation: null,
      escalationHistory: [],
      wasReworkInCycle: false,
      cutAt: production?.cut_at ?? null,
      assembledAt: production?.assembled_at ?? null,
      qcApprovedAt: production?.qc_approved_at ?? null,
      manufacturingLabelPrintedAt: production?.manufacturing_label_printed_at ?? null,
      packagingLabelPrintedAt: production?.packaging_label_printed_at ?? null,
      cutListPrintedAt: production?.cut_list_printed_at ?? null,
      allMeasuredAt: unit.all_measured_at,
      productionEnteredAt: unit.production_entered_at,
      scheduledCutDate: null,
      scheduledAssemblyDate: null,
      scheduledQcDate: null,
      isScheduleLocked: false,
      overCapacityOverride: false,
      windowInstallation: (window.window_installation ?? "inside") as WindowInstallation,
      wandChain: (window.wand_chain ?? null) as WandChain | null,
      fabricAdjustmentSide: (window.fabric_adjustment_side ?? "none") as FabricAdjustmentSide,
      fabricAdjustmentInches: window.fabric_adjustment_inches ?? null,
      chainSide: (window.chain_side ?? null) as ChainSide | null,
      queueAddedAt: queueAddedAt(unit),
    });
  }

  // Oldest first, always. The partner asked for a fixed order with no sort or
  // filter controls, so the ordering is a property of the data, not the UI.
  items.sort((a, b) => {
    const byDate = (a.queueAddedAt ?? "").localeCompare(b.queueAddedAt ?? "");
    if (byDate !== 0) return byDate;
    const byUnit = a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
    if (byUnit !== 0) return byUnit;
    const byRoom = a.roomName.localeCompare(b.roomName);
    return byRoom !== 0 ? byRoom : a.label.localeCompare(b.label, undefined, { numeric: true });
  });

  // Same instrument as logFactoryPayload: the RSC stream is not covered by
  // `npm run perf-budget`, so this is the only check on the ≤300 KB target.
  console.warn(
    `[perf][subcontractor-payload] items=${items.length} bytes=${JSON.stringify(items).length}`
  );

  return {
    partner: raw.partner
      ? {
          id: raw.partner.id,
          name: raw.partner.name,
          contactName: raw.partner.contact_name ?? "",
          contactEmail: raw.partner.contact_email ?? "",
          contactPhone: raw.partner.contact_phone ?? "",
          isInternal: raw.partner.is_internal ?? false,
        }
      : null,
    items,
  };
});
