"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerOrScheduler, getLinkedSchedulerId, getCurrentUser } from "@/lib/auth";
import type { AppUser } from "@/lib/auth";
import { getSchedulerScopedUnitIds, isSchedulerScopedUnit } from "@/lib/scheduler-scope";
import {
  UNIT_PHOTO_STAGES,
  UNIT_PHOTO_STAGE_LABELS,
  type BlindType,
  type RiskFlag,
  type UnitPhotoStage,
  type UnitStatus,
} from "@/lib/types";
import { recomputeUnitStatus } from "@/lib/unit-progress";
import { canUploadInstallationPhotos } from "@/lib/unit-install-guard";
import { emitNotification } from "@/lib/emit-notification";
import {
  buildUnitAssignedNotificationBody,
  buildUnitDatesNotificationBody,
  buildUnitProgressNotificationBody,
  buildWindowEscalationNotificationBody,
  type UnitNotificationContext,
} from "@/lib/notification-copy";
import {
  NOTIF_UNIT_ASSIGNED_TO_INSTALLER,
  NOTIF_INSTALLATION_DATE_SET,
  NOTIF_DATES_CHANGED,
  NOTIF_UNIT_ESCALATION,
  NOTIF_UNIT_PROGRESS_UPDATE,
} from "@/lib/notification-types";
import {
  revalidateManyUnitRoutes,
  revalidateUnitRoutes,
} from "@/app/actions/revalidation";

const BUCKET = "fsr-media";
const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB hard safety cap

/** For scheduler callers: unit must match `loadSchedulerDataset` scope (assignments or team installer). */
async function assertSchedulerUnitScope(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caller: AppUser,
  unitId: string
): Promise<ActionResult | null> {
  if (caller.role === "owner") return null;

  const schedulerId = await getLinkedSchedulerId(caller.id);
  if (!schedulerId) return { ok: false, error: "Scheduler account not found." };

  const allowed = await isSchedulerScopedUnit(supabase, schedulerId, unitId);
  if (!allowed) {
    return { ok: false, error: "Access denied: this unit has not been assigned to you." };
  }

  return null;
}

function normalizeStorageError(message: string): string {
  if (/bucket not found/i.test(message)) {
    return `Storage bucket "${BUCKET}" is missing. Run supabase/migrations/20250322140000_storage_and_media.sql in Supabase SQL Editor, then retry.`;
  }
  return message;
}

function validateIncomingImageFile(
  file: File,
  {
    fieldLabel = "Image",
    maxBytes = MAX_IMAGE_UPLOAD_BYTES,
  }: {
    fieldLabel?: string;
    maxBytes?: number;
  } = {}
): { ok: false; error: string } | null {
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, error: `${fieldLabel} is required.` };
  }
  if (!file.type || !file.type.startsWith("image/")) {
    return { ok: false, error: `${fieldLabel} must be an image file.` };
  }
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `${fieldLabel} is too large. Please upload an image under ${Math.round(maxBytes / (1024 * 1024))}MB.`,
    };
  }
  return null;
}

function isMissingSchemaColumn(message: string, column: string): boolean {
  const escapedColumn = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const missingPattern = new RegExp(`could not find the ['"]${escapedColumn}['"] column`, "i");
  return missingPattern.test(message);
}

function removeUnsupportedBlindSizeColumns(
  payload: Record<string, unknown>,
  errorMessage: string
): { payload: Record<string, unknown>; removedAny: boolean } {
  const next = { ...payload };
  let removedAny = false;
  const blindSizeColumns = ["blind_width", "blind_height", "blind_depth"] as const;
  for (const column of blindSizeColumns) {
    if (isMissingSchemaColumn(errorMessage, column)) {
      delete next[column];
      removedAny = true;
    }
  }
  return { payload: next, removedAny };
}

/**
 * Targeted revalidation for unit-specific mutations (window/room CRUD, photos, status).
 * Only invalidates the affected unit's pages + the list pages that show unit counts/status.
 * Much cheaper than revalidateApp() which busts the entire layout cache.
 */
function revalidateUnit(unitId: string) {
  revalidateUnitRoutes(unitId);
}

function getPhaseForStage(stage: UnitPhotoStage): "bracketing" | "installation" {
  return stage === "installed_pending_approval" ? "installation" : "bracketing";
}

function getStageForWindowUpload(): UnitPhotoStage {
  // Measurement/creation photos are always "before" photos (pre-bracket stage).
  return "scheduled_bracketing";
}

function formatStagePhotoLabel(
  stage: UnitPhotoStage,
  customLabel: string,
  index: number,
  total: number
): string {
  const base = customLabel.trim() || UNIT_PHOTO_STAGE_LABELS[stage];
  return total > 1 ? `${base} ${index + 1}` : base;
}

const PROGRESS_TITLES: Partial<Record<UnitStatus, string>> = {
  measured: "All windows measured",
  bracketed: "All windows bracketed",
  manufactured: "All blinds manufactured",
  installed: "All windows installed",
};

type AdminClient = ReturnType<typeof createAdminClient>;

async function loadUnitNotificationContext(
  supabase: AdminClient,
  unitId: string
): Promise<UnitNotificationContext | null> {
  const { data: unitRow } = await supabase
    .from("units")
    .select("client_name, building_name, unit_number")
    .eq("id", unitId)
    .maybeSingle();

  if (!unitRow) return null;

  return {
    clientName: unitRow.client_name ?? "",
    buildingName: unitRow.building_name ?? "",
    unitNumber: unitRow.unit_number ?? "",
  };
}

async function emitUnitProgressNotification(
  supabase: AdminClient,
  schedulerId: string,
  unitId: string,
  unitStatus: UnitStatus
): Promise<void> {
  const title = PROGRESS_TITLES[unitStatus];
  if (!title) return;

  const context = await loadUnitNotificationContext(supabase, unitId);
  if (!context) return;

  await emitNotification({
    recipientRole: "scheduler",
    recipientId: schedulerId,
    type: NOTIF_UNIT_PROGRESS_UPDATE,
    title,
    body: buildUnitProgressNotificationBody(context, unitStatus),
    relatedUnitId: unitId,
  });
}

async function emitWindowEscalationNotification(
  supabase: AdminClient,
  schedulerId: string,
  {
    unitId,
    roomId,
    windowLabel,
    riskFlag,
  }: {
    unitId: string;
    roomId: string;
    windowLabel: string;
    riskFlag: Exclude<RiskFlag, "green" | "complete">;
  }
): Promise<void> {
  const [context, roomRes] = await Promise.all([
    loadUnitNotificationContext(supabase, unitId),
    supabase.from("rooms").select("name").eq("id", roomId).maybeSingle(),
  ]);

  if (!context) return;

  await emitNotification({
    recipientRole: "scheduler",
    recipientId: schedulerId,
    type: NOTIF_UNIT_ESCALATION,
    title: `${riskFlag === "red" ? "🔴 Red" : "🟡 Yellow"} flag on window`,
    body: buildWindowEscalationNotificationBody(context, {
      roomName: roomRes.data?.name ?? "Room",
      windowLabel,
      riskFlag,
    }),
    relatedUnitId: unitId,
  });
}

async function refreshRoomAggregates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roomId: string
) {
  const [{ count: wc }, { count: mc }] = await Promise.all([
    supabase
      .from("windows")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomId),
    supabase
      .from("windows")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("measured", true),
  ]);
  await supabase
    .from("rooms")
    .update({
      window_count: wc ?? 0,
      completed_windows: mc ?? 0,
    })
    .eq("id", roomId);
}

async function refreshUnitAggregates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string
) {
  const { data: roomRows } = await supabase
    .from("rooms")
    .select("id")
    .eq("unit_id", unitId);
  const roomIds = roomRows?.map((r) => r.id) ?? [];
  let windowTotal = 0;
  let photoTotal = 0;
  if (roomIds.length > 0) {
    const { count: w } = await supabase
      .from("windows")
      .select("*", { count: "exact", head: true })
      .in("room_id", roomIds);
    windowTotal = w ?? 0;
  }
  const [{ count: mediaCount }, { count: rc }] = await Promise.all([
    supabase
      .from("media_uploads")
      .select("*", { count: "exact", head: true })
      .eq("unit_id", unitId),
    supabase
      .from("rooms")
      .select("*", { count: "exact", head: true })
      .eq("unit_id", unitId),
  ]);
  photoTotal = mediaCount ?? 0;
  await supabase
    .from("units")
    .update({
      room_count: rc ?? 0,
      window_count: windowTotal,
      photos_uploaded: photoTotal,
    })
    .eq("id", unitId);
}

export type ActionResult = { ok: true } | { ok: false; error: string };

type UnitMutationSuccess = {
  ok: true;
  unitStatus: UnitStatus;
  roomId?: string;
  windowId?: string;
  mediaId?: string;
  photoUrl?: string | null;
  photoCountDelta?: number;
};

type UnitMutationResult = UnitMutationSuccess | { ok: false; error: string };

