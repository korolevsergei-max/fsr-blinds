"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerOrScheduler, getLinkedSchedulerId } from "@/lib/auth";
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
): ActionResult | null {
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

function revalidateApp() {
  revalidatePath("/management", "layout");
  revalidatePath("/scheduler", "layout");
  revalidatePath("/installer", "layout");
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

async function refreshRoomAggregates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roomId: string
) {
  const { count: wc } = await supabase
    .from("windows")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);
  const { count: mc } = await supabase
    .from("windows")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("measured", true);
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
  const { count: mediaCount } = await supabase
    .from("media_uploads")
    .select("*", { count: "exact", head: true })
    .eq("unit_id", unitId);
  photoTotal = mediaCount ?? 0;
  const { count: rc } = await supabase
    .from("rooms")
    .select("*", { count: "exact", head: true })
    .eq("unit_id", unitId);
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
      patch.assigned_installer_name = instName;

      if (installerId.startsWith("sch-")) {
        const schedulerId = installerId.replace("sch-", "");
        patch.assigned_installer_id = null; // Schedulers don't go in the installers FK column

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
      } else {
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
      .select("id, unit_number, building_name, client_name")
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
            status: "not_started",
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
            status: "not_started",
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
            status: "not_started",
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

    revalidateApp();
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
        }
      | null
      | undefined;

    const ensureUnitMeta = async () => {
      if (unitMeta !== undefined) return unitMeta;
      const { data } = await supabase
        .from("units")
        .select("unit_number, building_name, client_name")
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
      patch.assigned_installer_name = installerName;

      if (installerId.startsWith("sch-")) {
        const schedulerId = installerId.replace("sch-", "");
        patch.assigned_installer_id = null; // FK constraint

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
      } else {
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
            owner_user_id: owner.id,
            owner_name: owner.displayName,
          })
          .eq("id", existingMeasurement.id);
      } else {
        const nextUnitMeta = await ensureUnitMeta();
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
          status: "not_started",
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
            owner_user_id: owner.id,
            owner_name: owner.displayName,
          })
          .eq("id", existingBracketing.id);
      } else {
        const nextUnitMeta = await ensureUnitMeta();
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
          status: "not_started",
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
            owner_user_id: owner.id,
            owner_name: owner.displayName,
          })
          .eq("id", existingInstallation.id);
      } else {
        const nextUnitMeta = await ensureUnitMeta();

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
          status: "not_started",
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

    revalidateApp();
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
    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function createRoomsForUnit(
  unitId: string,
  names: string[]
): Promise<ActionResult> {
  try {
    if (names.length === 0) {
      return { ok: true };
    }
    const supabase = await createClient();
    const rows = names.map((name) => ({
      id: `room-${crypto.randomUUID()}`,
      unit_id: unitId,
      name: name.trim(),
      window_count: 0,
      completed_windows: 0,
    }));
    const { error } = await supabase.from("rooms").insert(rows);
    if (error) {
      return { ok: false, error: error.message };
    }
    await refreshUnitAggregates(supabase, unitId);
    revalidateApp();
    return { ok: true };
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

    revalidateApp();
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
    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function createWindowWithPhoto(
  formData: FormData
): Promise<ActionResult> {
  try {
    const unitId = String(formData.get("unitId") ?? "");
    const roomId = String(formData.get("roomId") ?? "");
    const label = String(formData.get("label") ?? "").trim();
    const blindType = String(formData.get("blindType") ?? "") as BlindType;
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
    const { data: room, error: re } = await supabase
      .from("rooms")
      .select("unit_id")
      .eq("id", roomId)
      .single();
    if (re || !room || room.unit_id !== unitId) {
      return { ok: false, error: "Room does not belong to this unit" };
    }

    // Measurements should appear in the bracketed or installed photo stage.
    const uploadStage = getStageForWindowUpload();
    const uploadPhase = getPhaseForStage(uploadStage);

    let publicUrl: string | null = null;
    let storagePath: string | null = null;

    if (hasPhoto && file instanceof File) {
      const ext =
        (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "jpg";
      const path = `${unitId}/${roomId}/${crypto.randomUUID()}.${ext}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buf, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (upErr) {
        return { ok: false, error: normalizeStorageError(upErr.message) };
      }

      const {
        data: { publicUrl: url },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);
      publicUrl = url;
      storagePath = path;
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
      .select("assigned_installer_name")
      .eq("id", unitId)
      .single();
    await logUnitActivity(
      supabase,
      unitId,
      "installer",
      unit?.assigned_installer_name ?? "Installer",
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

    await refreshRoomAggregates(supabase, roomId);
    await refreshUnitAggregates(supabase, unitId);
    await recomputeUnitStatus(supabase, unitId);
    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function updateWindowWithOptionalPhoto(
  formData: FormData
): Promise<ActionResult> {
  try {
    const windowId = String(formData.get("windowId") ?? "");
    const unitId = String(formData.get("unitId") ?? "");
    const roomId = String(formData.get("roomId") ?? "");
    const label = String(formData.get("label") ?? "").trim();
    const blindType = String(formData.get("blindType") ?? "") as BlindType;
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
    const { data: win, error: we } = await supabase
      .from("windows")
      .select("id, room_id")
      .eq("id", windowId)
      .single();
    if (we || !win || win.room_id !== roomId) {
      return { ok: false, error: "Window not found" };
    }
    const { data: room, error: re } = await supabase
      .from("rooms")
      .select("unit_id")
      .eq("id", roomId)
      .single();
    if (re || !room || room.unit_id !== unitId) {
      return { ok: false, error: "Invalid room" };
    }

    // Measurements should appear in the bracketed or installed photo stage.
    const uploadStage = getStageForWindowUpload();
    const uploadPhase = getPhaseForStage(uploadStage);

    let publicUrl: string | undefined;
    let storagePath: string | undefined;
    if (file instanceof File && file.size > 0) {
      const ext =
        (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "jpg";
      const path = `${unitId}/${roomId}/${crypto.randomUUID()}.${ext}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buf, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (upErr) {
        return { ok: false, error: normalizeStorageError(upErr.message) };
      }
      const {
        data: { publicUrl: url },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);
      publicUrl = url;
      storagePath = path;
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
      await supabase.from("media_uploads").insert({
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
    }

    const { data: unit } = await supabase
      .from("units")
      .select("assigned_installer_name")
      .eq("id", unitId)
      .single();
    await logUnitActivity(
      supabase,
      unitId,
      "installer",
      unit?.assigned_installer_name ?? "Installer",
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

    await refreshRoomAggregates(supabase, roomId);
    await refreshUnitAggregates(supabase, unitId);
    await recomputeUnitStatus(supabase, unitId);
    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function uploadWindowPostBracketingPhoto(
  formData: FormData
): Promise<ActionResult> {
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
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("unit_id")
      .eq("id", roomId)
      .single();
    if (roomError || !room || room.unit_id !== unitId) {
      return { ok: false, error: "Room does not belong to this unit." };
    }

    const { data: windowRow, error: windowError } = await supabase
      .from("windows")
      .select("id, room_id, label")
      .eq("id", windowId)
      .single();
    if (windowError || !windowRow || windowRow.room_id !== roomId) {
      return { ok: false, error: "Window not found." };
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

      const { error: mediaError } = await supabase.from("media_uploads").insert({
        id: `med-${crypto.randomUUID()}`,
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

    const { data: unit } = await supabase
      .from("units")
      .select("assigned_installer_name")
      .eq("id", unitId)
      .single();

    await logUnitActivity(
      supabase,
      unitId,
      "installer",
      unit?.assigned_installer_name ?? "Installer",
      hasPhoto ? "post_bracketing_photo_added" : "bracketing_completed",
      { roomId, windowId, windowLabel: windowRow.label, riskFlag, hasPhoto }
    );
    await refreshUnitAggregates(supabase, unitId);
    await recomputeUnitStatus(supabase, unitId);
    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function uploadWindowInstalledPhoto(
  formData: FormData
): Promise<ActionResult> {
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
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("unit_id")
      .eq("id", roomId)
      .single();
    if (roomError || !room || room.unit_id !== unitId) {
      return { ok: false, error: "Room does not belong to this unit." };
    }

    const { data: windowRow, error: windowError } = await supabase
      .from("windows")
      .select("id, room_id, label")
      .eq("id", windowId)
      .single();
    if (windowError || !windowRow || windowRow.room_id !== roomId) {
      return { ok: false, error: "Window not found." };
    }

    const { data: unitRow, error: unitStatusError } = await supabase
      .from("units")
      .select("status")
      .eq("id", unitId)
      .single();
    if (unitStatusError || !unitRow) {
      return { ok: false, error: "Unit not found." };
    }
    if (!canUploadInstallationPhotos(unitRow.status as UnitStatus)) {
      return {
        ok: false,
        error:
          "Both measurements and bracketing photos must be completed for every window before installation photos can be uploaded.",
      };
    }

    const { error: windowUpdateError } = await supabase
      .from("windows")
      .update({
        risk_flag: riskFlag,
        notes: notes.trim(),
        installed: true,
      })
      .eq("id", windowId);
    if (windowUpdateError) {
      return { ok: false, error: windowUpdateError.message };
    }

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

      const { error: mediaError } = await supabase.from("media_uploads").insert({
        id: `med-${crypto.randomUUID()}`,
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

    const { data: unit } = await supabase
      .from("units")
      .select("assigned_installer_name")
      .eq("id", unitId)
      .single();

    await refreshUnitAggregates(supabase, unitId);
    await logUnitActivity(
      supabase,
      unitId,
      "installer",
      unit?.assigned_installer_name ?? "Installer",
      hasPhoto ? "installed_photo_added" : "installation_completed",
      { roomId, windowId, windowLabel: windowRow.label, riskFlag, hasPhoto }
    );
    await recomputeUnitStatus(supabase, unitId);
    revalidateApp();
    return { ok: true };
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
    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}
