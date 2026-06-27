"use server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { type BlindType, type RiskFlag, type UnitStatus } from "@/lib/types";
import { reflowManufacturingSchedules } from "@/lib/manufacturing-scheduler";
import { BUCKET, MAX_PHOTOS_PER_STAGE, type ActionResult, type UnitMutationResult, normalizeStorageError, validateIncomingImageFile, getPhaseForStage, getStageForWindowUpload, countWindowStagePhotos, emitUnitProgressNotification, emitWindowEscalationNotification, finalizeUnitMutation, logUnitActivity, resolveFieldActor, getSchedulerForUnit, recomputeAllMeasuredAt } from "./_shared";

const MANUFACTURING_ZONE_STATUSES: UnitStatus[] = ["measured", "bracketed", "manufactured"];

/** @deprecated Status is auto-derived via recomputeUnitStatus from window data. */
export async function updateUnitStatus(): Promise<ActionResult> {
  return { ok: false, error: "Manual status updates are no longer supported. Status is auto-derived from window data." };
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

    const windowInstallation = String(formData.get("windowInstallation") ?? "inside");
    const wandChainRaw = String(formData.get("wandChain") ?? "").trim();
    const wandChain = wandChainRaw ? parseInt(wandChainRaw, 10) : null;
    const fabricAdjustmentSide = String(formData.get("fabricAdjustmentSide") ?? "none");
    const fabricAdjustmentInchesRaw = String(formData.get("fabricAdjustmentInches") ?? "").trim();
    const fabricAdjustmentInches = fabricAdjustmentInchesRaw ? parseFloat(fabricAdjustmentInchesRaw) : null;

    const windowInsertPayload: Record<string, unknown> = {
      id: windowId,
      room_id: roomId,
      label,
      blind_type: blindType,
      chain_side: chainSide,
      width: wn,
      height: hn,
      depth: dn !== null && Number.isFinite(dn) ? dn : null,
      window_installation: ["inside", "outside"].includes(windowInstallation) ? windowInstallation : "inside",
      wand_chain: wandChain !== null && [30, 40, 50].includes(wandChain) ? wandChain : null,
      fabric_adjustment_side: ["none", "left", "right", "centred"].includes(fabricAdjustmentSide) ? fabricAdjustmentSide : "none",
      fabric_adjustment_inches: fabricAdjustmentInches !== null && Number.isFinite(fabricAdjustmentInches) ? fabricAdjustmentInches : null,
      notes: notes.trim(),
      risk_flag: riskFlag,
      photo_url: publicUrl,
      measured: true,
      bracketed: false,
      installed: false,
    };
    const { error: insErr } = await supabase.from("windows").insert(windowInsertPayload);
    if (insErr) {
      if (storagePath) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
      }
      return { ok: false, error: insErr.message };
    }

    await recomputeAllMeasuredAt(supabase, unitId);

    if (publicUrl && storagePath) {
      const { actorRole: uploadRole, actorName: uploadName, actorUserId: uploadUserId } =
        await resolveFieldActor(null);
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
        uploaded_by_user_id: uploadUserId,
        uploaded_by_name: uploadName,
        uploaded_by_role: uploadRole,
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
      // A window added to a unit already in the manufacturing zone does not
      // change unit status, so finalizeUnitMutation → recomputeUnitStatus did
      // not reflow (it only reflows on a status transition into the zone).
      // Without this, the new window would have no window_manufacturing_schedule
      // row and be invisible to the queues. This replaces the read-path
      // self-heal that previously reflowed the whole facility on every view.
      if (unitStatus === prevStatus && MANUFACTURING_ZONE_STATUSES.includes(unitStatus)) {
        await reflowManufacturingSchedules("window_added");
      }

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

    const windowInstallation2 = String(formData.get("windowInstallation") ?? "inside");
    const wandChainRaw2 = String(formData.get("wandChain") ?? "").trim();
    const wandChain2 = wandChainRaw2 ? parseInt(wandChainRaw2, 10) : null;
    const fabricAdjustmentSide2 = String(formData.get("fabricAdjustmentSide") ?? "none");
    const fabricAdjustmentInchesRaw2 = String(formData.get("fabricAdjustmentInches") ?? "").trim();
    const fabricAdjustmentInches2 = fabricAdjustmentInchesRaw2 ? parseFloat(fabricAdjustmentInchesRaw2) : null;

    const patch: Record<string, unknown> = {
      label,
      blind_type: blindType,
      chain_side: chainSide,
      width: wn,
      height: hn,
      depth: dn !== null && Number.isFinite(dn) ? dn : null,
      window_installation: ["inside", "outside"].includes(windowInstallation2) ? windowInstallation2 : "inside",
      wand_chain: wandChain2 !== null && [30, 40, 50].includes(wandChain2) ? wandChain2 : null,
      fabric_adjustment_side: ["none", "left", "right", "centred"].includes(fabricAdjustmentSide2) ? fabricAdjustmentSide2 : "none",
      fabric_adjustment_inches: fabricAdjustmentInches2 !== null && Number.isFinite(fabricAdjustmentInches2) ? fabricAdjustmentInches2 : null,
      notes: notes.trim(),
      risk_flag: riskFlag,
      measured: true,
    };
    if (publicUrl) {
      patch.photo_url = publicUrl;
    }

    const { error: upWin } = await supabase.from("windows").update(patch).eq("id", windowId);
    if (upWin) {
      if (storagePath) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
      }
      return { ok: false, error: upWin.message };
    }

    await recomputeAllMeasuredAt(supabase, unitId);

    const { data: unit } = await supabase
      .from("units")
      .select("assigned_installer_name, status")
      .eq("id", unitId)
      .single();
    const { actorRole, actorName, actorUserId } = await resolveFieldActor(unit?.assigned_installer_name);

    if (publicUrl && storagePath) {
      const existingCount = await countWindowStagePhotos(supabase, windowId, uploadStage);
      if (existingCount >= MAX_PHOTOS_PER_STAGE) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        return { ok: false, error: `Maximum of ${MAX_PHOTOS_PER_STAGE} photos per stage allowed.` };
      }
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
        uploaded_by_user_id: actorUserId,
        uploaded_by_name: actorName,
        uploaded_by_role: actorRole,
      });
      if (mediaInsertError) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        return { ok: false, error: mediaInsertError.message };
      }
    }

    const prevStatus = (unit?.status as UnitStatus | undefined) ?? "not_started";
    const unitStatus = await finalizeUnitMutation(supabase, unitId, [roomId]);

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
export async function bulkMarkUnitWindowsInstalled(
  unitId: string
): Promise<{ ok: boolean; error?: string; unitStatus?: UnitStatus }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Not authenticated." };
    if (!unitId) return { ok: false, error: "Missing unit ID." };

    const supabase = await createClient();

    const { data: unitRow, error: unitErr } = await supabase
      .from("units")
      .select("id, status, assigned_installer_name")
      .eq("id", unitId)
      .single();
    if (unitErr || !unitRow) return { ok: false, error: "Unit not found." };

    const { data: rooms, error: roomsErr } = await supabase
      .from("rooms")
      .select("id")
      .eq("unit_id", unitId);
    if (roomsErr || !rooms?.length) return { ok: false, error: "No rooms found for unit." };

    const roomIds = (rooms as Array<{ id: string }>).map((r) => r.id);

    const { data: windows, error: windowsErr } = await supabase
      .from("windows")
      .select("id, room_id, risk_flag, installed")
      .in("room_id", roomIds);
    if (windowsErr || !windows?.length) return { ok: false, error: "No windows found for unit." };

    const windowIds = (windows as Array<{ id: string }>).map((w) => w.id);

    // Gate: all windows must be qc_approved (manufactured)
    const { data: productionRows } = await supabase
      .from("window_production_status")
      .select("window_id, status")
      .eq("unit_id", unitId);
    const qcApprovedIds = new Set(
      ((productionRows ?? []) as Array<{ window_id: string; status: string }>)
        .filter((r) => r.status === "qc_approved")
        .map((r) => r.window_id)
    );
    const allManufactured = windowIds.every((wid) => qcApprovedIds.has(wid));
    if (!allManufactured) {
      return { ok: false, error: "All windows must pass manufacturing QC before bulk install." };
    }

    // Gate: all windows must have green risk flag
    const hasNonGreen = (windows as Array<{ risk_flag: string }>).some(
      (w) => w.risk_flag !== "green"
    );
    if (hasNonGreen) {
      return { ok: false, error: "All windows must have green risk status before bulk install." };
    }

    const uninstalledIds = (windows as Array<{ id: string; installed: boolean }>)
      .filter((w) => !w.installed)
      .map((w) => w.id);

    if (uninstalledIds.length > 0) {
      const { error: updateErr } = await supabase
        .from("windows")
        .update({ installed: true })
        .in("id", uninstalledIds);
      if (updateErr) return { ok: false, error: updateErr.message };
    }

    const { actorRole, actorName } = await resolveFieldActor(unitRow.assigned_installer_name);
    const prevStatus = (unitRow.status as UnitStatus | undefined) ?? "not_started";
    const unitStatus = await finalizeUnitMutation(supabase, unitId, roomIds);

    after(async () => {
      const db = createAdminClient();
      await logUnitActivity(db, unitId, actorRole, actorName, "installation_completed", {
        bulk: true,
        windowCount: uninstalledIds.length,
      });
      if (unitStatus !== prevStatus) {
        const schedulerId = await getSchedulerForUnit(db, unitId);
        if (schedulerId) {
          await emitUnitProgressNotification(db, schedulerId, unitId, unitStatus);
        }
      }
    });

    return { ok: true, unitStatus };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