async function finalizeUnitMutation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
  roomIds: string[] = []
): Promise<UnitStatus> {
  const uniqueRoomIds = [...new Set(roomIds.filter(Boolean))];
  await Promise.all(
    uniqueRoomIds.map((roomId) => refreshRoomAggregates(supabase, roomId))
  );

  await Promise.all([
    refreshUnitAggregates(supabase, unitId),
    recomputeUnitStatus(supabase, unitId),
  ]);

  const { data: unit } = await supabase
    .from("units")
    .select("status")
    .eq("id", unitId)
    .single();

  after(() => {
    revalidateUnit(unitId);
  });
  return (unit?.status as UnitStatus | undefined) ?? "not_started";
}

async function resolveInstallerName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  installerId: string
): Promise<string | null> {
  if (installerId.startsWith("sch-")) {
    const realId = installerId.replace("sch-", "");
    const { data: scheduler } = await supabase
      .from("schedulers")
      .select("name")
      .eq("id", realId)
      .single();
    return scheduler?.name ? `SC: ${scheduler.name}` : null;
  }

  const { data: installer } = await supabase
    .from("installers")
    .select("name")
    .eq("id", installerId)
    .single();
  if (installer?.name) return installer.name;
  return null;
}

/**
 * When assigning units to a real installer, keep (or set) `scheduler_unit_assignments` for that
 * installer's coordinating scheduler so the lead keeps portal scope and can perform field work
 * even when another tech is the named assignee. If the installer has no `scheduler_id`, clear
 * coordinator rows for those units (same as the previous delete-only behavior).
 */
async function syncCoordinatorAssignmentForInstaller(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitIds: string[],
  installerId: string
): Promise<ActionResult | null> {
  const { data: inst, error } = await supabase
    .from("installers")
    .select("scheduler_id")
    .eq("id", installerId)
    .single();
  if (error) return { ok: false, error: error.message };

  const coordId = inst?.scheduler_id ?? null;
  if (coordId) {
    const rows = unitIds.map((uid) => ({
      id: `sua-${uid}`,
      unit_id: uid,
      scheduler_id: coordId,
      assigned_at: new Date().toISOString(),
    }));
    const { error: upErr } = await supabase
      .from("scheduler_unit_assignments")
      .upsert(rows, { onConflict: "unit_id" });
    if (upErr) return { ok: false, error: upErr.message };
  } else {
    const { error: delErr } = await supabase
      .from("scheduler_unit_assignments")
      .delete()
      .in("unit_id", unitIds);
    if (delErr) return { ok: false, error: delErr.message };
  }
  return null;
}

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

/**
 * Resolves the actor role and display name for field-work mutations.
 * Owner → "owner"/display name; scheduler → "scheduler"/display name;
 * anyone else (installer) → "installer"/unit's assigned installer name.
 */
async function resolveFieldActor(
  unitInstallerName: string | null | undefined
): Promise<{ actorRole: string; actorName: string }> {
  const user = await getCurrentUser();
  if (user?.role === "owner") {
    return { actorRole: "owner", actorName: user.displayName };
  }
  if (user?.role === "scheduler") {
    return { actorRole: "scheduler", actorName: user.displayName };
  }
  return { actorRole: "installer", actorName: unitInstallerName ?? "Installer" };
}

/** Looks up the scheduler_id responsible for a unit (from scheduler_unit_assignments). Returns null if unassigned. */
async function getSchedulerForUnit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("scheduler_unit_assignments")
    .select("scheduler_id")
    .eq("unit_id", unitId)
    .maybeSingle();
  return data?.scheduler_id ?? null;
}


