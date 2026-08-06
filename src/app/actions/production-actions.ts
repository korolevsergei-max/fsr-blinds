"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeUnitStatus } from "@/lib/unit-progress";
import {
  requireCutter,
  requireAssembler,
  requireQc,
  getLinkedCutterId,
  getLinkedAssemblerId,
  getLinkedQcId,
} from "@/lib/auth";
import { emitNotification } from "@/lib/emit-notification";
import { NOTIF_MFG_PUSHBACK_RESOLVED } from "@/lib/notification-types";
import { reflowManufacturingSchedules } from "@/lib/manufacturing-scheduler";
import { INTERNAL_PARTNER_ID } from "@/lib/manufacturing-partners";
import { recomputeManufacturingRiskFlags } from "@/lib/manufacturing-risk";
import {
  buildManufacturingPushbackResolvedBody,
  type UnitNotificationContext,
} from "@/lib/notification-copy";
import { resolveManufacturingEscalationsForTarget } from "@/lib/manufacturing-escalations";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Refuse to record in-house work on a unit that belongs to a subcontractor.
 *
 * THE INVARIANT this protects: the same blind must never be built twice, once
 * here and once at a partner. The read paths already keep subcontracted units out
 * of the cutter/assembler/QC queues (get_role_schedule filters on the partner),
 * and a DB trigger backstops the write. This is the middle layer — it turns a
 * stale tab or a replayed action into a clear message instead of a 42501 from
 * Postgres, and it is the one a future queue screen would forget to add.
 */
async function assertUnitIsInternallyManufactured(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("units")
    .select("manufacturing_partner_id, unit_number")
    .eq("id", unitId)
    .maybeSingle();

  const row = data as { manufacturing_partner_id: string | null; unit_number: string } | null;
  if (!row) return null;
  if ((row.manufacturing_partner_id ?? INTERNAL_PARTNER_ID) === INTERNAL_PARTNER_ID) return null;

  return `Unit ${row.unit_number} is now manufactured by a subcontractor. Refresh — it has left the in-house queue.`;
}

const REVALIDATE_PATH_BY_REASON = {
  mark_cut: "/cutter",
  mark_assembled: "/assembler",
  mark_qc: "/qc",
} as const;

function scheduleManufacturingFollowUp(args: {
  unitId: string;
  windowId?: string;
  resolvedPushbackFor?: "cutter" | "assembler" | "qc" | null;
  scheduleReason: "mark_cut" | "mark_assembled" | "mark_qc";
}) {
  after(async () => {
    const followUpSupabase = await createClient();

    if (args.windowId && args.resolvedPushbackFor) {
      await notifyManufacturingPushbackResolved(followUpSupabase, {
        unitId: args.unitId,
        windowId: args.windowId,
        targetRole: args.resolvedPushbackFor,
      });
    }

    await recomputeUnitStatus(followUpSupabase, args.unitId);
    await reflowManufacturingSchedules(args.scheduleReason);

    // C2: qc-approve is the manufacturing event that changes a risk input (the
    // unit's qc_approved count → possibly 'complete'). Recompute set-based here
    // so the flag/notification refresh promptly; time-based drift is covered by
    // the daily /api/cron/manufacturing-risk tick.
    if (args.scheduleReason === "mark_qc") {
      await recomputeManufacturingRiskFlags();
    }

    revalidatePath(REVALIDATE_PATH_BY_REASON[args.scheduleReason], "layout");
  });
}

async function loadManufacturingNotificationContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
  windowId: string
): Promise<{
  context: UnitNotificationContext;
  roomName: string;
  windowLabel: string;
  installerId: string | null;
  schedulerId: string | null;
}> {
  const [unitRes, roomRes, assignmentRes] = await Promise.all([
    supabase
      .from("units")
      .select("client_name, building_name, unit_number, assigned_installer_id")
      .eq("id", unitId)
      .single(),
    supabase
      .from("windows")
      .select("label, rooms!inner(name)")
      .eq("id", windowId)
      .single(),
    supabase
      .from("scheduler_unit_assignments")
      .select("scheduler_id")
      .eq("unit_id", unitId)
      .maybeSingle(),
  ]);

  const room = roomRes.data?.rooms as unknown as { name?: string } | { name?: string }[] | null;
  const roomName = Array.isArray(room) ? room[0]?.name ?? "Room" : room?.name ?? "Room";

  return {
    context: {
      clientName: unitRes.data?.client_name ?? "",
      buildingName: unitRes.data?.building_name ?? "",
      unitNumber: unitRes.data?.unit_number ?? "",
    },
    roomName,
    windowLabel: roomRes.data?.label ?? "Window",
    installerId: unitRes.data?.assigned_installer_id ?? null,
    schedulerId: assignmentRes.data?.scheduler_id ?? null,
  };
}

async function notifyManufacturingPushbackResolved(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    unitId: string;
    windowId: string;
    targetRole: "cutter" | "assembler" | "qc";
  }
) {
  const details = await loadManufacturingNotificationContext(supabase, args.unitId, args.windowId);
  const body = buildManufacturingPushbackResolvedBody(details.context, {
    roomName: details.roomName,
    windowLabel: details.windowLabel,
    targetRole: args.targetRole,
  });

  if (details.schedulerId) {
    await emitNotification({
      recipientRole: "scheduler",
      recipientId: details.schedulerId,
      type: NOTIF_MFG_PUSHBACK_RESOLVED,
      title: "Manufacturing rework completed",
      body,
      relatedUnitId: args.unitId,
    });
  }

  if (details.installerId) {
    await emitNotification({
      recipientRole: "installer",
      recipientId: details.installerId,
      type: NOTIF_MFG_PUSHBACK_RESOLVED,
      title: "Manufacturing rework completed",
      body,
      relatedUnitId: args.unitId,
    });
  }
}

