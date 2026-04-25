"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/auth";
import { CONFIRM_PURGE_ALL_CLIENTS } from "@/lib/client-purge-constants";
import { emitNotification } from "@/lib/emit-notification";
import {
  revalidateAllPortalData,
  revalidateBuildingRoutes,
  revalidateClientRoutes,
  revalidateManyUnitRoutes,
  revalidateUnitRoutes,
} from "@/app/actions/revalidation";
import {
  NOTIF_UNIT_ASSIGNED_TO_SCHEDULER,
  NOTIF_UNIT_ASSIGNED_TO_INSTALLER,
  NOTIF_COMPLETE_BY_DATE_CHANGED,
} from "@/lib/notification-types";
import {
  buildCompleteByDateChangedNotificationBody,
  buildUnitAssignedNotificationBody,
  type UnitNotificationContext,
} from "@/lib/notification-copy";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** For scheduler callers: unit must match `loadSchedulerDataset` scope (assignments or team installer). */

type UnitRouteMeta = {
  id: string;
  buildingId: string | null;
  clientId: string | null;
};

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

async function loadUnitRouteMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string
): Promise<UnitRouteMeta | null> {
  const { data } = await supabase
    .from("units")
    .select("id, building_id, client_id")
    .eq("id", unitId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    buildingId: data.building_id ?? null,
    clientId: data.client_id ?? null,
  };
}

async function loadUnitsRouteMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitIds: string[]
): Promise<UnitRouteMeta[]> {
  if (unitIds.length === 0) return [];

  const { data } = await supabase
    .from("units")
    .select("id, building_id, client_id")
    .in("id", unitIds);

  return (data ?? []).map((row) => ({
    id: row.id,
    buildingId: row.building_id ?? null,
    clientId: row.client_id ?? null,
  }));
}

async function loadBuildingClientId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("buildings")
    .select("client_id")
    .eq("id", buildingId)
    .maybeSingle();
  return data?.client_id ?? null;
}

async function loadUnitNotificationContext(
  unitId: string
): Promise<UnitNotificationContext | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("units")
    .select("client_name, building_name, unit_number")
    .eq("id", unitId)
    .maybeSingle();

  if (!data) return null;

  return {
    clientName: data.client_name ?? "",
    buildingName: data.building_name ?? "",
    unitNumber: data.unit_number ?? "",
  };
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
    revalidateClientRoutes(id);
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
    revalidateClientRoutes(clientId);
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
    revalidateClientRoutes(clientId);
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
    const clientId = await loadBuildingClientId(supabase, buildingId);
    const { error } = await supabase
      .from("buildings")
      .update({ name: name.trim(), address: address.trim() })
      .eq("id", buildingId);
    if (error) return { ok: false, error: error.message };
    revalidateBuildingRoutes(buildingId, clientId);
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
    const clientId = await loadBuildingClientId(supabase, buildingId);
    const { error } = await supabase
      .from("buildings")
      .delete()
      .eq("id", buildingId);
    if (error) return { ok: false, error: error.message };
    revalidateBuildingRoutes(buildingId, clientId);
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
    const meta = await loadUnitRouteMeta(supabase, unitId);
    const { error } = await supabase
      .from("units")
      .delete()
      .eq("id", unitId);
    if (error) return { ok: false, error: error.message };
    revalidateUnitRoutes(unitId, meta ?? undefined);
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
    const unitsMeta = await loadUnitsRouteMeta(supabase, unitIds);
    const { error } = await supabase
      .from("units")
      .delete()
      .in("id", unitIds);
    if (error) return { ok: false, error: error.message };
    revalidateManyUnitRoutes(unitsMeta);
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

    revalidateAllPortalData();
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
    revalidateBuildingRoutes(id, clientId);
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
): Promise<
  ActionResult & {
    id?: string;
    unit?: {
      id: string;
      buildingId: string;
      clientId: string;
      clientName: string;
      buildingName: string;
      unitNumber: string;
      status: "not_started";
      assignedInstallerId: null;
      assignedInstallerName: null;
      assignedSchedulerId: null;
      assignedSchedulerName: null;
      measurementDate: null;
      bracketingDate: null;
      installationDate: null;
      earliestBracketingDate: string | null;
      earliestInstallationDate: string | null;
      completeByDate: string | null;
      roomCount: 0;
      windowCount: 0;
      photosUploaded: 0;
      notesCount: 0;
      createdAt: string;
      assignedAt: null;
      manufacturingRiskFlag: "green";
    };
  }
