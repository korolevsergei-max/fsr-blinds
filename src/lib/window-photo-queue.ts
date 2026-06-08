"use client";

/**
 * Background handler for queued installer window-stage photo uploads (post-bracketing / installed).
 *
 * Runs the full B1 direct-to-storage flow at *processing* time so each retry re-mints a fresh
 * signed-upload token (avoiding token expiry for items that sit in the queue while offline):
 *   mint signed URL → upload bytes straight to storage → record the DB row.
 * Falls back to sending the File through the record action if the direct upload can't complete.
 *
 * On success it reconciles the module-level media gallery cache directly (swaps the optimistic
 * temp item for the real one); the dataset-store status/flag reconciliation is handled separately
 * by <UploadReconciler/> via the queue's resolution events.
 */

import {
  createWindowPhotoUploadUrl,
  uploadWindowInstalledPhoto,
  uploadWindowPostBracketingPhoto,
} from "@/app/actions/fsr-data";
import { uploadViaSignedUrl } from "@/lib/direct-upload";
import {
  removeUnitStageMediaItem,
  upsertUnitStageMediaItem,
} from "@/lib/use-unit-supplemental";
import type { UnitStageMediaItem } from "@/lib/server-data";
import type { UploadHandlerResult } from "@/lib/upload-queue";

/** Registered name used by the forms and register-upload-actions.ts. */
export const WINDOW_PHOTO_UPLOAD_ACTION = "window-photo-upload";

type WindowPhotoStage = "bracketed_measured" | "installed_pending_approval";

function isWindowPhotoStage(value: string): value is WindowPhotoStage {
  return value === "bracketed_measured" || value === "installed_pending_approval";
}

export async function runWindowPhotoUpload(fd: FormData): Promise<UploadHandlerResult> {
  const unitId = String(fd.get("unitId") ?? "");
  const roomId = String(fd.get("roomId") ?? "");
  const windowId = String(fd.get("windowId") ?? "");
  const stageRaw = String(fd.get("stage") ?? "");
  const riskFlag = String(fd.get("riskFlag") ?? "green");
  const notes = String(fd.get("notes") ?? "");
  const overrideBracketing = String(fd.get("overrideBracketing") ?? "");
  const tempMediaId = String(fd.get("tempMediaId") ?? "");
  const roomName = String(fd.get("roomName") ?? "");
  const windowLabel = String(fd.get("windowLabel") ?? "");
  const mediaLabel = String(fd.get("mediaLabel") ?? "");
  const photo = fd.get("photo");

  if (!unitId || !roomId || !windowId || !isWindowPhotoStage(stageRaw)) {
    return { ok: false, error: "Invalid upload — missing unit, room, window, or stage." };
  }
  const stage: WindowPhotoStage = stageRaw;

  // Build the record action's FormData. Either a direct-upload storagePath or the legacy photo File.
  const recordFd = new FormData();
  recordFd.set("unitId", unitId);
  recordFd.set("roomId", roomId);
  recordFd.set("windowId", windowId);
  recordFd.set("riskFlag", riskFlag);
  recordFd.set("notes", notes);
  if (overrideBracketing === "true") recordFd.set("overrideBracketing", "true");

  const hasPhoto = photo instanceof File && photo.size > 0;
  if (hasPhoto) {
    const file = photo as File;
    let storagePath: string | null = null;
    const mint = await createWindowPhotoUploadUrl({
      unitId,
      roomId,
      windowId,
      stage,
      contentType: file.type,
      fileName: file.name,
      size: file.size,
    });
    if (mint.ok) {
      const uploaded = await uploadViaSignedUrl(
        mint.bucket,
        { path: mint.path, token: mint.token },
        file
      );
      if (uploaded.ok) storagePath = mint.path;
    }
    if (storagePath) recordFd.set("storagePath", storagePath);
    else recordFd.set("photo", file, file.name);
  }

  const recordAction =
    stage === "installed_pending_approval"
      ? uploadWindowInstalledPhoto
      : uploadWindowPostBracketingPhoto;

  const result = await recordAction(recordFd);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // Reconcile the gallery: swap the optimistic temp item for the recorded one.
  if (result.mediaId && result.photoUrl) {
    const realItem: UnitStageMediaItem = {
      id: result.mediaId,
      publicUrl: result.photoUrl,
      label: mediaLabel || null,
      unitId,
      roomId,
      roomName: roomName || null,
      windowId,
      windowLabel: windowLabel || null,
      uploadKind: "window_measure",
      stage,
      createdAt: new Date().toISOString(),
      uploadedByUserId: null,
      uploadedByName: null,
      uploadedByRole: null,
    };
    upsertUnitStageMediaItem(unitId, realItem);
  }
  if (tempMediaId) {
    removeUnitStageMediaItem(unitId, tempMediaId);
  }

  return {
    ok: true,
    result: {
      mediaId: result.mediaId,
      photoUrl: result.photoUrl ?? null,
      unitStatus: result.unitStatus,
    },
  };
}