/** Mark a single window blind as cut by the current cutter. */
export async function markWindowCut(
  windowId: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const user = await requireCutter();
    const supabase = await createClient();

    const cutterId = await getLinkedCutterId(user.id);
    if (!cutterId) {
      return { ok: false, error: "Cutter profile not found." };
    }

    // Get the unit_id for this window (via room)
    const { data: window, error: windowErr } = await supabase
      .from("windows")
      .select("id, room_id, rooms!inner(unit_id)")
      .eq("id", windowId)
      .single();

    if (windowErr || !window) {
      return { ok: false, error: "Window not found." };
    }

    const rooms = window.rooms as unknown as { unit_id: string } | { unit_id: string }[];
    const unitId = Array.isArray(rooms) ? rooms[0]?.unit_id : rooms?.unit_id;

    if (!unitId) {
      return { ok: false, error: "Unit ID not found for this window." };
    }

    const ownershipError = await assertUnitIsInternallyManufactured(supabase, unitId);
    if (ownershipError) return { ok: false, error: ownershipError };

    const now = new Date().toISOString();

    const { error } = await supabase.from("window_production_status").upsert(
      {
        id: `wps-${crypto.randomUUID().slice(0, 8)}`,
        window_id: windowId,
        unit_id: unitId,
        status: "cut",
        cut_by_cutter_id: cutterId,
        cut_at: now,
        cut_notes: notes?.trim() ?? "",
      },
      { onConflict: "window_id" }
    );

    if (error) return { ok: false, error: error.message };

    const resolvedPushback = await resolveManufacturingEscalationsForTarget(supabase, {
      windowId,
      targetRole: "cutter",
      resolvedByUserId: user.id,
    });

    scheduleManufacturingFollowUp({
      unitId,
      windowId,
      resolvedPushbackFor: resolvedPushback ? "cutter" : null,
      scheduleReason: "mark_cut",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to mark window as cut." };
  }
}

/** Mark a single window blind as assembled by the current assembler. */
export async function markWindowAssembled(
  windowId: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const user = await requireAssembler();
    const supabase = await createClient();

    const assemblerId = await getLinkedAssemblerId(user.id);
    if (!assemblerId) {
      return { ok: false, error: "Assembler profile not found." };
    }

    const now = new Date().toISOString();

    const { data: currentRow } = await supabase
      .from("window_production_status")
      .select("unit_id")
      .eq("window_id", windowId)
      .maybeSingle();


    if (currentRow?.unit_id) {
      const ownershipError = await assertUnitIsInternallyManufactured(supabase, currentRow.unit_id);
      if (ownershipError) return { ok: false, error: ownershipError };
    }

    const { error } = await supabase
      .from("window_production_status")
      .update({
        status: "assembled",
        assembled_by_assembler_id: assemblerId,
        assembled_at: now,
        assembled_notes: notes?.trim() ?? "",
      })
      .eq("window_id", windowId)
      .eq("status", "cut");

    if (error) return { ok: false, error: error.message };

    const resolvedPushback = await resolveManufacturingEscalationsForTarget(supabase, {
      windowId,
      targetRole: "assembler",
      resolvedByUserId: user.id,
    });

    if (currentRow?.unit_id) {
      scheduleManufacturingFollowUp({
        unitId: currentRow.unit_id,
        windowId,
        resolvedPushbackFor: resolvedPushback ? "assembler" : null,
        scheduleReason: "mark_assembled",
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to mark window as assembled." };
  }
}

/** Mark a single window blind as built fully by the current QC user. */
export async function markWindowQCApproved(
  windowId: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const user = await requireQc();
    const supabase = await createClient();

    const qcId = await getLinkedQcId(user.id);
    if (!qcId) {
      return { ok: false, error: "QC profile not found." };
    }

    const now = new Date().toISOString();
    const { data: currentRow } = await supabase
      .from("window_production_status")
      .select("unit_id")
      .eq("window_id", windowId)
      .maybeSingle();


    if (currentRow?.unit_id) {
      const ownershipError = await assertUnitIsInternallyManufactured(supabase, currentRow.unit_id);
      if (ownershipError) return { ok: false, error: ownershipError };
    }

    const { error } = await supabase
      .from("window_production_status")
      .update({
        status: "qc_approved",
        qc_approved_by_assembler_id: null,
        qc_approved_by_qc_id: qcId,
        qc_approved_at: now,
        qc_notes: notes?.trim() ?? "",
      })
      .eq("window_id", windowId)
      .eq("status", "assembled");

    if (error) return { ok: false, error: error.message };

    if (currentRow?.unit_id) {
      scheduleManufacturingFollowUp({
        unitId: currentRow.unit_id,
        resolvedPushbackFor: null,
        scheduleReason: "mark_qc",
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to mark blind as built fully." };
  }
}