> {
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
    const createdAt = new Date().toISOString();
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
      created_at: createdAt,
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

    revalidateUnitRoutes(id, { buildingId, clientId });
    return {
      ok: true,
      id,
      unit: {
        id,
        buildingId,
        clientId,
        clientName: client?.name ?? "",
        buildingName: building?.name ?? "",
        unitNumber: unitNumber.trim(),
        status: "not_started",
        assignedInstallerId: null,
        assignedInstallerName: null,
        assignedSchedulerId: null,
        assignedSchedulerName: null,
        measurementDate: null,
        bracketingDate: null,
        installationDate: null,
        earliestBracketingDate: earliestBracketingDate || null,
        earliestInstallationDate: earliestInstallationDate || null,
        completeByDate: completeByDate || null,
        roomCount: 0,
        windowCount: 0,
        photosUploaded: 0,
        notesCount: 0,
        createdAt,
        assignedAt: null,
        manufacturingRiskFlag: "green",
      },
    };
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
    const meta = await loadUnitRouteMeta(supabase, unitId);
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
    revalidateUnitRoutes(unitId, meta ?? undefined);
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
    const meta = await loadUnitRouteMeta(supabase, unitId);

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
        const context = await loadUnitNotificationContext(unitId);
        await emitNotification({
          recipientRole: "scheduler",
          recipientId: assignment.scheduler_id,
          type: NOTIF_COMPLETE_BY_DATE_CHANGED,
          title: "Complete-by date updated",
          body: context
            ? buildCompleteByDateChangedNotificationBody(context, nextDate)
            : nextDate
              ? `Complete by: ${nextDate}`
              : "Complete-by date removed.",
          relatedUnitId: unitId,
        });
      }
      // ─────────────────────────────────────────────────────────────────────
    }

    revalidateUnitRoutes(unitId, meta ?? undefined);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function bulkImportUnits(
  buildingId: string,
  clientId: string,
  rows: {
    unitNumber: string;
    earliestBracketing: string;
    earliestInstallation: string;
    occupancyDate: string;
    completeByDate: string | null;
    schedulerId: string | null;
    installerId: string | null;
  }[]
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
  const schedulerIds = Array.from(new Set(rows.map((row) => row.schedulerId).filter(Boolean))) as string[];
  const installerIds = Array.from(new Set(rows.map((row) => row.installerId).filter(Boolean))) as string[];
  const schedulerMap = new Map<string, { id: string; name: string }>();
  const installerMap = new Map<string, { id: string; name: string; scheduler_id: string | null }>();

  if (schedulerIds.length > 0) {
    const { data: schedulers, error: schedulersError } = await supabase
      .from("schedulers")
      .select("id, name")
      .in("id", schedulerIds);
    if (schedulersError) return { created: 0, skipped: 0, errors: [schedulersError.message] };
    for (const scheduler of schedulers ?? []) {
      schedulerMap.set(scheduler.id, scheduler);
    }
  }

  if (installerIds.length > 0) {
    const { data: installers, error: installersError } = await supabase
      .from("installers")
      .select("id, name, scheduler_id")
      .in("id", installerIds);
    if (installersError) return { created: 0, skipped: 0, errors: [installersError.message] };
    for (const installer of installers ?? []) {
      installerMap.set(installer.id, installer);
    }
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const schedulerNotifications: Array<{ unitId: string; schedulerId: string }> = [];
  const installerNotifications: Array<{ unitId: string; installerId: string }> = [];

  for (const row of rows) {
    const unitNumber = row.unitNumber.trim();
    if (!unitNumber) {
      skipped++;
      continue;
    }
    if (existingNumbers.has(unitNumber)) {
      skipped++;
      continue;
    }
    if (!row.completeByDate) {
      errors.push(`${unitNumber}: Complete-by date is required.`);
      continue;
    }

    const scheduler = row.schedulerId ? schedulerMap.get(row.schedulerId) : null;
    if (row.schedulerId && !scheduler) {
      errors.push(`${unitNumber}: Selected scheduler no longer exists.`);
      continue;
    }

    const installer = row.installerId ? installerMap.get(row.installerId) : null;
    if (row.installerId && !installer) {
      errors.push(`${unitNumber}: Selected installer no longer exists.`);
      continue;
    }

    const schedulerIdToAssign = scheduler?.id ?? installer?.scheduler_id ?? null;

    const unitId = `unit-${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await supabase.from("units").insert({
      id: unitId,
      building_id: buildingId,
      client_id: clientId,
      client_name: client?.name ?? "",
      building_name: building?.name ?? "",
      unit_number: unitNumber,
      status: "not_started",
      risk_flag: "green",
      assigned_installer_id: installer?.id ?? null,
      assigned_installer_name: installer?.name ?? null,
      earliest_bracketing_date: row.earliestBracketing || null,
      earliest_installation_date: row.earliestInstallation || null,
      occupancy_date: row.occupancyDate || null,
      complete_by_date: row.completeByDate,
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
      unitNumber,
      completeByDate: row.completeByDate,
      ...(schedulerIdToAssign ? { scheduler: scheduler?.name ?? "Coordinator scheduler" } : {}),
      ...(installer ? { installer: installer.name } : {}),
    });

    if (schedulerIdToAssign) {
      const { error: assignmentError } = await supabase
        .from("scheduler_unit_assignments")
        .upsert(
          {
            id: `sua-${unitId}`,
            unit_id: unitId,
            scheduler_id: schedulerIdToAssign,
            assigned_at: new Date().toISOString(),
          },
          { onConflict: "unit_id" }
        );

      if (assignmentError) {
        errors.push(`${unitNumber}: ${assignmentError.message}`);
      } else {
        schedulerNotifications.push({ unitId, schedulerId: schedulerIdToAssign });
      }
    }

    if (installer) {
      installerNotifications.push({ unitId, installerId: installer.id });
    }

    await supabase.from("schedule_entries").insert({
      id: `sch-${crypto.randomUUID().slice(0, 8)}`,
      unit_id: unitId,
      unit_number: unitNumber,
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
    existingNumbers.add(unitNumber);
  }

  after(async () => {
    for (const notification of schedulerNotifications) {
      const context = await loadUnitNotificationContext(notification.unitId);
      await emitNotification({
        recipientRole: "scheduler",
        recipientId: notification.schedulerId,
        type: NOTIF_UNIT_ASSIGNED_TO_SCHEDULER,
        title: "Unit added to your queue",
        body: context
          ? buildUnitAssignedNotificationBody(context, owner.displayName)
          : `Assigned by ${owner.displayName}`,
        relatedUnitId: notification.unitId,
      });
    }

    for (const notification of installerNotifications) {
      const context = await loadUnitNotificationContext(notification.unitId);
      await emitNotification({
        recipientRole: "installer",
        recipientId: notification.installerId,
        type: NOTIF_UNIT_ASSIGNED_TO_INSTALLER,
        title: "Unit added to your queue",
        body: context
          ? buildUnitAssignedNotificationBody(context, owner.displayName)
          : `Assigned by ${owner.displayName}`,
        relatedUnitId: notification.unitId,
      });
    }
  });

  revalidateBuildingRoutes(buildingId, clientId);
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

    // Emit one alert per unit so each item can deep-link to a specific queue addition.
    for (const unitId of unitIds) {
      const context = await loadUnitNotificationContext(unitId);
      await emitNotification({
        recipientRole: "scheduler",
        recipientId: schedulerId,
        type: NOTIF_UNIT_ASSIGNED_TO_SCHEDULER,
        title: "Unit added to your queue",
        body: context
          ? buildUnitAssignedNotificationBody(context, displayName)
          : `Assigned by ${displayName}`,
        relatedUnitId: unitId,
      });
    }

    const unitsMeta = await loadUnitsRouteMeta(supabase, unitIds);
    revalidateManyUnitRoutes(unitsMeta);
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

/**
 * One-time backfill: ensures every window belonging to an installed (or
 * manufactured) unit has a window_production_status row with status =
 * 'qc_approved'. Windows that already have a production row are upserted to
 * qc_approved; windows with no row get a new qc_approved row inserted.
 */
export async function backfillInstalledWindowProductionStatus(): Promise<
  ActionResult & { updatedCount?: number }
> {
  try {
    await requireOwner();
    const supabase = await createClient();

    // 1. Fetch all installed (and manufactured) unit IDs + their windows via rooms
    const { data: unitRows, error: unitsError } = await supabase
      .from("units")
      .select("id")
      .in("status", ["installed", "manufactured"]);
    if (unitsError) return { ok: false, error: unitsError.message };

    const unitIds = (unitRows ?? []).map((u: { id: string }) => u.id);
    if (unitIds.length === 0) return { ok: true, updatedCount: 0 };

    const { data: roomRows, error: roomsError } = await supabase
      .from("rooms")
      .select("id, unit_id")
      .in("unit_id", unitIds);
    if (roomsError) return { ok: false, error: roomsError.message };

    const roomIds = (roomRows ?? []).map((r: { id: string }) => r.id);
    if (roomIds.length === 0) return { ok: true, updatedCount: 0 };

    const roomUnitMap = new Map<string, string>(
      (roomRows ?? []).map((r: { id: string; unit_id: string }) => [r.id, r.unit_id])
    );

    const { data: windowRows, error: windowsError } = await supabase
      .from("windows")
      .select("id, room_id")
      .in("room_id", roomIds);
    if (windowsError) return { ok: false, error: windowsError.message };

    const windows = windowRows ?? [];
    const windowIds = windows.map((w: { id: string }) => w.id);
    if (windowIds.length === 0) return { ok: true, updatedCount: 0 };

    // 2. Fetch existing production rows for these windows
    const { data: existingRows, error: existingError } = await supabase
      .from("window_production_status")
      .select("id, window_id, status")
      .in("window_id", windowIds);
    if (existingError) return { ok: false, error: existingError.message };

    const existingByWindowId = new Map<string, { id: string; status: string }>(
      (existingRows ?? []).map((r: { id: string; window_id: string; status: string }) => [
        r.window_id,
        { id: r.id, status: r.status },
      ])
    );

    // 3. Build upserts for windows not yet qc_approved
    const now = new Date().toISOString();
    const upserts: Record<string, unknown>[] = [];

    for (const window of windows as Array<{ id: string; room_id: string }>) {
      const unitId = roomUnitMap.get(window.room_id);
      if (!unitId) continue;

      const existing = existingByWindowId.get(window.id);
      if (existing?.status === "qc_approved") continue; // already done

      upserts.push({
        id: existing?.id ?? `ps-${crypto.randomUUID().slice(0, 8)}`,
        window_id: window.id,
        unit_id: unitId,
        status: "qc_approved",
        cut_at: now,
        assembled_at: now,
        qc_approved_at: now,
        issue_status: "none",
        issue_reason: "",
        issue_notes: "",
        cut_notes: "",
        assembled_notes: "",
        qc_notes: "backfilled from installed unit status",
      });
    }

    if (upserts.length === 0) return { ok: true, updatedCount: 0 };

    const { error: upsertError } = await supabase
      .from("window_production_status")
      .upsert(upserts, { onConflict: "window_id" });
    if (upsertError) return { ok: false, error: upsertError.message };

    revalidateAllPortalData();
    return { ok: true, updatedCount: upserts.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Backfill failed" };
  }
}
