import { createClient } from "@/lib/supabase/server";
import type { UnitPhotoStage } from "@/lib/types";
import { selectInChunks } from "@/lib/supabase-chunking";
import type { MediaUploadRow } from "./internal-types";

export type InstallerMediaItem = {
  id: string;
  publicUrl: string;
  label: string | null;
  unitId: string;
  unitNumber: string;
  buildingId: string;
  buildingName: string;
  stage: UnitPhotoStage;
  createdAt: string;
};

export type UnitStageMediaItem = {
  id: string;
  publicUrl: string;
  label: string | null;
  unitId: string;
  roomId: string | null;
  roomName: string | null;
  windowId: string | null;
  windowLabel: string | null;
  uploadKind: string;
  stage: UnitPhotoStage;
  createdAt: string;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  uploadedByRole: string | null;
};

function normalizeMediaStage(
  stage: string | null,
  phase: string | null
): UnitPhotoStage {
  if (
    stage === "scheduled_bracketing" ||
    stage === "bracketed_measured" ||
    stage === "installed_pending_approval"
  ) {
    return stage;
  }
  return phase === "installation"
    ? "installed_pending_approval"
    : "bracketed_measured";
}

export async function loadInstallerMedia(
  installerId: string
): Promise<InstallerMediaItem[]> {
  const supabase = await createClient();
  const { data: units, error: ue } = await supabase
    .from("units")
    .select("id, unit_number, building_id, building_name")
    .eq("assigned_installer_id", installerId);
  if (ue) {
    throw new Error(ue.message);
  }
  type UnitMeta = { unit_number: string; building_id: string; building_name: string };
  const unitMap = new Map<string, UnitMeta>(
    (units ?? []).map((u) => [
      u.id,
      { unit_number: u.unit_number, building_id: u.building_id, building_name: u.building_name },
    ])
  );
  const unitIds = [...unitMap.keys()];
  if (unitIds.length === 0) {
    return [];
  }
  type InstallerMediaRow = {
    id: string;
    public_url: string;
    label: string | null;
    unit_id: string;
    stage: string | null;
    phase: string | null;
    created_at: string;
  };
  const media = await selectInChunks<InstallerMediaRow>(unitIds, (chunk) =>
    supabase
      .from("media_uploads")
      .select("id, public_url, label, unit_id, stage, phase, created_at")
      .in("unit_id", chunk)
      .order("created_at", { ascending: false })
      .then((res) => ({ data: res.data as InstallerMediaRow[] | null, error: res.error })),
  );
  return media.map((m) => {
    const meta = unitMap.get(m.unit_id);
    return {
      id: m.id,
      publicUrl: m.public_url,
      label: m.label,
      unitId: m.unit_id,
      unitNumber: meta?.unit_number ?? m.unit_id,
      buildingId: meta?.building_id ?? "",
      buildingName: meta?.building_name ?? "",
      stage: normalizeMediaStage(m.stage, m.phase),
      createdAt: m.created_at,
    };
  });
}

export async function loadUnitStageMedia(
  unitId: string
): Promise<UnitStageMediaItem[]> {
  const supabase = await createClient();

  // Try selecting with uploader columns (added in 20260414 migration).
  // If those columns don't exist yet, PostgREST returns a 400 — fall back
  // to the base column set so the app keeps working before migration runs.
  let media: MediaUploadRow[] | null = null;
  let hasUploaderColumns = true;

  const fullSelect =
    "id, public_url, label, unit_id, room_id, window_id, upload_kind, stage, phase, created_at, uploaded_by_user_id, uploaded_by_name, uploaded_by_role";
  const baseSelect =
    "id, public_url, label, unit_id, room_id, window_id, upload_kind, stage, phase, created_at";

  const [primaryResult, { data: rooms, error: roomError }] = await Promise.all([
    supabase
      .from("media_uploads")
      .select(fullSelect)
      .eq("unit_id", unitId)
      .order("created_at", { ascending: false }),
    supabase.from("rooms").select("id, name").eq("unit_id", unitId),
  ]);

  if (primaryResult.error) {
    // If the error looks like a missing-column error, retry without uploader cols.
    const msg = primaryResult.error.message ?? "";
    if (
      msg.includes("uploaded_by") ||
      msg.includes("column") ||
      primaryResult.error.code === "42703"
    ) {
      hasUploaderColumns = false;
      const fallback = await supabase
        .from("media_uploads")
        .select(baseSelect)
        .eq("unit_id", unitId)
        .order("created_at", { ascending: false });
      if (fallback.error) {
        throw new Error(
          `${fallback.error.message} Apply supabase/migrations/20250322140000_storage_and_media.sql if media_uploads is missing.`
        );
      }
      media = (fallback.data ?? []) as MediaUploadRow[];
    } else {
      throw new Error(
        `${primaryResult.error.message} Apply supabase/migrations/20250322140000_storage_and_media.sql if media_uploads is missing.`
      );
    }
  } else {
    media = (primaryResult.data ?? []) as MediaUploadRow[];
  }

  if (roomError) {
    throw new Error(roomError.message);
  }

  const roomMap = new Map((rooms ?? []).map((room) => [room.id, room.name]));
  const roomIds = [...roomMap.keys()];
  const { data: windows, error: windowError } = roomIds.length
    ? await supabase
        .from("windows")
        .select("id, room_id, label")
        .in("room_id", roomIds)
    : { data: [], error: null };

  if (windowError) {
    throw new Error(windowError.message);
  }

  const windowMap = new Map(
    (windows ?? []).map((window) => [window.id, { label: window.label, roomId: window.room_id }])
  );

  return (media ?? []).map((item) => {
    const windowMeta = item.window_id ? windowMap.get(item.window_id) : null;
    return {
      id: item.id,
      publicUrl: item.public_url,
      label: item.label,
      unitId: item.unit_id,
      roomId: item.room_id,
      roomName: item.room_id ? roomMap.get(item.room_id) ?? null : null,
      windowId: item.window_id,
      windowLabel: windowMeta?.label ?? null,
      uploadKind: item.upload_kind,
      stage: normalizeMediaStage(item.stage, item.phase),
      createdAt: item.created_at,
      uploadedByUserId: hasUploaderColumns ? (item.uploaded_by_user_id ?? null) : null,
      uploadedByName: hasUploaderColumns ? (item.uploaded_by_name ?? null) : null,
      uploadedByRole: hasUploaderColumns ? (item.uploaded_by_role ?? null) : null,
    };
  });
}
