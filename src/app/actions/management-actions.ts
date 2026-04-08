"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/auth";
import { CONFIRM_PURGE_ALL_CLIENTS } from "@/lib/client-purge-constants";
import { emitNotification } from "@/lib/emit-notification";
import {
  NOTIF_UNIT_ASSIGNED_TO_SCHEDULER,
  NOTIF_COMPLETE_BY_DATE_CHANGED,
} from "@/lib/notification-types";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateApp() {
  revalidatePath("/management", "layout");
  revalidatePath("/scheduler", "layout");
  revalidatePath("/installer", "layout");
}

/** For scheduler callers: unit must match `loadSchedulerDataset` scope (assignments or team installer). */

async function logUnitActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
  actorRole: string,
  actorName: string,
  action: string,
  details?: Record<string, unknown>
) {
  await supabase.from("unit_activity_log").insert({
    id: `log-${crypto.randomUUID()}`,
    unit_id: unitId,
    actor_role: actorRole,
    actor_name: actorName,
    action,
    details: details ?? null,
    created_at: new Date().toISOString(),
  });
}

export async function createClient_(
  name: string,
  contactName: string,
  contactEmail: string,
  contactPhone: string
): Promise<ActionResult & { id?: string }> {
  try {
    const supabase = await createClient();
    const id = `client-${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await supabase.from("clients").insert({
      id,
      name: name.trim(),
      contact_name: contactName.trim(),
      contact_email: contactEmail.trim(),
      contact_phone: contactPhone.trim(),
    });
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create client" };
  }
}

export async function updateClient(
  clientId: string,
  name: string,
  contactName: string,
  contactEmail: string,
  contactPhone: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .update({
        name: name.trim(),
        contact_name: contactName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
      })
      .eq("id", clientId);
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update client" };
  }
}

export async function deleteClient(clientId: string): Promise<ActionResult> {
  try {
    await requireOwner();
    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId);
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete client";
    if (msg.includes("Unauthorized")) {
      return { ok: false, error: "Only an owner can delete a client." };
    }
    return { ok: false, error: msg };
  }
}

export async function updateBuilding(
  buildingId: string,
  name: string,
  address: string
): Promise<ActionResult> {
  try {
    await requireOwner();
    const supabase = await createClient();
    const { error } = await supabase
      .from("buildings")
      .update({ name: name.trim(), address: address.trim() })
      .eq("id", buildingId);
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update building";
    if (msg.includes("Unauthorized")) {
      return { ok: false, error: "Only an owner can edit a building." };
    }
    return { ok: false, error: msg };
  }
}

export async function deleteBuilding(buildingId: string): Promise<ActionResult> {
  try {
    await requireOwner();
    const supabase = await createClient();
    const { error } = await supabase
      .from("buildings")
      .delete()
      .eq("id", buildingId);
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete building";
    if (msg.includes("Unauthorized")) {
      return { ok: false, error: "Only an owner can delete a building." };
    }
    return { ok: false, error: msg };
  }
}

export async function deleteUnit(unitId: string): Promise<ActionResult> {
  try {
    await requireOwner();
    const supabase = await createClient();
    const { error } = await supabase
      .from("units")
      .delete()
      .eq("id", unitId);
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete unit";
    if (msg.includes("Unauthorized")) {
      return { ok: false, error: "Only an owner can delete a unit." };
    }
    return { ok: false, error: msg };
  }
}

export async function bulkDeleteUnits(unitIds: string[]): Promise<ActionResult> {
  try {
    await requireOwner();
    const supabase = await createClient();
    const { error } = await supabase
      .from("units")
      .delete()
      .in("id", unitIds);
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete units";
    if (msg.includes("Unauthorized")) {
      return { ok: false, error: "Only an owner can delete units." };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Owner-only: removes every client row (CASCADE deletes buildings, units, rooms, windows,
 * schedule rows, media_uploads rows, activity log, scheduler access tied to those buildings/units).
 * Also clears in-app notifications. Does not remove installers, schedulers, cutters, or auth users.
 * Supabase Storage files are not deleted — remove those in the dashboard if needed.
 */
export async function purgeAllClientData(typedConfirmation: string): Promise<ActionResult> {
  if (typedConfirmation.trim() !== CONFIRM_PURGE_ALL_CLIENTS) {
    return {
      ok: false,
      error: `Type exactly: ${CONFIRM_PURGE_ALL_CLIENTS}`,
    };
  }
  try {
    await requireOwner();
    const admin = createAdminClient();

    const { error: readsErr } = await admin
      .from("notification_reads")
      .delete()
      .neq("notification_id", "");
    if (readsErr) return { ok: false, error: readsErr.message };

    const { error: notifErr } = await admin.from("notifications").delete().neq("id", "");
    if (notifErr) return { ok: false, error: notifErr.message };

    const { error: clientsErr } = await admin.from("clients").delete().neq("id", "");
    if (clientsErr) return { ok: false, error: clientsErr.message };

    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Purge failed";
    if (msg.includes("Unauthorized")) {
      return { ok: false, error: "Only an owner can reset client data." };
    }
    return { ok: false, error: msg };
  }
}

export async function createBuilding(
  clientId: string,
  name: string,
  address: string
): Promise<ActionResult & { id?: string }> {
  try {
    const supabase = await createClient();
    const id = `bldg-${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await supabase.from("buildings").insert({
      id,
      client_id: clientId,
      name: name.trim(),
      address: address.trim(),
    });
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create building" };
  }
}

export async function createUnit(
  buildingId: string,
  clientId: string,
  unitNumber: string,
  earliestBracketingDate: string,
  earliestInstallationDate: string,
  completeByDate: string | null = null
): Promise<ActionResult & { id?: string }> {
  try {
    const owner = await requireOwner();
    const supabase = await createClient();

    const { data: building } = await supabase
      .from("buildings")
      .select("name")
      .eq("id", buildingId)
      .single();
    const { data: client } = await supabase
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .single();

    const id = `unit-${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await supabase.from("units").insert({
      id,
      building_id: buildingId,
      client_id: clientId,
      client_name: client?.name ?? "",
      building_name: building?.name ?? "",
      unit_number: unitNumber.trim(),
      status: "not_started",
      risk_flag: "green",
      earliest_bracketing_date: earliestBracketingDate || null,
      earliest_installation_date: earliestInstallationDate || null,
      complete_by_date: completeByDate || null,
      room_count: 0,
      window_count: 0,
      photos_uploaded: 0,
      notes_count: 0,
    });
    if (error) return { ok: false, error: error.message };

    await logUnitActivity(supabase, id, owner.role, owner.displayName, "unit_created", {
      unitNumber: unitNumber.trim(),
    });

    const bracketEntry = {
      id: `sch-${crypto.randomUUID().slice(0, 8)}`,
      unit_id: id,
      unit_number: unitNumber.trim(),
      building_name: building?.name ?? "",
      client_name: client?.name ?? "",
      owner_user_id: owner.id,
      owner_name: owner.displayName,
      task_type: "bracketing",
      task_date: earliestBracketingDate || "9999-12-31",
      status: "not_started",
      risk_flag: "green",
    };
    await supabase.from("schedule_entries").insert(bracketEntry);

    revalidateApp();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create unit" };
  }
}

export async function updateUnit(
  unitId: string,
  unitNumber: string,
  earliestBracketingDate: string,
  earliestInstallationDate: string,
  priority?: "low" | "medium" | "high" | null
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("units")
      .update({
        unit_number: unitNumber.trim(),
        earliest_bracketing_date: earliestBracketingDate || null,
        earliest_installation_date: earliestInstallationDate || null,
        priority: priority || null,
      })
      .eq("id", unitId);
    if (error) return { ok: false, error: error.message };
    revalidateApp();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update unit" };
  }
}

export async function updateUnitCompleteByDate(
  unitId: string,
  completeByDate: string | null
): Promise<ActionResult> {
  try {
    const owner = await requireOwner();
    const supabase = await createClient();

    const nextDate = completeByDate || null;
    const { data: current } = await supabase
      .from("units")
      .select("complete_by_date")
      .eq("id", unitId)
      .single();
    const previousDate = current?.complete_by_date ?? null;

    const { error } = await supabase
      .from("units")
      .update({ complete_by_date: nextDate })
      .eq("id", unitId);

    if (error) return { ok: false, error: error.message };

    if (previousDate !== nextDate) {
      await logUnitActivity(
        supabase,
        unitId,
        owner.role,
        owner.displayName,
        "complete_by_date_set",
        {
          from: previousDate,
          to: nextDate,
        }
      );

      // ─── Notify scheduler of this unit ───────────────────────────────────
      const { data: assignment } = await supabase
        .from("scheduler_unit_assignments")
        .select("scheduler_id")
        .eq("unit_id", unitId)
        .maybeSingle();
      if (assignment?.scheduler_id) {
        await emitNotification(supabase, {
          recipientRole: "scheduler",
          recipientId: assignment.scheduler_id,
          type: NOTIF_COMPLETE_BY_DATE_CHANGED,
          title: "Complete-by date updated",
          body: nextDate
            ? `New deadline: ${nextDate}`
            : "Complete-by date removed.",
          relatedUnitId: unitId,
        });
      }
      // ─────────────────────────────────────────────────────────────────────
    }

    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function bulkImportUnits(
  buildingId: string,
  clientId: string,
  rows: { unitNumber: string; earliestBracketing: string; earliestInstallation: string; occupancyDate: string }[]
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const owner = await requireOwner();
  const supabase = await createClient();

  const { data: building } = await supabase
    .from("buildings")
    .select("name")
    .eq("id", buildingId)
    .single();
  const { data: client } = await supabase
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .single();

  const { data: existing } = await supabase
    .from("units")
    .select("unit_number")
    .eq("building_id", buildingId);
  const existingNumbers = new Set((existing ?? []).map((u) => u.unit_number));

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.unitNumber.trim()) {
      skipped++;
      continue;
    }
    if (existingNumbers.has(row.unitNumber.trim())) {
      skipped++;
      continue;
    }

    const unitId = `unit-${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await supabase.from("units").insert({
      id: unitId,
      building_id: buildingId,
      client_id: clientId,
      client_name: client?.name ?? "",
      building_name: building?.name ?? "",
      unit_number: row.unitNumber.trim(),
      status: "not_started",
      risk_flag: "green",
      earliest_bracketing_date: row.earliestBracketing || null,
      earliest_installation_date: row.earliestInstallation || null,
      occupancy_date: row.occupancyDate || null,
      room_count: 0,
      window_count: 0,
      photos_uploaded: 0,
      notes_count: 0,
    });

    if (error) {
      errors.push(`${row.unitNumber}: ${error.message}`);
      continue;
    }

    await logUnitActivity(supabase, unitId, owner.role, owner.displayName, "unit_created", {
      unitNumber: row.unitNumber.trim(),
    });

    await supabase.from("schedule_entries").insert({
      id: `sch-${crypto.randomUUID().slice(0, 8)}`,
      unit_id: unitId,
      unit_number: row.unitNumber.trim(),
      building_name: building?.name ?? "",
      client_name: client?.name ?? "",
      owner_user_id: owner.id,
      owner_name: owner.displayName,
      task_type: "bracketing",
      task_date: row.earliestBracketing || "9999-12-31",
      status: "not_started",
      risk_flag: "green",
    });

    created++;
    existingNumbers.add(row.unitNumber.trim());
  }

  revalidateApp();
  return { created, skipped, errors };
}

/**
 * Owner assigns a set of units to a scheduler.
 * Because scheduler_unit_assignments has UNIQUE(unit_id), any existing
 * assignment for a unit is replaced (the unit moves to the new scheduler).
 */
export async function assignUnitsToScheduler(
  schedulerId: string,
  unitIds: string[]
): Promise<ActionResult> {
  try {
    await requireOwner();
    if (!schedulerId || unitIds.length === 0) {
      return { ok: false, error: "Scheduler and at least one unit are required." };
    }
    const supabase = await createClient();
    const { displayName, role } = await requireOwner();

    // Fetch scheduler name for logging
    const { data: scheduler } = await supabase
      .from("schedulers")
      .select("name")
      .eq("id", schedulerId)
      .single();
    const schedulerName = (scheduler as { name: string })?.name || "Unknown";

    // Upsert rows — ON CONFLICT on unit_id replaces the scheduler.
    const rows = unitIds.map((unitId) => ({
      id: `sua-${crypto.randomUUID().slice(0, 8)}`,
      scheduler_id: schedulerId,
      unit_id: unitId,
    }));

    const { error } = await supabase
      .from("scheduler_unit_assignments")
      .upsert(rows, { onConflict: "unit_id" });

    if (error) return { ok: false, error: error.message };

    // Log activity for each unit
    for (const unitId of unitIds) {
      await logUnitActivity(supabase, unitId, role, displayName, "bulk_assigned", {
        scheduler: schedulerName,
      });
    }

    // ─── Notification to scheduler ───────────────────────────────────────────
    const unitLabel =
      unitIds.length === 1
        ? "A unit has been added to your queue"
        : `${unitIds.length} units added to your queue`;
    await emitNotification(supabase, {
      recipientRole: "scheduler",
      recipientId: schedulerId,
      type: NOTIF_UNIT_ASSIGNED_TO_SCHEDULER,
      title: unitLabel,
      body: `Assigned by ${displayName}`,
      relatedUnitId: unitIds.length === 1 ? unitIds[0] : null,
    });
    // ─────────────────────────────────────────────────────────────────────────

    revalidateApp();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to assign units" };
  }
}

/** Loads all scheduler_unit_assignments as a map of schedulerId → unitIds[]. */
export async function loadSchedulerUnitAssignments(): Promise<Record<string, string[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduler_unit_assignments")
    .select("scheduler_id, unit_id");
  if (error) return {};
  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    if (!map[row.scheduler_id]) map[row.scheduler_id] = [];
    map[row.scheduler_id].push(row.unit_id);
  }
  return map;
}

/** Returns the schedulerId that owns a given unit, or null if unassigned. */
export async function getUnitSchedulerAssignment(unitId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("scheduler_unit_assignments")
    .select("scheduler_id")
    .eq("unit_id", unitId)
    .single();
  return data?.scheduler_id ?? null;
}
