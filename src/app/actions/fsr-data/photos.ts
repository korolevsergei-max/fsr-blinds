"use server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { UNIT_PHOTO_STAGES, type RiskFlag, type UnitPhotoStage, type UnitStatus } from "@/lib/types";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { recomputeUnitStatus } from "@/lib/unit-progress";
import { canUploadInstallationPhotos } from "@/lib/unit-install-guard";
import { BUCKET, MAX_PHOTOS_PER_STAGE, type ActionResult, type UnitMutationResult, normalizeStorageError, validateIncomingImageFile, revalidateUnit, getPhaseForStage, countWindowStagePhotos, formatStagePhotoLabel, emitUnitProgressNotification, refreshUnitAggregates, finalizeUnitMutation, logUnitActivity, resolveFieldActor, getSchedulerForUnit } from "./_shared";

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

    const { actorRole, actorName, actorUserId } = await resolveFieldActor(unitResult.data.assigned_installer_name);

    let mediaId: string | undefined;
    let photoUrl: string | null = null;
    if (hasPhoto && photo instanceof File) {
      const existingCount = await countWindowStagePhotos(supabase, windowId, "bracketed_measured");
      if (existingCount >= MAX_PHOTOS_PER_STAGE) {
        return { ok: false, error: `Maximum of ${MAX_PHOTOS_PER_STAGE} photos per stage allowed.` };
      }

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
        uploaded_by_user_id: actorUserId,
        uploaded_by_name: actorName,
        uploaded_by_role: actorRole,
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

    const { actorRole, actorName, actorUserId } = await resolveFieldActor(unitRow.assigned_installer_name);

    let mediaId: string | undefined;
    let photoUrl: string | null = null;
    if (hasPhoto && photo instanceof File) {
      const existingCount = await countWindowStagePhotos(supabase, windowId, "installed_pending_approval");
      if (existingCount >= MAX_PHOTOS_PER_STAGE) {
        return { ok: false, error: `Maximum of ${MAX_PHOTOS_PER_STAGE} photos per stage allowed.` };
      }

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
        uploaded_by_user_id: actorUserId,
        uploaded_by_name: actorName,
        uploaded_by_role: actorRole,
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

export async function deleteWindowStagePhoto(
  mediaId: string,
  unitId: string
): Promise<ActionResult> {
  try {
    if (!mediaId || !unitId) return { ok: false, error: "Missing required fields." };

    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const supabase = await createClient();

    // Fetch the media record and verify it belongs to this unit.
    const { data: mediaRow, error: fetchError } = await supabase
      .from("media_uploads")
      .select("id, storage_path, unit_id, uploaded_by_user_id")
      .eq("id", mediaId)
      .single();

    if (fetchError || !mediaRow) return { ok: false, error: "Photo not found." };
    if (mediaRow.unit_id !== unitId) return { ok: false, error: "Photo does not belong to this unit." };

    // Permission: owners and schedulers can delete any photo; installers can only delete their own.
    if (user.role === "installer" && mediaRow.uploaded_by_user_id !== user.id) {
      return { ok: false, error: "You can only delete photos you uploaded." };
    }

    // Delete from storage first.
    if (mediaRow.storage_path) {
      await supabase.storage.from(BUCKET).remove([mediaRow.storage_path]);
    }

    // Delete the DB record.
    const { error: deleteError } = await supabase
      .from("media_uploads")
      .delete()
      .eq("id", mediaId);

    if (deleteError) return { ok: false, error: deleteError.message };

    revalidateUnit(unitId);
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

export type RoomQuickPhotosResult =
  | { ok: true; photos: UnitStageMediaItem[] }
  | { ok: false; error: string };

/**
 * Upload one or more room-level "quick" photos. These are a fast photo pile for the
 * field (installers/schedulers) that attach to a room — never a specific window — and
 * deliberately do NOT touch window status (measured/bracketed/installed). They are kept
 * isolated under the `room_quick_photo` kind with `window_id = null`, so they are ignored
 * by the unit evidence viewer/summary (see src/lib/unit-media.ts) and surface only in the
 * unit "View / Add Photos" popup. Uncapped.
 */
export async function uploadRoomQuickPhotos(
  formData: FormData
): Promise<RoomQuickPhotosResult> {
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
    for (const file of files) {
      const validation = validateIncomingImageFile(file, { fieldLabel: "Photo" });
      if (validation) return validation;
    }

    const supabase = await createClient();

    const [roomResult, unitResult] = await Promise.all([
      supabase
        .from("rooms")
        .select("id, name")
        .eq("id", roomId)
        .eq("unit_id", unitId)
        .single(),
      supabase
        .from("units")
        .select("assigned_installer_name")
        .eq("id", unitId)
        .single(),
    ]);

    if (roomResult.error || !roomResult.data) {
      return { ok: false, error: "Room not found" };
    }
    const roomName = roomResult.data.name ?? null;

    const { actorRole, actorName, actorUserId } = await resolveFieldActor(
      unitResult.data?.assigned_installer_name
    );

    const uploadedPaths: string[] = [];
    const mediaIds: string[] = [];
    const photos: UnitStageMediaItem[] = [];

    for (const [index, file] of files.entries()) {
      const ext =
        (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${unitId}/rooms/${roomId}/quick/${crypto.randomUUID()}.${ext}`;
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
        files.length === 1 ? "Room photo" : `Room photo (${index + 1}/${files.length})`;
      const createdAt = new Date().toISOString();
      const { error: mediaInsertError } = await supabase.from("media_uploads").insert({
        id: mediaId,
        storage_path: path,
        public_url: publicUrl,
        upload_kind: "room_quick_photo",
        unit_id: unitId,
        room_id: roomId,
        window_id: null,
        label,
        stage: null,
        phase: null,
        created_at: createdAt,
        uploaded_by_user_id: actorUserId,
        uploaded_by_name: actorName,
        uploaded_by_role: actorRole,
      });

      if (mediaInsertError) {
        if (mediaIds.length > 0) {
          await supabase.from("media_uploads").delete().in("id", mediaIds);
        }
        await supabase.storage.from(BUCKET).remove(uploadedPaths);
        return { ok: false, error: mediaInsertError.message };
      }

      mediaIds.push(mediaId);
      photos.push({
        id: mediaId,
        publicUrl,
        label,
        unitId,
        roomId,
        roomName,
        windowId: null,
        windowLabel: null,
        uploadKind: "room_quick_photo",
        // Stage is inert for quick photos (filtered by uploadKind); use the value
        // loadUnitStageMedia would normalize a null stage to, so a refetch matches.
        stage: "bracketed_measured",
        createdAt,
        uploadedByUserId: actorUserId,
        uploadedByName: actorName,
        uploadedByRole: actorRole,
      });
    }

    revalidateUnit(unitId);
    return { ok: true, photos };
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
