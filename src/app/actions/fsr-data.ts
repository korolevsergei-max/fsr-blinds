"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BlindType, RiskFlag, UnitStatus } from "@/lib/types";

const BUCKET = "fsr-media";

function normalizeStorageError(message: string): string {
  if (/bucket not found/i.test(message)) {
    return `Storage bucket "${BUCKET}" is missing. Run supabase/migrations/20250322140000_storage_and_media.sql in Supabase SQL Editor, then retry.`;
  }
  return message;
}

function revalidateApp() {
  revalidatePath("/management", "layout");
  revalidatePath("/installer", "layout");
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
    const { count: p } = await supabase
      .from("windows")
      .select("*", { count: "exact", head: true })
      .in("room_id", roomIds)
      .not("photo_url", "is", null);
    windowTotal = w ?? 0;
    photoTotal = p ?? 0;
  }
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

export async function updateUnitAssignment(
  unitId: string,
  installerId: string,
  bracketingDate: string,
  installationDate: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: inst, error: ie } = await supabase
      .from("installers")
      .select("name")
      .eq("id", installerId)
      .single();
    if (ie || !inst) {
      return { ok: false, error: "Installer not found" };
    }

    const { error } = await supabase
      .from("units")
      .update({
        assigned_installer_id: installerId,
        assigned_installer_name: inst.name,
        bracketing_date: bracketingDate || null,
        installation_date: installationDate || null,
      })
      .eq("id", unitId);
    if (error) {
      return { ok: false, error: error.message };
    }

    if (bracketingDate) {
      await supabase
        .from("schedule_entries")
        .update({ task_date: bracketingDate })
        .eq("unit_id", unitId)
        .eq("task_type", "bracketing");
    }
    if (installationDate) {
      await supabase
        .from("schedule_entries")
        .update({ task_date: installationDate })
        .eq("unit_id", unitId)
        .eq("task_type", "installation");
    }

    revalidateApp();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function updateUnitStatus(
  unitId: string,
  status: UnitStatus,
  note: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("units")
      .update({
        status,
        status_note: note.trim() || null,
      })
      .eq("id", unitId);
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
    const riskFlag = String(formData.get("riskFlag") ?? "") as RiskFlag;
    const file = formData.get("photo");

    if (!unitId || !roomId) {
      return { ok: false, error: "Missing unit or room" };
    }
    if (!label) {
      return { ok: false, error: "Window label is required" };
    }
    const wn = parseFloat(width);
    const hn = parseFloat(height);
    if (!Number.isFinite(wn) || wn <= 0 || !Number.isFinite(hn) || hn <= 0) {
      return { ok: false, error: "Valid width and height are required" };
    }
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Photo is required" };
    }
    if (blindType !== "screen" && blindType !== "blackout") {
      return { ok: false, error: "Invalid blind type" };
    }
    if (!["green", "yellow", "red"].includes(riskFlag)) {
      return { ok: false, error: "Invalid risk flag" };
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

    // Determine upload phase from unit's current status
    const { data: unitRow } = await supabase
      .from("units")
      .select("status")
      .eq("id", unitId)
      .single();
    const uploadPhase =
      unitRow?.status === "install_date_scheduled" ? "installation" : "bracketing";

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
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const windowId = `win-${crypto.randomUUID()}`;
    const dn = depth.trim() ? parseFloat(depth) : null;

    const blindWidth = String(formData.get("blindWidth") ?? "").trim();
    const blindHeight = String(formData.get("blindHeight") ?? "").trim();
    const blindDepth = String(formData.get("blindDepth") ?? "").trim();
    const bw = blindWidth ? parseFloat(blindWidth) : null;
    const bh = blindHeight ? parseFloat(blindHeight) : null;
    const bd = blindDepth ? parseFloat(blindDepth) : null;

    const { error: insErr } = await supabase.from("windows").insert({
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
    });
    if (insErr) {
      await supabase.storage.from(BUCKET).remove([path]);
      return { ok: false, error: insErr.message };
    }

    const { error: medErr } = await supabase.from("media_uploads").insert({
      id: `med-${crypto.randomUUID()}`,
      storage_path: path,
      public_url: publicUrl,
      upload_kind: "window_measure",
      phase: uploadPhase,
      unit_id: unitId,
      room_id: roomId,
      window_id: windowId,
      label,
    });
    if (medErr) {
      await supabase.from("windows").delete().eq("id", windowId);
      await supabase.storage.from(BUCKET).remove([path]);
      return { ok: false, error: medErr.message };
    }

    await refreshRoomAggregates(supabase, roomId);
    await refreshUnitAggregates(supabase, unitId);
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
    const riskFlag = String(formData.get("riskFlag") ?? "") as RiskFlag;
    const file = formData.get("photo");

    if (!windowId || !unitId || !roomId) {
      return { ok: false, error: "Missing ids" };
    }
    if (!label) {
      return { ok: false, error: "Window label is required" };
    }
    const wn = parseFloat(width);
    const hn = parseFloat(height);
    if (!Number.isFinite(wn) || wn <= 0 || !Number.isFinite(hn) || hn <= 0) {
      return { ok: false, error: "Valid width and height are required" };
    }
    if (blindType !== "screen" && blindType !== "blackout") {
      return { ok: false, error: "Invalid blind type" };
    }
    if (!["green", "yellow", "red"].includes(riskFlag)) {
      return { ok: false, error: "Invalid risk flag" };
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

    // Determine upload phase from unit's current status
    const { data: unitRow } = await supabase
      .from("units")
      .select("status")
      .eq("id", unitId)
      .single();
    const uploadPhase =
      unitRow?.status === "install_date_scheduled" ? "installation" : "bracketing";

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

    const { error: upWin } = await supabase
      .from("windows")
      .update(patch)
      .eq("id", windowId);
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
        unit_id: unitId,
        room_id: roomId,
        window_id: windowId,
        label: `${label} (updated)`,
      });
    }

    await refreshRoomAggregates(supabase, roomId);
    await refreshUnitAggregates(supabase, unitId);
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