/**
 * Marks every not-yet-bracketed window in a unit as bracketed in one action.
 *
 * Unlike bulk install, there are no QC/manufacturing or risk-flag gates:
 * a window can be bracketed whether or not it is measured. Only `bracketed`
 * is set — `measured` and `installed` are left untouched.
 */
export async function bulkMarkUnitWindowsBracketed(
  unitId: string
): Promise<{ ok: boolean; error?: string; unitStatus?: UnitStatus }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Not authenticated." };
    if (!unitId) return { ok: false, error: "Missing unit ID." };

    const supabase = await createClient();

    const { data: unitRow, error: unitErr } = await supabase
      .from("units")
      .select("id, status, assigned_installer_name")
      .eq("id", unitId)
      .single();
    if (unitErr || !unitRow) return { ok: false, error: "Unit not found." };

    const { data: rooms, error: roomsErr } = await supabase
      .from("rooms")
      .select("id")
      .eq("unit_id", unitId);
    if (roomsErr || !rooms?.length) return { ok: false, error: "No rooms found for unit." };

    const roomIds = (rooms as Array<{ id: string }>).map((r) => r.id);

    const { data: windows, error: windowsErr } = await supabase
      .from("windows")
      .select("id, room_id, bracketed")
      .in("room_id", roomIds);
    if (windowsErr || !windows?.length) return { ok: false, error: "No windows found for unit." };

    const unbracketedIds = (windows as Array<{ id: string; bracketed: boolean }>)
      .filter((w) => !w.bracketed)
      .map((w) => w.id);

    if (unbracketedIds.length > 0) {
      const { error: updateErr } = await supabase
        .from("windows")
        .update({ bracketed: true })
        .in("id", unbracketedIds);
      if (updateErr) return { ok: false, error: updateErr.message };
    }

    const { actorRole, actorName } = await resolveFieldActor(unitRow.assigned_installer_name);
    const prevStatus = (unitRow.status as UnitStatus | undefined) ?? "not_started";
    const unitStatus = await finalizeUnitMutation(supabase, unitId, roomIds);

    after(async () => {
      const db = createAdminClient();
      await logUnitActivity(db, unitId, actorRole, actorName, "bracketing_completed", {
        bulk: true,
        windowCount: unbracketedIds.length,
      });
      if (unitStatus !== prevStatus) {
        const schedulerId = await getSchedulerForUnit(db, unitId);
        if (schedulerId) {
          await emitUnitProgressNotification(db, schedulerId, unitId, unitStatus);
        }
      }
    });

    return { ok: true, unitStatus };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}