export async function bulkAssignUnits(
  unitIds: string[],
  installerId: string,
  bracketingDate: string,
  installationDate: string,
  priority?: string,
  measurementDate?: string,
  completeByDate?: string
): Promise<ActionResult> {
  if (unitIds.length === 0) return { ok: false, error: "No units selected" };
  try {
    const owner = await requireOwnerOrScheduler();
    const supabase = await createClient();

    // For schedulers: same scope as loadSchedulerDataset (assignments + units on team installers).
    let scopedUnitIds = unitIds;
    if (owner.role === "scheduler") {
      const schedulerId = await getLinkedSchedulerId(owner.id);
      if (!schedulerId) return { ok: false, error: "Scheduler account not found." };

      const allowedUnitIds = new Set(await getSchedulerScopedUnitIds(supabase, schedulerId));
      scopedUnitIds = unitIds.filter((id) => allowedUnitIds.has(id));

      if (scopedUnitIds.length === 0) {
        return { ok: false, error: "None of the selected units are assigned to you." };
      }
    }

    let instName = "Assignee";
    const patch: Record<string, unknown> = {};

    if (installerId) {
      const installerName = await resolveInstallerName(supabase, installerId);
      if (!installerName) {
        return {
          ok: false,
          error: "Selected installer no longer exists. Re-open the sheet and choose a valid installer.",
        };
      }
      instName = installerName;

      if (installerId.startsWith("sch-")) {
        const schedulerId = installerId.replace("sch-", "");

        // Ensure the units are assigned to this scheduler for management access
        const assignments = scopedUnitIds.map((uid) => ({
          id: `sua-${uid}`,
          unit_id: uid,
          scheduler_id: schedulerId,
          assigned_at: new Date().toISOString(),
        }));

        const { error: assError } = await supabase
          .from("scheduler_unit_assignments")
          .upsert(assignments, { onConflict: "unit_id" });

        if (assError) return { ok: false, error: assError.message };
        patch.assigned_installer_name = null;
        patch.assigned_installer_id = null;
      } else {
        patch.assigned_installer_name = instName;
        patch.assigned_installer_id = installerId;
        const coordErr = await syncCoordinatorAssignmentForInstaller(
          supabase,
          scopedUnitIds,
          installerId
        );
        if (coordErr) return coordErr;
      }
    }

    if (bracketingDate) {
      patch.bracketing_date = bracketingDate;
    }
    if (installationDate) patch.installation_date = installationDate;
    if (measurementDate) patch.measurement_date = measurementDate;
    if (completeByDate && owner.role === "owner") patch.complete_by_date = completeByDate;
    if (priority) {
      patch.risk_flag = priority === "clear" ? null : priority;
    }

    const { error } = await supabase.from("units").update(patch).in("id", scopedUnitIds);
    if (error) return { ok: false, error: error.message };

    const { data: unitRows } = await supabase
      .from("units")
      .select("id, unit_number, building_name, client_name, status")
      .in("id", scopedUnitIds);

    for (const unit of unitRows ?? []) {
      if (measurementDate) {
        const { data: existingMeasurement } = await supabase
          .from("schedule_entries")
          .select("id")
          .eq("unit_id", unit.id)
          .eq("task_type", "measurement")
          .single();

        if (existingMeasurement) {
          await supabase
            .from("schedule_entries")
            .update({
              task_date: measurementDate,
              status: unit.status,
              owner_user_id: owner.id,
              owner_name: owner.displayName,
            })
            .eq("id", existingMeasurement.id);
        } else {
          await supabase.from("schedule_entries").insert({
            id: `sch-${crypto.randomUUID().slice(0, 8)}`,
            unit_id: unit.id,
            unit_number: unit.unit_number,
            building_name: unit.building_name,
            client_name: unit.client_name,
            owner_user_id: owner.id,
            owner_name: owner.displayName,
            task_type: "measurement",
            task_date: measurementDate,
            status: unit.status,
            risk_flag: "green",
          });
        }
      }

      if (bracketingDate) {
        const { data: existingBracketing } = await supabase
          .from("schedule_entries")
          .select("id")
          .eq("unit_id", unit.id)
          .eq("task_type", "bracketing")
          .single();

        if (existingBracketing) {
          await supabase
            .from("schedule_entries")
            .update({
              task_date: bracketingDate,
              status: unit.status,
              owner_user_id: owner.id,
              owner_name: owner.displayName,
            })
            .eq("id", existingBracketing.id);
        } else {
          await supabase.from("schedule_entries").insert({
            id: `sch-${crypto.randomUUID().slice(0, 8)}`,
            unit_id: unit.id,
            unit_number: unit.unit_number,
            building_name: unit.building_name,
            client_name: unit.client_name,
            owner_user_id: owner.id,
            owner_name: owner.displayName,
            task_type: "bracketing",
            task_date: bracketingDate,
            status: unit.status,
            risk_flag: "green",
          });
        }
      }

      if (installationDate) {
        const { data: existingInstallation } = await supabase
          .from("schedule_entries")
          .select("id")
          .eq("unit_id", unit.id)
          .eq("task_type", "installation")
          .single();

        if (existingInstallation) {
          await supabase
            .from("schedule_entries")
            .update({
              task_date: installationDate,
              status: unit.status,
              owner_user_id: owner.id,
              owner_name: owner.displayName,
            })
            .eq("id", existingInstallation.id);
        } else {
          await supabase.from("schedule_entries").insert({
            id: `sch-${crypto.randomUUID().slice(0, 8)}`,
            unit_id: unit.id,
            unit_number: unit.unit_number,
            building_name: unit.building_name,
            client_name: unit.client_name,
            owner_user_id: owner.id,
            owner_name: owner.displayName,
            task_type: "installation",
            task_date: installationDate,
            status: unit.status,
            risk_flag: "green",
          });
        }
      }
    }

    await Promise.all(
      unitIds.map((unitId) =>
        logUnitActivity(supabase, unitId, owner.role, owner.displayName, "bulk_assigned", {
          ...(installerId ? { installer: instName } : {}),
          ...(measurementDate ? { measurementDate } : {}),
          ...(bracketingDate ? { bracketingDate } : {}),
          ...(installationDate ? { installationDate } : {}),
          ...(completeByDate ? { completeByDate } : {}),
          unitCount: unitIds.length,
        })
      )
    );

    // ─── Notifications ────────────────────────────────────────────────────────
    after(async () => {
      const db = createAdminClient();
      // Notify the real installer (not a scheduler acting as installer)
      if (installerId && !installerId.startsWith("sch-")) {
        const { data: insRow } = await db
          .from("installers")
          .select("id")
          .eq("id", installerId)
          .maybeSingle();
        if (insRow) {
          for (const uid of scopedUnitIds) {
            const context = await loadUnitNotificationContext(db, uid);
            await emitNotification({
              recipientRole: "installer",
              recipientId: installerId,
              type: NOTIF_UNIT_ASSIGNED_TO_INSTALLER,
              title: "Unit added to your queue",
              body: context
                ? buildUnitAssignedNotificationBody(context, owner.displayName)
                : `Assigned by ${owner.displayName}`,
              relatedUnitId: uid,
            });
          }
        }
      }

      // Notify about installation date being newly set (per unit, only if it's new)
      if (installationDate) {
        for (const uid of scopedUnitIds) {
          const { data: unitRow } = await db
            .from("units")
            .select("assigned_installer_id, installation_date")
            .eq("id", uid)
            .maybeSingle();
          if (unitRow?.assigned_installer_id && unitRow.installation_date === installationDate) {
            const context = await loadUnitNotificationContext(db, uid);
            await emitNotification({
              recipientRole: "installer",
              recipientId: unitRow.assigned_installer_id,
              type: NOTIF_INSTALLATION_DATE_SET,
              title: "Installation date set",
              body: context
                ? buildUnitDatesNotificationBody(context, { installationDate })
                : `Installation: ${installationDate}`,
              relatedUnitId: uid,
            });
          }
        }
      }
    });
    // ─────────────────────────────────────────────────────────────────────────

    revalidateManyUnitRoutes(
      scopedUnitIds.map((id) => ({ id }))
    );
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function updateUnitAssignment(
  unitId: string,
  installerId: string | undefined | null,
  measurementDate: string,
  bracketingDate: string,
  installationDate: string
): Promise<ActionResult> {
  try {
    const owner = await requireOwnerOrScheduler();
    const supabase = await createClient();

    const scopeErr = await assertSchedulerUnitScope(supabase, owner, unitId);
    if (scopeErr) return scopeErr;

    let unitMeta:
      | {
          unit_number: string;
          building_name: string;
          client_name: string;
          status: string;
        }
      | null
      | undefined;

    const ensureUnitMeta = async () => {
      if (unitMeta !== undefined) return unitMeta;
      const { data } = await supabase
        .from("units")
        .select("unit_number, building_name, client_name, status")
        .eq("id", unitId)
        .single();
      unitMeta = data ?? null;
      return unitMeta;
    };

    const patch: Record<string, unknown> = {
      measurement_date: measurementDate || null,
      bracketing_date: bracketingDate || null,
      installation_date: installationDate || null,
    };

    if (installerId) {
      const installerName = await resolveInstallerName(supabase, installerId);
      if (!installerName) {
        return {
          ok: false,
          error: "Selected installer no longer exists. Choose a valid installer and try again.",
        };
      }

      if (installerId.startsWith("sch-")) {
        const schedulerId = installerId.replace("sch-", "");

        const { error: assError } = await supabase
          .from("scheduler_unit_assignments")
          .upsert(
            {
              id: `sua-${unitId}`,
              unit_id: unitId,
              scheduler_id: schedulerId,
              assigned_at: new Date().toISOString(),
            },
            { onConflict: "unit_id" }
          );

        if (assError) return { ok: false, error: assError.message };
        patch.assigned_installer_name = null;
        patch.assigned_installer_id = null;
      } else {
        patch.assigned_installer_name = installerName;
        patch.assigned_installer_id = installerId;
        const coordErr = await syncCoordinatorAssignmentForInstaller(supabase, [unitId], installerId);
        if (coordErr) return coordErr;
      }
    }

    if (bracketingDate) {
      patch.bracketing_date = bracketingDate;
    }

    const { error } = await supabase
      .from("units")
      .update(patch)
      .eq("id", unitId);
    if (error) {
      return { ok: false, error: error.message };
    }

    // Upsert measurement schedule entry
    if (measurementDate) {
      const nextUnitMeta = await ensureUnitMeta();
      const { data: existingMeasurement } = await supabase
        .from("schedule_entries")
        .select("id")
        .eq("unit_id", unitId)
        .eq("task_type", "measurement")
        .single();

      if (existingMeasurement) {
        await supabase
          .from("schedule_entries")
          .update({
            task_date: measurementDate,
            status: nextUnitMeta?.status ?? "not_started",
            owner_user_id: owner.id,
            owner_name: owner.displayName,
          })
          .eq("id", existingMeasurement.id);
      } else {
        await supabase.from("schedule_entries").insert({
          id: `sch-${crypto.randomUUID().slice(0, 8)}`,
          unit_id: unitId,
          unit_number: nextUnitMeta?.unit_number ?? "",
          building_name: nextUnitMeta?.building_name ?? "",
          client_name: nextUnitMeta?.client_name ?? "",
          owner_user_id: owner.id,
          owner_name: owner.displayName,
          task_type: "measurement",
          task_date: measurementDate,
          status: nextUnitMeta?.status ?? "not_started",
          risk_flag: "green",
        });
      }
    } else {
      await supabase
        .from("schedule_entries")
        .delete()
        .eq("unit_id", unitId)
        .eq("task_type", "measurement");
    }

    if (bracketingDate) {
      const nextUnitMeta = await ensureUnitMeta();
      const { data: existingBracketing } = await supabase
        .from("schedule_entries")
        .select("id")
        .eq("unit_id", unitId)
        .eq("task_type", "bracketing")
        .single();

      if (existingBracketing) {
        await supabase
          .from("schedule_entries")
          .update({
            task_date: bracketingDate,
            status: nextUnitMeta?.status ?? "not_started",
            owner_user_id: owner.id,
            owner_name: owner.displayName,
          })
          .eq("id", existingBracketing.id);
      } else {
        await supabase.from("schedule_entries").insert({
          id: `sch-${crypto.randomUUID().slice(0, 8)}`,
          unit_id: unitId,
          unit_number: nextUnitMeta?.unit_number ?? "",
          building_name: nextUnitMeta?.building_name ?? "",
          client_name: nextUnitMeta?.client_name ?? "",
          owner_user_id: owner.id,
          owner_name: owner.displayName,
          task_type: "bracketing",
          task_date: bracketingDate,
          status: nextUnitMeta?.status ?? "not_started",
          risk_flag: "green",
        });
      }
    } else {
      await supabase
        .from("schedule_entries")
        .delete()
        .eq("unit_id", unitId)
        .eq("task_type", "bracketing");
    }
    if (installationDate) {
      const nextUnitMeta = await ensureUnitMeta();
      const { data: existingInstallation } = await supabase
        .from("schedule_entries")
        .select("id")
        .eq("unit_id", unitId)
        .eq("task_type", "installation")
        .single();

      if (existingInstallation) {
        await supabase
          .from("schedule_entries")
          .update({
            task_date: installationDate,
            status: nextUnitMeta?.status ?? "not_started",
            owner_user_id: owner.id,
            owner_name: owner.displayName,
          })
          .eq("id", existingInstallation.id);
      } else {
        await supabase.from("schedule_entries").insert({
          id: `sch-${crypto.randomUUID().slice(0, 8)}`,
          unit_id: unitId,
          unit_number: nextUnitMeta?.unit_number ?? "",
          building_name: nextUnitMeta?.building_name ?? "",
          client_name: nextUnitMeta?.client_name ?? "",
          owner_user_id: owner.id,
          owner_name: owner.displayName,
          task_type: "installation",
          task_date: installationDate,
          status: nextUnitMeta?.status ?? "not_started",
          risk_flag: "green",
        });
      }
    } else {
      await supabase
        .from("schedule_entries")
        .delete()
        .eq("unit_id", unitId)
        .eq("task_type", "installation");
    }

    await logUnitActivity(supabase, unitId, owner.role, owner.displayName, "installer_assigned", {
      ...(installerId && patch.assigned_installer_name ? { installer: patch.assigned_installer_name as string } : {}),
      ...(measurementDate ? { measurementDate } : {}),
      ...(bracketingDate ? { bracketingDate } : {}),
      ...(installationDate ? { installationDate } : {}),
    });

    // ─── Notifications ────────────────────────────────────────────────────────
    after(async () => {
      const resolvedInstallerId = installerId && !installerId.startsWith("sch-") ? installerId : null;
      const context = resolvedInstallerId
        ? await loadUnitNotificationContext(createAdminClient(), unitId)
        : null;

      // Notify installer of assignment (single unit)
      if (resolvedInstallerId && patch.assigned_installer_name) {
        await emitNotification({
          recipientRole: "installer",
          recipientId: resolvedInstallerId,
          type: NOTIF_UNIT_ASSIGNED_TO_INSTALLER,
          title: "Unit added to your queue",
          body: context
            ? buildUnitAssignedNotificationBody(context, owner.displayName)
            : `Assigned by ${owner.displayName}`,
          relatedUnitId: unitId,
        });
      }

      // Notify installer of date changes
      if (resolvedInstallerId && (measurementDate || bracketingDate || installationDate)) {
        const hadInstallDate = Boolean(installationDate);
        await emitNotification({
          recipientRole: "installer",
          recipientId: resolvedInstallerId,
          type: hadInstallDate ? NOTIF_INSTALLATION_DATE_SET : NOTIF_DATES_CHANGED,
          title: hadInstallDate ? "Installation date set" : "Schedule dates updated",
          body: context
            ? buildUnitDatesNotificationBody(context, {
                measurementDate,
                bracketingDate,
                installationDate,
              })
            : [
                measurementDate && `Measurement: ${measurementDate}`,
                bracketingDate && `Bracketing: ${bracketingDate}`,
                installationDate && `Installation: ${installationDate}`,
              ]
                .filter(Boolean)
                .join(" · "),
          relatedUnitId: unitId,
        });
      }
    });
    // ─────────────────────────────────────────────────────────────────────────

    revalidateUnitRoutes(unitId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

/** @deprecated Status is auto-derived via recomputeUnitStatus from window data. */
export async function updateUnitStatus(): Promise<ActionResult> {
  return { ok: false, error: "Manual status updates are no longer supported. Status is auto-derived from window data." };
}

export async function uploadUnitStagePhotos(
  formData: FormData
): Promise<ActionResult> {
  try {
    const unitId = String(formData.get("unitId") ?? "");
    const stage = String(formData.get("stage") ?? "") as UnitPhotoStage;
    const labelPrefix = String(formData.get("labelPrefix") ?? "");
    const files = formData
      .getAll("photos")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!unitId) {
      return { ok: false, error: "Missing unit" };
    }
    if (!UNIT_PHOTO_STAGES.includes(stage)) {
      return { ok: false, error: "Invalid photo stage" };
    }
    if (files.length === 0) {
      return { ok: false, error: "Add at least one photo" };
    }
    for (const file of files) {
      const validation = validateIncomingImageFile(file, { fieldLabel: "Photo" });
      if (validation) return validation;
    }

    const supabase = await createClient();
    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("assigned_installer_name")
      .eq("id", unitId)
      .single();

    if (unitError || !unit) {
      return { ok: false, error: "Unit not found" };
    }

    const uploadedPaths: string[] = [];
    const mediaIds: string[] = [];
    const stagePhase = getPhaseForStage(stage);

    for (const [index, file] of files.entries()) {
      const ext =
        (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "jpg";
      const path = `${unitId}/stage/${stage}/${crypto.randomUUID()}.${ext}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buf, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        if (mediaIds.length > 0) {
          await supabase.from("media_uploads").delete().in("id", mediaIds);
        }
        if (uploadedPaths.length > 0) {
          await supabase.storage.from(BUCKET).remove(uploadedPaths);
        }
        return { ok: false, error: normalizeStorageError(uploadError.message) };
      }

      uploadedPaths.push(path);

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const mediaId = `med-${crypto.randomUUID()}`;
      const { error: mediaError } = await supabase.from("media_uploads").insert({
        id: mediaId,
        storage_path: path,
        public_url: publicUrl,
        upload_kind: "unit_stage_photo",
        unit_id: unitId,
        label: formatStagePhotoLabel(stage, labelPrefix, index, files.length),
        phase: stagePhase,
        stage,
      });

      if (mediaError) {
        if (mediaIds.length > 0) {
          await supabase.from("media_uploads").delete().in("id", mediaIds);
        }
        await supabase.storage.from(BUCKET).remove(uploadedPaths);
        return { ok: false, error: mediaError.message };
      }

      mediaIds.push(mediaId);
    }

    await refreshUnitAggregates(supabase, unitId);
    await logUnitActivity(
      supabase,
      unitId,
      "installer",
      unit.assigned_installer_name ?? "Installer",
      "stage_photos_added",
      {
        stage,
        count: files.length,
      }
    );
    revalidateUnit(unitId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

type CreatedRoom = { id: string; unitId: string; name: string; windowCount: number; completedWindows: number };

export async function createRoomsForUnit(
  unitId: string,
  names: string[]
): Promise<ActionResult & { rooms?: CreatedRoom[] }> {
  try {
    if (names.length === 0) {
      return { ok: true, rooms: [] };
    }
    const supabase = await createClient();
    const rows = names.map((name) => ({
      id: `room-${crypto.randomUUID()}`,
      unit_id: unitId,
      name: name.trim(),
      window_count: 0,
      completed_windows: 0,
    }));
    const { data: inserted, error } = await supabase.from("rooms").insert(rows).select();
    if (error) {
      return { ok: false, error: error.message };
    }
    await refreshUnitAggregates(supabase, unitId);
    revalidateUnit(unitId);
    const rooms: CreatedRoom[] = (inserted ?? []).map((r: { id: string; unit_id: string; name: string; window_count: number; completed_windows: number }) => ({
      id: r.id,
      unitId: r.unit_id,
      name: r.name,
      windowCount: r.window_count,
      completedWindows: r.completed_windows,
    }));
    return { ok: true, rooms };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function updateRoomName(
  roomId: string,
  unitId: string,
  name: string
): Promise<ActionResult> {
  try {
    const nextName = name.trim();
    if (!roomId || !unitId) {
      return { ok: false, error: "Missing room or unit." };
    }
    if (!nextName) {
      return { ok: false, error: "Room name is required." };
    }

    const supabase = await createClient();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, unit_id")
      .eq("id", roomId)
      .single();
    if (roomError || !room || room.unit_id !== unitId) {
      return { ok: false, error: "Room not found for this unit." };
    }

    const { data: duplicate } = await supabase
      .from("rooms")
      .select("id")
      .eq("unit_id", unitId)
      .ilike("name", nextName)
      .neq("id", roomId)
      .limit(1);
    if ((duplicate ?? []).length > 0) {
      return { ok: false, error: "A room with this name already exists." };
    }

    const { error } = await supabase.from("rooms").update({ name: nextName }).eq("id", roomId);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidateUnit(unitId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function deleteRoom(
  roomId: string,
  unitId: string
): Promise<ActionResult> {
  try {
    if (!roomId || !unitId) {
      return { ok: false, error: "Missing room or unit." };
    }

    const supabase = await createClient();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, unit_id")
      .eq("id", roomId)
      .single();
    if (roomError || !room || room.unit_id !== unitId) {
      return { ok: false, error: "Room not found for this unit." };
    }

    const { count: windowCount } = await supabase
      .from("windows")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomId);
    if ((windowCount ?? 0) > 0) {
      return {
        ok: false,
        error:
          "This room already has windows. Remove or reassign its windows before deleting the room.",
      };
    }

    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) {
      return { ok: false, error: error.message };
    }

    await refreshUnitAggregates(supabase, unitId);
    await recomputeUnitStatus(supabase, unitId);
    revalidateUnit(unitId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function deleteWindow(
  windowId: string,
  unitId: string
): Promise<UnitMutationResult> {
  try {
    if (!windowId || !unitId) {
      return { ok: false, error: "Missing window or unit." };
    }

    const supabase = await createClient();
    const { data: win, error: winError } = await supabase
      .from("windows")
      .select("id, room_id, rooms!inner(unit_id)")
      .eq("id", windowId)
      .single();
    if (winError || !win) {
      return { ok: false, error: "Window not found." };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((win as any).rooms?.unit_id !== unitId) {
      return { ok: false, error: "Window does not belong to this unit." };
    }

    const { count: deletedMediaCount } = await supabase
      .from("media_uploads")
      .select("*", { count: "exact", head: true })
      .eq("window_id", windowId);

    // Delete associated media uploads first
    await supabase.from("media_uploads").delete().eq("window_id", windowId);

    const [{ data: winRow }, { data: unitRow }] = await Promise.all([
      supabase
        .from("windows")
        .select("label, blind_type, room_id")
        .eq("id", windowId)
        .single(),
      supabase
        .from("units")
        .select("assigned_installer_name, status")
        .eq("id", unitId)
        .single(),
    ]);

    const { error } = await supabase.from("windows").delete().eq("id", windowId);
    if (error) {
      return { ok: false, error: error.message };
    }

    const prevStatus = (unitRow?.status as UnitStatus | undefined) ?? "not_started";
    const unitStatus = await finalizeUnitMutation(supabase, unitId, [
      winRow?.room_id ?? "",
    ]);

    const capturedWinRow = winRow;
    const { actorRole, actorName } = await resolveFieldActor(unitRow?.assigned_installer_name);
    after(async () => {
      const db = createAdminClient();
      await logUnitActivity(
        db,
        unitId,
        actorRole,
        actorName,
        "window_deleted",
        {
          windowId,
          windowLabel: capturedWinRow?.label ?? windowId,
          blindType: capturedWinRow?.blind_type,
          roomId: capturedWinRow?.room_id,
        }
      );
      if (unitStatus !== prevStatus) {
        const schedulerId = await getSchedulerForUnit(db, unitId);
        if (schedulerId) {
          await emitUnitProgressNotification(db, schedulerId, unitId, unitStatus);
        }
      }
    });
    return {
      ok: true,
      windowId,
      roomId: winRow?.room_id ?? undefined,
      unitStatus,
      photoCountDelta: -(deletedMediaCount ?? 0),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function createWindowWithPhoto(
  formData: FormData
): Promise<UnitMutationResult> {
  try {
    const unitId = String(formData.get("unitId") ?? "");
    const roomId = String(formData.get("roomId") ?? "");
    const label = String(formData.get("label") ?? "").trim();
    const blindType = String(formData.get("blindType") ?? "") as BlindType;
    const chainSideRaw = String(formData.get("chainSide") ?? "");
    const chainSide = chainSideRaw === "left" || chainSideRaw === "right" ? chainSideRaw : null;
    const width = String(formData.get("width") ?? "");
    const height = String(formData.get("height") ?? "");
    const depth = String(formData.get("depth") ?? "");
    const notes = String(formData.get("notes") ?? "");
    const riskFlag = String(formData.get("riskFlag") ?? "green") as RiskFlag;

    const file = formData.get("photo");
    const wn = parseFloat(width);
    const hn = parseFloat(height);

    if (!unitId || !roomId) {
      return { ok: false, error: "Missing unit or room" };
    }
    if (!label) {
      return { ok: false, error: "Window label is required" };
    }
    if (!chainSide) {
      return { ok: false, error: "Chain side (left or right) is required." };
    }
    if (!Number.isFinite(wn) || wn <= 0 || !Number.isFinite(hn) || hn <= 0) {
      return { ok: false, error: "Valid width and height are required" };
    }
    const isGreen = riskFlag === "green";
    const hasPhoto = file instanceof File && file.size > 0;

    if (!isGreen && !hasPhoto) {
      return { ok: false, error: "Photo is required for yellow or red risk." };
    }

    if (hasPhoto) {
      const fileValidation = validateIncomingImageFile(file as File, { fieldLabel: "Photo" });
      if (fileValidation) return fileValidation;
    }

    if (blindType !== "screen" && blindType !== "blackout") {
      return { ok: false, error: "Invalid blind type" };
    }
    if (riskFlag !== "green" && riskFlag !== "yellow" && riskFlag !== "red") {
      return { ok: false, error: "Invalid risk flag" };
    }
    if ((riskFlag === "yellow" || riskFlag === "red") && !notes.trim()) {
      return { ok: false, error: "Notes are required for yellow or red risk." };
    }

    const supabase = await createClient();

    // Measurements should appear in the bracketed or installed photo stage.
    const uploadStage = getStageForWindowUpload();
    const uploadPhase = getPhaseForStage(uploadStage);

    // Prepare photo upload promise (runs in parallel with room validation below).
    let photoUploadPromise: Promise<{ publicUrl: string; storagePath: string } | { error: string } | null> = Promise.resolve(null);
    let photoPath: string | null = null;
    if (hasPhoto && file instanceof File) {
      const ext =
        (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "jpg";
      photoPath = `${unitId}/${roomId}/${crypto.randomUUID()}.${ext}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      photoUploadPromise = supabase.storage
        .from(BUCKET)
        .upload(photoPath, buf, { contentType: file.type || "image/jpeg", upsert: false })
        .then(({ error: upErr }) => {
          if (upErr) return { error: normalizeStorageError(upErr.message) };
          const { data: { publicUrl: url } } = supabase.storage.from(BUCKET).getPublicUrl(photoPath!);
          return { publicUrl: url, storagePath: photoPath! };
        });
    }

    // Validate room membership in parallel with the photo upload.
    const [roomResult, photoResult] = await Promise.all([
      supabase.from("rooms").select("unit_id").eq("id", roomId).single(),
      photoUploadPromise,
    ]);
    if (roomResult.error || !roomResult.data || roomResult.data.unit_id !== unitId) {
      if (photoPath) await supabase.storage.from(BUCKET).remove([photoPath]);
      return { ok: false, error: "Room does not belong to this unit" };
    }
    if (photoResult && "error" in photoResult) {
      return { ok: false, error: photoResult.error };
    }

    let publicUrl: string | null = null;
    let storagePath: string | null = null;
    if (photoResult && "publicUrl" in photoResult) {
      publicUrl = photoResult.publicUrl;
      storagePath = photoResult.storagePath;
    }

    const windowId = `win-${crypto.randomUUID()}`;
    const dn = depth.trim() ? parseFloat(depth) : null;

    const blindWidth = String(formData.get("blindWidth") ?? "").trim();
    const blindHeight = String(formData.get("blindHeight") ?? "").trim();
    const blindDepth = String(formData.get("blindDepth") ?? "").trim();
    const bw = blindWidth ? parseFloat(blindWidth) : null;
    const bh = blindHeight ? parseFloat(blindHeight) : null;
    const bd = blindDepth ? parseFloat(blindDepth) : null;

    const windowInsertPayload: Record<string, unknown> = {
      id: windowId,
      room_id: roomId,
      label,
      blind_type: blindType,
      chain_side: chainSide,
      width: wn,
      height: hn,
      depth: dn !== null && Number.isFinite(dn) ? dn : null,
      blind_width: bw !== null && Number.isFinite(bw) ? bw : null,
      blind_height: bh !== null && Number.isFinite(bh) ? bh : null,
      blind_depth: bd !== null && Number.isFinite(bd) ? bd : null,
      notes: notes.trim(),
      risk_flag: riskFlag,
      photo_url: publicUrl,
      measured: true,
      bracketed: false,
      installed: false,
    };
    let insertPayload = windowInsertPayload;
    let { error: insErr } = await supabase.from("windows").insert(insertPayload);
    while (insErr) {
      const fallback = removeUnsupportedBlindSizeColumns(insertPayload, insErr.message);
      if (!fallback.removedAny) {
        break;
      }
      insertPayload = fallback.payload;
      const retry = await supabase.from("windows").insert(insertPayload);
      insErr = retry.error;
    }
    if (insErr) {
      if (storagePath) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
      }
      return { ok: false, error: insErr.message };
    }

    if (publicUrl && storagePath) {
      const { error: medErr } = await supabase.from("media_uploads").insert({
        id: `med-${crypto.randomUUID()}`,
        storage_path: storagePath,
        public_url: publicUrl,
        upload_kind: "window_measure",
        phase: uploadPhase,
        stage: uploadStage,
        unit_id: unitId,
        room_id: roomId,
        window_id: windowId,
        label,
      });
      if (medErr) {
        await supabase.from("windows").delete().eq("id", windowId);
        await supabase.storage.from(BUCKET).remove([storagePath]);
        return { ok: false, error: medErr.message };
      }
    }

    const { data: unit } = await supabase
      .from("units")
      .select("assigned_installer_name, status")
      .eq("id", unitId)
      .single();
    const prevStatus = (unit?.status as UnitStatus | undefined) ?? "not_started";
    const unitStatus = await finalizeUnitMutation(supabase, unitId, [roomId]);
    const { actorRole, actorName } = await resolveFieldActor(unit?.assigned_installer_name);

    after(async () => {
      const db = createAdminClient();
      await logUnitActivity(
        db,
        unitId,
        actorRole,
        actorName,
        "window_created",
        {
          roomId,
          windowId,
          windowLabel: label,
          blindType,
          riskFlag,
          width: wn,
          height: hn,
          depth: dn !== null && Number.isFinite(dn) ? dn : null,
          hasPhoto: !!publicUrl,
        }
      );

      // Escalation alert to scheduler when window has yellow/red flag
      if (riskFlag === "yellow" || riskFlag === "red") {
        const schedulerId = await getSchedulerForUnit(db, unitId);
        if (schedulerId) {
          await emitWindowEscalationNotification(db, schedulerId, {
            unitId,
            roomId,
            windowLabel: label,
            riskFlag,
          });
        }
      }

      if (unitStatus !== prevStatus) {
        const schedulerId = await getSchedulerForUnit(db, unitId);
        if (schedulerId) {
          await emitUnitProgressNotification(db, schedulerId, unitId, unitStatus);
        }
      }
    });
    return {
      ok: true,
      unitStatus,
      windowId,
      roomId,
      photoUrl: publicUrl,
      photoCountDelta: publicUrl ? 1 : 0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function updateWindowWithOptionalPhoto(
  formData: FormData
): Promise<UnitMutationResult> {
  try {
    const windowId = String(formData.get("windowId") ?? "");
    const unitId = String(formData.get("unitId") ?? "");
    const roomId = String(formData.get("roomId") ?? "");
    const label = String(formData.get("label") ?? "").trim();
    const blindType = String(formData.get("blindType") ?? "") as BlindType;
    const chainSideRaw = String(formData.get("chainSide") ?? "");
    const chainSide = chainSideRaw === "left" || chainSideRaw === "right" ? chainSideRaw : null;
    const width = String(formData.get("width") ?? "");
    const height = String(formData.get("height") ?? "");
    const depth = String(formData.get("depth") ?? "");
    const notes = String(formData.get("notes") ?? "");
    const riskFlag = String(formData.get("riskFlag") ?? "green") as RiskFlag;

    const file = formData.get("photo");
    const wn = parseFloat(width);
    const hn = parseFloat(height);

    if (!windowId || !unitId || !roomId) {
      return { ok: false, error: "Missing ids" };
    }
    if (!label) {
      return { ok: false, error: "Window label is required" };
    }
    if (!chainSide) {
      return { ok: false, error: "Chain side (left or right) is required." };
    }
    if (!Number.isFinite(wn) || wn <= 0 || !Number.isFinite(hn) || hn <= 0) {
      return { ok: false, error: "Valid width and height are required" };
    }

    if (blindType !== "screen" && blindType !== "blackout") {
      return { ok: false, error: "Invalid blind type" };
    }
    if (riskFlag !== "green" && riskFlag !== "yellow" && riskFlag !== "red") {
      return { ok: false, error: "Invalid risk flag" };
    }
    if ((riskFlag === "yellow" || riskFlag === "red") && !notes.trim()) {
      return { ok: false, error: "Notes are required for yellow or red risk." };
    }
    if (file instanceof File && file.size > 0) {
      const fileValidation = validateIncomingImageFile(file, { fieldLabel: "Photo" });
      if (fileValidation) return fileValidation;
    }

    const supabase = await createClient();

    // Measurements should appear in the bracketed or installed photo stage.
    const uploadStage = getStageForWindowUpload();
    const uploadPhase = getPhaseForStage(uploadStage);

    // Prepare photo upload promise (runs in parallel with validation queries below).
    let photoUploadPromise2: Promise<{ publicUrl: string; storagePath: string } | { error: string } | null> = Promise.resolve(null);
    let photoPath2: string | null = null;
    if (file instanceof File && file.size > 0) {
      const ext =
        (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "jpg";
      photoPath2 = `${unitId}/${roomId}/${crypto.randomUUID()}.${ext}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      photoUploadPromise2 = supabase.storage
        .from(BUCKET)
        .upload(photoPath2, buf, { contentType: file.type || "image/jpeg", upsert: false })
        .then(({ error: upErr }) => {
          if (upErr) return { error: normalizeStorageError(upErr.message) };
          const { data: { publicUrl: url } } = supabase.storage.from(BUCKET).getPublicUrl(photoPath2!);
          return { publicUrl: url, storagePath: photoPath2! };
        });
    }

    const [winResult, roomResult2, photoResult2] = await Promise.all([
      supabase.from("windows").select("id, room_id").eq("id", windowId).single(),
      supabase.from("rooms").select("unit_id").eq("id", roomId).single(),
      photoUploadPromise2,
    ]);
    if (winResult.error || !winResult.data || winResult.data.room_id !== roomId) {
      if (photoPath2) await supabase.storage.from(BUCKET).remove([photoPath2]);
      return { ok: false, error: "Window not found" };
    }
    if (roomResult2.error || !roomResult2.data || roomResult2.data.unit_id !== unitId) {
      if (photoPath2) await supabase.storage.from(BUCKET).remove([photoPath2]);
      return { ok: false, error: "Invalid room" };
    }
    if (photoResult2 && "error" in photoResult2) {
      return { ok: false, error: photoResult2.error };
    }

    let publicUrl: string | undefined;
    let storagePath: string | undefined;
    if (photoResult2 && "publicUrl" in photoResult2) {
      publicUrl = photoResult2.publicUrl;
      storagePath = photoResult2.storagePath;
    }

    const dn = depth.trim() ? parseFloat(depth) : null;

    const blindWidth = String(formData.get("blindWidth") ?? "").trim();
    const blindHeight = String(formData.get("blindHeight") ?? "").trim();
    const blindDepth = String(formData.get("blindDepth") ?? "").trim();
    const bw = blindWidth ? parseFloat(blindWidth) : null;
    const bh = blindHeight ? parseFloat(blindHeight) : null;
    const bd = blindDepth ? parseFloat(blindDepth) : null;

    const patch: Record<string, unknown> = {
      label,
      blind_type: blindType,
      chain_side: chainSide,
      width: wn,
      height: hn,
      depth: dn !== null && Number.isFinite(dn) ? dn : null,
      blind_width: bw !== null && Number.isFinite(bw) ? bw : null,
      blind_height: bh !== null && Number.isFinite(bh) ? bh : null,
      blind_depth: bd !== null && Number.isFinite(bd) ? bd : null,
      notes: notes.trim(),
      risk_flag: riskFlag,
      measured: true,
    };
    if (publicUrl) {
      patch.photo_url = publicUrl;
    }

    let updatePatch = patch;
    let { error: upWin } = await supabase.from("windows").update(updatePatch).eq("id", windowId);
    while (upWin) {
      const fallback = removeUnsupportedBlindSizeColumns(updatePatch, upWin.message);
      if (!fallback.removedAny) {
        break;
      }
      updatePatch = fallback.payload;
      const retry = await supabase.from("windows").update(updatePatch).eq("id", windowId);
      upWin = retry.error;
    }
    if (upWin) {
      if (storagePath) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
      }
      return { ok: false, error: upWin.message };
    }

    if (publicUrl && storagePath) {
      const { error: mediaInsertError } = await supabase.from("media_uploads").insert({
        id: `med-${crypto.randomUUID()}`,
        storage_path: storagePath,
        public_url: publicUrl,
        upload_kind: "window_measure",
        phase: uploadPhase,
        stage: uploadStage,
        unit_id: unitId,
        room_id: roomId,
        window_id: windowId,
        label: `${label} (updated)`,
      });
      if (mediaInsertError) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        return { ok: false, error: mediaInsertError.message };
      }
    }

    const { data: unit } = await supabase
      .from("units")
      .select("assigned_installer_name, status")
      .eq("id", unitId)
      .single();
    const prevStatus = (unit?.status as UnitStatus | undefined) ?? "not_started";
    const unitStatus = await finalizeUnitMutation(supabase, unitId, [roomId]);
    const { actorRole, actorName } = await resolveFieldActor(unit?.assigned_installer_name);

    after(async () => {
      const db = createAdminClient();
      await logUnitActivity(
        db,
        unitId,
        actorRole,
        actorName,
        "window_updated",
        {
          roomId,
          windowId,
          windowLabel: label,
          blindType,
          riskFlag,
          replacedPhoto: Boolean(publicUrl),
        }
      );

      // Escalation alert to scheduler when window flag is yellow/red
      if (riskFlag === "yellow" || riskFlag === "red") {
        const schedulerId = await getSchedulerForUnit(db, unitId);
        if (schedulerId) {
          await emitWindowEscalationNotification(db, schedulerId, {
            unitId,
            roomId,
            windowLabel: label,
            riskFlag,
          });
        }
      }

      if (unitStatus !== prevStatus) {
        const schedulerId = await getSchedulerForUnit(db, unitId);
        if (schedulerId) {
          await emitUnitProgressNotification(db, schedulerId, unitId, unitStatus);
        }
      }
    });
    return {
      ok: true,
      unitStatus,
      windowId,
      roomId,
      photoUrl: publicUrl ?? null,
      photoCountDelta: publicUrl ? 1 : 0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function uploadWindowPostBracketingPhoto(
  formData: FormData
): Promise<UnitMutationResult> {
  try {
    const unitId = String(formData.get("unitId") ?? "");
    const roomId = String(formData.get("roomId") ?? "");
    const windowId = String(formData.get("windowId") ?? "");
    const notes = String(formData.get("notes") ?? "");
    const riskFlag = String(formData.get("riskFlag") ?? "green") as RiskFlag;
    const photo = formData.get("photo");

    if (!unitId || !roomId || !windowId) {
      return { ok: false, error: "Missing unit, room, or window." };
    }
    const isGreen = riskFlag === "green";
    const hasPhoto = photo instanceof File && photo.size > 0;

    if (!isGreen && !hasPhoto) {
      return { ok: false, error: "Post-bracketing photo is required for yellow or red risk." };
    }

    if (hasPhoto) {
      const photoValidation = validateIncomingImageFile(photo as File, {
        fieldLabel: "Post-bracketing photo",
      });
      if (photoValidation) return photoValidation;
    }
    if (riskFlag !== "green" && riskFlag !== "yellow" && riskFlag !== "red") {
      return { ok: false, error: "Invalid risk flag." };
    }
    if ((riskFlag === "yellow" || riskFlag === "red") && !notes.trim()) {
      return { ok: false, error: "Notes are required for yellow or red risk." };
    }

    const supabase = await createClient();
    const [roomResult, windowResult, unitResult] = await Promise.all([
      supabase.from("rooms").select("unit_id").eq("id", roomId).single(),
      supabase.from("windows").select("id, room_id, label").eq("id", windowId).single(),
      supabase
        .from("units")
        .select("assigned_installer_name, status")
        .eq("id", unitId)
        .single(),
    ]);
    if (roomResult.error || !roomResult.data || roomResult.data.unit_id !== unitId) {
      return { ok: false, error: "Room does not belong to this unit." };
    }
    const windowRow = windowResult.data;
    if (windowResult.error || !windowRow || windowRow.room_id !== roomId) {
      return { ok: false, error: "Window not found." };
    }
    if (unitResult.error || !unitResult.data) {
      return { ok: false, error: "Unit not found." };
    }

    const { error: windowUpdateError } = await supabase
      .from("windows")
      .update({
        risk_flag: riskFlag,
        notes: notes.trim(),
        bracketed: true,
      })
      .eq("id", windowId);
    if (windowUpdateError) {
      return { ok: false, error: windowUpdateError.message };
    }

    let mediaId: string | undefined;
    let photoUrl: string | null = null;
    if (hasPhoto && photo instanceof File) {
      const ext =
        (photo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${unitId}/${roomId}/post-bracketing/${crypto.randomUUID()}.${ext}`;
      const buf = new Uint8Array(await photo.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buf, {
          contentType: photo.type || "image/jpeg",
          upsert: false,
        });
      if (uploadError) {
        return { ok: false, error: normalizeStorageError(uploadError.message) };
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);
      photoUrl = publicUrl;

      mediaId = `med-${crypto.randomUUID()}`;
      const { error: mediaError } = await supabase.from("media_uploads").insert({
        id: mediaId,
        storage_path: path,
        public_url: publicUrl,
        upload_kind: "window_measure",
        phase: "bracketing",
        stage: "bracketed_measured",
        unit_id: unitId,
        room_id: roomId,
        window_id: windowId,
        label: `${windowRow.label} — Post-bracketing`,
      });
      if (mediaError) {
        await supabase.storage.from(BUCKET).remove([path]);
        return { ok: false, error: mediaError.message };
      }
    }

    const capturedWindowLabel = windowRow.label;
    const capturedHasPhoto = hasPhoto;
    const prevStatus = (unitResult.data.status as UnitStatus | undefined) ?? "not_started";
    const unitStatus = await finalizeUnitMutation(supabase, unitId, [roomId]);
    const { actorRole, actorName } = await resolveFieldActor(unitResult.data.assigned_installer_name);
    after(async () => {
      const db = createAdminClient();
      await logUnitActivity(
        db,
        unitId,
        actorRole,
        actorName,
        capturedHasPhoto ? "post_bracketing_photo_added" : "bracketing_completed",
        { roomId, windowId, windowLabel: capturedWindowLabel, riskFlag, hasPhoto: capturedHasPhoto }
      );
      if (unitStatus !== prevStatus) {
        const schedulerId = await getSchedulerForUnit(db, unitId);
        if (schedulerId) {
          await emitUnitProgressNotification(db, schedulerId, unitId, unitStatus);
        }
      }
    });
    return {
      ok: true,
      unitStatus,
      roomId,
      windowId,
      mediaId,
      photoUrl,
      photoCountDelta: hasPhoto ? 1 : 0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function uploadWindowInstalledPhoto(
  formData: FormData
): Promise<UnitMutationResult> {
  try {
    const unitId = String(formData.get("unitId") ?? "");
    const roomId = String(formData.get("roomId") ?? "");
    const windowId = String(formData.get("windowId") ?? "");
    const notes = String(formData.get("notes") ?? "");
    const riskFlag = String(formData.get("riskFlag") ?? "green") as RiskFlag;
    const photo = formData.get("photo");
    const overrideBracketing = formData.get("overrideBracketing") === "true";

    if (!unitId || !roomId || !windowId) {
      return { ok: false, error: "Missing unit, room, or window." };
    }
    const isGreen = riskFlag === "green";
    const hasPhoto = photo instanceof File && photo.size > 0;

    if (!isGreen && !hasPhoto) {
      return { ok: false, error: "Installed photo is required for yellow or red risk." };
    }

    if (hasPhoto) {
      const photoValidation = validateIncomingImageFile(photo as File, {
        fieldLabel: "Installed photo",
      });
      if (photoValidation) return photoValidation;
    }
    if (riskFlag !== "green" && riskFlag !== "yellow" && riskFlag !== "red") {
      return { ok: false, error: "Invalid risk flag." };
    }
    if ((riskFlag === "yellow" || riskFlag === "red") && !notes.trim()) {
      return { ok: false, error: "Notes are required for yellow or red risk." };
    }

    const supabase = await createClient();
    const [roomResult, windowResult, unitResult] = await Promise.all([
      supabase.from("rooms").select("unit_id").eq("id", roomId).single(),
      supabase.from("windows").select("id, room_id, label, measured, bracketed, installed").eq("id", windowId).single(),
      supabase
        .from("units")
        .select("assigned_installer_name, status")
        .eq("id", unitId)
        .single(),
    ]);
    if (roomResult.error || !roomResult.data || roomResult.data.unit_id !== unitId) {
      return { ok: false, error: "Room does not belong to this unit." };
    }
    const windowRow = windowResult.data;
    if (windowResult.error || !windowRow || windowRow.room_id !== roomId) {
      return { ok: false, error: "Window not found." };
    }
    const unitRow = unitResult.data;
    if (unitResult.error || !unitRow) {
      return { ok: false, error: "Unit not found." };
    }
    // Allow override when installer confirms they did bracketing + installation together
    const overrideAllowed = overrideBracketing && unitRow.status === "measured";
    // This window is individually measured+bracketed — allow even if other windows in the unit aren't done yet
    const thisWindowReady = windowRow.measured && windowRow.bracketed;
    if (!canUploadInstallationPhotos(unitRow.status as UnitStatus) && !overrideAllowed && !thisWindowReady) {
      return {
        ok: false,
        error:
          "Measurements and bracketing must be completed for this window before installation can be marked complete.",
      };
    }

    const { error: windowUpdateError } = await supabase
      .from("windows")
      .update({
        risk_flag: riskFlag,
        notes: notes.trim(),
        ...(overrideAllowed ? { bracketed: true } : {}),
        installed: true,
      })
      .eq("id", windowId);
    if (windowUpdateError) {
      return { ok: false, error: windowUpdateError.message };
    }

    let mediaId: string | undefined;
    let photoUrl: string | null = null;
    if (hasPhoto && photo instanceof File) {
      const ext =
        (photo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${unitId}/${roomId}/installed/${crypto.randomUUID()}.${ext}`;
      const buf = new Uint8Array(await photo.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buf, {
          contentType: photo.type || "image/jpeg",
          upsert: false,
        });
      if (uploadError) {
        return { ok: false, error: normalizeStorageError(uploadError.message) };
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);
      photoUrl = publicUrl;

      mediaId = `med-${crypto.randomUUID()}`;
      const { error: mediaError } = await supabase.from("media_uploads").insert({
        id: mediaId,
        storage_path: path,
        public_url: publicUrl,
        upload_kind: "window_measure",
        phase: "installation",
        stage: "installed_pending_approval",
        unit_id: unitId,
        room_id: roomId,
        window_id: windowId,
        label: `${windowRow.label} — Installed`,
      });
      if (mediaError) {
        await supabase.storage.from(BUCKET).remove([path]);
        return { ok: false, error: mediaError.message };
      }
    }

    const capturedWindowLabel2 = windowRow.label;
    const capturedHasPhoto2 = hasPhoto;
    const prevStatus = (unitRow.status as UnitStatus | undefined) ?? "not_started";
    const unitStatus = await finalizeUnitMutation(supabase, unitId, [roomId]);
    const { actorRole, actorName } = await resolveFieldActor(unitRow.assigned_installer_name);
    after(async () => {
      const db = createAdminClient();
      await logUnitActivity(
        db,
        unitId,
        actorRole,
        actorName,
        capturedHasPhoto2 ? "installed_photo_added" : "installation_completed",
        { roomId, windowId, windowLabel: capturedWindowLabel2, riskFlag, hasPhoto: capturedHasPhoto2 }
      );
      if (unitStatus !== prevStatus) {
        const schedulerId = await getSchedulerForUnit(db, unitId);
        if (schedulerId) {
          await emitUnitProgressNotification(db, schedulerId, unitId, unitStatus);
        }
      }
    });
    return {
      ok: true,
      unitStatus,
      roomId,
      windowId,
      mediaId,
      photoUrl,
      photoCountDelta: hasPhoto ? 1 : 0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function markNotificationRead(
  notificationId: string,
  userRole: string,
  userId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("notification_reads").upsert(
      {
        notification_id: notificationId,
        user_role: userRole,
        user_id: userId,
        read_at: new Date().toISOString(),
      },
      { onConflict: "notification_id,user_role,user_id" }
    );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/installer/notifications");
    revalidatePath("/scheduler/notifications");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function markAllNotificationsRead(
  userRole: string,
  userId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    // Fetch all unread notification IDs for this recipient
    const { data: notifs } = await supabase
      .from("notifications")
      .select("id")
      .eq("recipient_role", userRole)
      .eq("recipient_id", userId);
    if (!notifs || notifs.length === 0) return { ok: true };

    const rows = notifs.map((n: { id: string }) => ({
      notification_id: n.id,
      user_role: userRole,
      user_id: userId,
      read_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("notification_reads")
      .upsert(rows, { onConflict: "notification_id,user_role,user_id" });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/installer/notifications");
    revalidatePath("/scheduler/notifications");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function uploadRoomFinishedPhotos(
  formData: FormData
): Promise<ActionResult> {
  try {
    const unitId = String(formData.get("unitId") ?? "");
    const roomId = String(formData.get("roomId") ?? "");
    const files = formData
      .getAll("photos")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!unitId || !roomId) {
      return { ok: false, error: "Missing unit or room" };
    }
    if (files.length === 0) {
      return { ok: false, error: "Add at least one photo" };
    }
    if (files.length > 3) {
      return { ok: false, error: "Maximum 3 photos allowed" };
    }
    for (const file of files) {
      const validation = validateIncomingImageFile(file, { fieldLabel: "Photo" });
      if (validation) return validation;
    }

    const supabase = await createClient();

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id")
      .eq("id", roomId)
      .eq("unit_id", unitId)
      .single();

    if (roomError || !room) {
      return { ok: false, error: "Room not found" };
    }

    const uploadedPaths: string[] = [];
    const mediaIds: string[] = [];

    for (const [index, file] of files.entries()) {
      const ext =
        (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${unitId}/rooms/${roomId}/finished/${crypto.randomUUID()}.${ext}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buf, { contentType: file.type || "image/jpeg", upsert: false });

      if (uploadError) {
        if (mediaIds.length > 0) {
          await supabase.from("media_uploads").delete().in("id", mediaIds);
        }
        if (uploadedPaths.length > 0) {
          await supabase.storage.from(BUCKET).remove(uploadedPaths);
        }
        return { ok: false, error: normalizeStorageError(uploadError.message) };
      }

      uploadedPaths.push(path);

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const mediaId = `med-${crypto.randomUUID()}`;
      const label =
        files.length === 1
          ? "Finished room"
          : `Finished room (${index + 1}/${files.length})`;
      const { error: mediaInsertError } = await supabase.from("media_uploads").insert({
        id: mediaId,
        storage_path: path,
        public_url: publicUrl,
        upload_kind: "room_finished_photo",
        unit_id: unitId,
        room_id: roomId,
        label,
        stage: "installed_pending_approval",
        phase: "installation",
      });

      if (mediaInsertError) {
        if (mediaIds.length > 0) {
          await supabase.from("media_uploads").delete().in("id", mediaIds);
        }
        await supabase.storage.from(BUCKET).remove(uploadedPaths);
        return { ok: false, error: mediaInsertError.message };
      }

      mediaIds.push(mediaId);
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

/**
 * Delete a window media item (installed or bracketing photo) and reset the
 * corresponding window stage flag so the installer can re-upload.
 */
export async function deleteWindowMediaItem(
  mediaId: string,
  windowId: string,
  stage: "bracketed_measured" | "installed_pending_approval"
): Promise<UnitMutationResult> {
  try {
    const supabase = await createClient();

    // Fetch the media record to get the storage path and unit
    const { data: media, error: fetchErr } = await supabase
      .from("media_uploads")
      .select("storage_path, unit_id, room_id")
      .eq("id", mediaId)
      .single();
    if (fetchErr || !media) {
      return { ok: false, error: "Media item not found." };
    }

    // Delete from storage
    if (media.storage_path) {
      await supabase.storage.from(BUCKET).remove([media.storage_path]);
    }

    // Delete from DB
    const { error: delErr } = await supabase
      .from("media_uploads")
      .delete()
      .eq("id", mediaId);
    if (delErr) return { ok: false, error: delErr.message };

    // Reset the window stage flag so installer can re-upload
    const updates =
      stage === "bracketed_measured"
        ? { bracketed: false, installed: false }
        : { installed: false };
    const { error: flagResetError } = await supabase
      .from("windows")
      .update(updates)
      .eq("id", windowId);
    if (flagResetError) return { ok: false, error: flagResetError.message };

    const capturedUnitId = media.unit_id;
    const unitStatus = await finalizeUnitMutation(
      supabase,
      capturedUnitId,
      media.room_id ? [media.room_id] : []
    );

    return {
      ok: true,
      unitStatus,
      roomId: media.room_id ?? undefined,
      windowId,
      photoCountDelta: -1,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

/**
 * Undo a window stage completion flag.
 * - Undo "measured": resets measured + installed (cascade)
 * - Undo "bracketed": resets bracketed + installed (cascade)
 * - Undo "installed": resets installed only
 */
export async function undoWindowStage(
  windowId: string,
  stage: "measured" | "bracketed" | "installed"
): Promise<UnitMutationResult> {
  try {
    const supabase = await createClient();

    // Look up the window to get its room, then the room to get unit_id
    const { data: win, error: winErr } = await supabase
      .from("windows")
      .select("room_id")
      .eq("id", windowId)
      .single();
    if (winErr || !win) return { ok: false, error: "Window not found." };

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("unit_id")
      .eq("id", win.room_id)
      .single();
    if (roomErr || !room) return { ok: false, error: "Room not found." };

    const updates: Record<string, boolean> =
      stage === "measured"
        ? { measured: false, installed: false }
        : stage === "bracketed"
          ? { bracketed: false, installed: false }
          : { installed: false };

    const { error: updateErr } = await supabase
      .from("windows")
      .update(updates)
      .eq("id", windowId);
    if (updateErr) return { ok: false, error: updateErr.message };

    const capturedUnitId = room.unit_id;
    const unitStatus = await finalizeUnitMutation(supabase, capturedUnitId, [win.room_id]);

    return {
      ok: true,
      unitStatus,
      roomId: win.room_id,
      windowId,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

/**
 * Delete a room finished photo from storage and the media_uploads table.
 */
export async function deleteRoomFinishedPhoto(
  mediaId: string,
  unitId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: media, error: fetchErr } = await supabase
      .from("media_uploads")
      .select("storage_path")
      .eq("id", mediaId)
      .single();
    if (fetchErr || !media) {
      return { ok: false, error: "Media item not found." };
    }

    if (media.storage_path) {
      await supabase.storage.from(BUCKET).remove([media.storage_path]);
    }

    const { error: delErr } = await supabase
      .from("media_uploads")
      .delete()
      .eq("id", mediaId);
    if (delErr) return { ok: false, error: delErr.message };

    const capturedUnitId = unitId;
    after(async () => {
      const db = createAdminClient();
      await refreshUnitAggregates(db, capturedUnitId);
      await recomputeUnitStatus(db, capturedUnitId);
      revalidateUnit(capturedUnitId);
    });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

/**
 * Delete a window measurement photo, clearing photo_url and resetting measured flag.
 */
export async function deleteWindowMeasurementPhoto(
  windowId: string,
  unitId: string
): Promise<UnitMutationResult> {
  try {
    const supabase = await createClient();

    const { data: winRow, error: winErr } = await supabase
      .from("windows")
      .select("room_id")
      .eq("id", windowId)
      .single();
    if (winErr || !winRow) {
      return { ok: false, error: "Window not found." };
    }

    // Find the measurement media record for this window
    const { data: media } = await supabase
      .from("media_uploads")
      .select("id, storage_path")
      .eq("window_id", windowId)
      .eq("stage", "scheduled_bracketing")
      .maybeSingle();

    if (media?.storage_path) {
      await supabase.storage.from(BUCKET).remove([media.storage_path]);
    }
    if (media?.id) {
      await supabase.from("media_uploads").delete().eq("id", media.id);
    }

    // Clear photo_url and reset measured flag on the window
    const { error: windowUpdateError } = await supabase
      .from("windows")
      .update({ photo_url: null, measured: false, installed: false })
      .eq("id", windowId);
    if (windowUpdateError) {
      return { ok: false, error: windowUpdateError.message };
    }

    const unitStatus = await finalizeUnitMutation(supabase, unitId, [winRow.room_id]);

    return {
      ok: true,
      unitStatus,
      roomId: winRow.room_id,
      windowId,
      photoCountDelta: media?.id ? -1 : 0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}
