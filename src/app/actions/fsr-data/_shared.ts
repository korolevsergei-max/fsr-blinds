import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLinkedSchedulerId, getCurrentUser, type AppUser } from "@/lib/auth";
import { isSchedulerScopedUnit } from "@/lib/scheduler-scope";
import { UNIT_PHOTO_STAGE_LABELS, type RiskFlag, type UnitPhotoStage, type UnitStatus } from "@/lib/types";
import { recomputeUnitStatus } from "@/lib/unit-progress";
import { emitNotification } from "@/lib/emit-notification";
import { buildUnitProgressNotificationBody, buildWindowEscalationNotificationBody, type UnitNotificationContext } from "@/lib/notification-copy";
import { NOTIF_UNIT_ESCALATION, NOTIF_UNIT_PROGRESS_UPDATE } from "@/lib/notification-types";
import { revalidateUnitRoutes } from "@/app/actions/revalidation";

export const BUCKET = "fsr-media";
export const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB hard safety cap

/** For scheduler callers: unit must match `loadSchedulerDataset` scope (assignments or team installer). */
export async function assertSchedulerUnitScope(
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

export function normalizeStorageError(message: string): string {
  if (/bucket not found/i.test(message)) {
    return `Storage bucket "${BUCKET}" is missing. Run supabase/migrations/20250322140000_storage_and_media.sql in Supabase SQL Editor, then retry.`;
  }
  return message;
}

export function validateIncomingImageFile(
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


/**
 * Targeted revalidation for unit-specific mutations (window/room CRUD, photos, status).
 * Only invalidates the affected unit's pages + the list pages that show unit counts/status.
 * Much cheaper than revalidateApp() which busts the entire layout cache.
 */
export function revalidateUnit(unitId: string) {
  revalidateUnitRoutes(unitId);
}

export function getPhaseForStage(stage: UnitPhotoStage): "bracketing" | "installation" {
  return stage === "installed_pending_approval" ? "installation" : "bracketing";
}

export function getStageForWindowUpload(): UnitPhotoStage {
  // Measurement/creation photos are always "before" photos (pre-bracket stage).
  return "scheduled_bracketing";
}

// --- Direct-to-storage upload helpers (signed upload URLs) ---
// The SERVER owns the storage path namespace; the client never chooses a path.

/** Storage subfolder for a window stage photo. */
export function windowPhotoStageDir(
  stage: "bracketed_measured" | "installed_pending_approval"
): string {
  return stage === "installed_pending_approval" ? "installed" : "post-bracketing";
}

/** Derives a safe file extension from the declared contentType (falling back to the file name). */
export function extFromUpload(
  contentType?: string | null,
  fileName?: string | null
): string {
  switch (contentType) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
  }
  const fromName = (fileName?.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return fromName || "jpg";
}

/** Server-built storage path for a window stage photo. */
export function buildWindowPhotoPath(
  unitId: string,
  roomId: string,
  stage: "bracketed_measured" | "installed_pending_approval",
  ext: string
): string {
  return `${unitId}/${roomId}/${windowPhotoStageDir(stage)}/${crypto.randomUUID()}.${ext}`;
}

/** Validates a client-supplied storage path stays within the unit/room/stage namespace. */
export function isWithinWindowPhotoNamespace(
  path: string,
  unitId: string,
  roomId: string,
  stage: "bracketed_measured" | "installed_pending_approval"
): boolean {
  const prefix = `${unitId}/${roomId}/${windowPhotoStageDir(stage)}/`;
  return path.startsWith(prefix) && !path.includes("..");
}

/** Server-built storage path for a room "finished" photo. */
export function buildRoomFinishedPath(unitId: string, roomId: string, ext: string): string {
  return `${unitId}/rooms/${roomId}/finished/${crypto.randomUUID()}.${ext}`;
}

export function isWithinRoomFinishedNamespace(
  path: string,
  unitId: string,
  roomId: string
): boolean {
  const prefix = `${unitId}/rooms/${roomId}/finished/`;
  return path.startsWith(prefix) && !path.includes("..");
}

/**
 * Validates declared file metadata for a direct-to-storage upload. The bytes are NOT on the
 * server when a signed upload URL is minted, so we validate the declared contentType + size,
 * mirroring validateIncomingImageFile's semantics.
 */
export function validateDeclaredImageUpload(
  { contentType, size }: { contentType?: string | null; size?: number | null },
  {
    fieldLabel = "Image",
    maxBytes = MAX_IMAGE_UPLOAD_BYTES,
  }: { fieldLabel?: string; maxBytes?: number } = {}
): { ok: false; error: string } | null {
  if (!size || size <= 0) {
    return { ok: false, error: `${fieldLabel} is required.` };
  }
  if (!contentType || !contentType.startsWith("image/")) {
    return { ok: false, error: `${fieldLabel} must be an image file.` };
  }
  if (size > maxBytes) {
    return {
      ok: false,
      error: `${fieldLabel} is too large. Please upload an image under ${Math.round(maxBytes / (1024 * 1024))}MB.`,
    };
  }
  return null;
}

export const MAX_PHOTOS_PER_STAGE = 3;

export async function countWindowStagePhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  windowId: string,
  stage: string
): Promise<number> {
  const { count } = await supabase
    .from("media_uploads")
    .select("id", { count: "exact", head: true })
    .eq("window_id", windowId)
    .eq("stage", stage);
  return count ?? 0;
}

export function formatStagePhotoLabel(
  stage: UnitPhotoStage,
  customLabel: string,
  index: number,
  total: number
): string {
  const base = customLabel.trim() || UNIT_PHOTO_STAGE_LABELS[stage];
  return total > 1 ? `${base} ${index + 1}` : base;
}

export const PROGRESS_TITLES: Partial<Record<UnitStatus, string>> = {
  measured: "All windows measured",
  bracketed: "All windows bracketed",
  manufactured: "All blinds manufactured",
  installed: "All windows installed",
};

export type AdminClient = ReturnType<typeof createAdminClient>;

export async function loadUnitNotificationContext(
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

export async function emitUnitProgressNotification(
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

export async function emitWindowEscalationNotification(
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

export async function refreshRoomAggregates(
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

export async function refreshUnitAggregates(
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

export type UnitMutationSuccess = {
  ok: true;
  unitStatus: UnitStatus;
  roomId?: string;
  windowId?: string;
  mediaId?: string;
  photoUrl?: string | null;
  photoCountDelta?: number;
};

export type UnitMutationResult = UnitMutationSuccess | { ok: false; error: string };

export async function finalizeUnitMutation(
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

export async function resolveInstallerName(
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
export async function syncCoordinatorAssignmentForInstaller(
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

export async function logUnitActivity(
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
export async function resolveFieldActor(
  unitInstallerName: string | null | undefined
): Promise<{ actorRole: string; actorName: string; actorUserId: string | null }> {
  const user = await getCurrentUser();
  if (user?.role === "owner") {
    return { actorRole: "owner", actorName: user.displayName, actorUserId: user.id };
  }
  if (user?.role === "scheduler") {
    return { actorRole: "scheduler", actorName: user.displayName, actorUserId: user.id };
  }
  return {
    actorRole: "installer",
    actorName: user?.displayName ?? unitInstallerName ?? "Installer",
    actorUserId: user?.id ?? null,
  };
}

/** Looks up the scheduler_id responsible for a unit (from scheduler_unit_assignments). Returns null if unassigned. */
export async function getSchedulerForUnit(
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

/**
 * Recomputes units.all_measured_at after a window measurement is saved.
 * Sets to NOW() if every window in the unit has width+height; clears to NULL otherwise.
 */
export async function recomputeAllMeasuredAt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string
): Promise<void> {
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id")
    .eq("unit_id", unitId);
  if (!rooms || rooms.length === 0) {
    await supabase.from("units").update({ all_measured_at: null }).eq("id", unitId);
    return;
  }
  const roomIds = rooms.map((r) => r.id as string);

  const { data: anyWindow } = await supabase
    .from("windows")
    .select("id")
    .in("room_id", roomIds)
    .limit(1);
  if (!anyWindow || anyWindow.length === 0) {
    await supabase.from("units").update({ all_measured_at: null }).eq("id", unitId);
    return;
  }

  const { data: unmeasured } = await supabase
    .from("windows")
    .select("id")
    .in("room_id", roomIds)
    .or("width.is.null,height.is.null")
    .limit(1);
  const allMeasured = !unmeasured || unmeasured.length === 0;
  await supabase
    .from("units")
    .update({ all_measured_at: allMeasured ? new Date().toISOString() : null })
    .eq("id", unitId);
}
