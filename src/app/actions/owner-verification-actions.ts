"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_OWNER_VERIFICATION_PHOTOS,
  OWNER_VERIFICATION_BUCKET,
  getRemainingOwnerVerificationPhotoSlots,
  normalizeOwnerVerificationNote,
  validateOwnerVerificationNote,
  type OwnerVerificationPhoto,
  type OwnerVerificationPhotoNoteInput,
} from "@/lib/owner-verification-photos";
import {
  signOwnerVerificationPhotoRow,
  type OwnerVerificationPhotoRow,
} from "@/lib/owner-verification-server";

type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;

function validateIncomingImageFile(
  file: File,
  fieldLabel = "Photo"
): { ok: false; error: string } | null {
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, error: `${fieldLabel} is required.` };
  }
  if (!file.type || !file.type.startsWith("image/")) {
    return { ok: false, error: `${fieldLabel} must be an image file.` };
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return { ok: false, error: `${fieldLabel} must be under 20MB.` };
  }
  return null;
}

function normalizeStorageError(message: string): string {
  if (/bucket not found/i.test(message)) {
    return `Storage bucket "${OWNER_VERIFICATION_BUCKET}" is missing. Apply the owner verification photos migration, then retry.`;
  }
  return message;
}

function revalidateOwnerVerificationPaths(unitId: string) {
  revalidatePath(`/management/units/${unitId}`, "page");
}

async function assertUnitExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string
): Promise<{ ok: false; error: string } | null> {
  const { data, error } = await supabase
    .from("units")
    .select("id")
    .eq("id", unitId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Unit not found." };
  return null;
}

export async function uploadOwnerVerificationPhotos(
  formData: FormData
): Promise<ActionResult<{ photos: OwnerVerificationPhoto[] }>> {
  try {
    const owner = await requireOwner();
    const unitId = String(formData.get("unitId") ?? "");
    const files = formData
      .getAll("photos")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!unitId) return { ok: false, error: "Missing unit." };
    if (files.length === 0) return { ok: false, error: "Add at least one photo." };

    for (const [index, file] of files.entries()) {
      const validation = validateIncomingImageFile(file, `Photo ${index + 1}`);
      if (validation) return validation;
    }

    const supabase = await createClient();
    const unitError = await assertUnitExists(supabase, unitId);
    if (unitError) return unitError;

    const { count, error: countError } = await supabase
      .from("owner_verification_photos")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId);

    if (countError) return { ok: false, error: countError.message };

    const remaining = getRemainingOwnerVerificationPhotoSlots(count ?? 0);
    if (files.length > remaining) {
      return {
        ok: false,
        error:
          remaining === 0
            ? `This unit already has ${MAX_OWNER_VERIFICATION_PHOTOS} verification photos.`
            : `You can add ${remaining} more verification photo${remaining === 1 ? "" : "s"}.`,
      };
    }

    const uploadedPaths: string[] = [];
    const insertedRows: OwnerVerificationPhotoRow[] = [];

    for (const file of files) {
      const ext =
        (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "jpg";
      const storagePath = `${unitId}/${crypto.randomUUID()}.${ext}`;
      const buffer = new Uint8Array(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from(OWNER_VERIFICATION_BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        if (uploadedPaths.length > 0) {
          await supabase.storage.from(OWNER_VERIFICATION_BUCKET).remove(uploadedPaths);
        }
        return { ok: false, error: normalizeStorageError(uploadError.message) };
      }

      uploadedPaths.push(storagePath);

      const { data: row, error: insertError } = await supabase
        .from("owner_verification_photos")
        .insert({
          id: `ovp-${crypto.randomUUID()}`,
          unit_id: unitId,
          storage_path: storagePath,
          note: "",
          created_by_user_id: owner.id,
          created_by_name: owner.displayName,
        })
        .select("id, unit_id, storage_path, note, created_by_name, created_at, updated_at")
        .single();

      if (insertError || !row) {
        await supabase.storage.from(OWNER_VERIFICATION_BUCKET).remove(uploadedPaths);
        if (insertedRows.length > 0) {
          await supabase
            .from("owner_verification_photos")
            .delete()
            .in("id", insertedRows.map((item) => item.id));
        }
        return { ok: false, error: insertError?.message ?? "Could not save verification photo." };
      }

      insertedRows.push(row as OwnerVerificationPhotoRow);
    }

    const photos = await Promise.all(
      insertedRows.map((row) => signOwnerVerificationPhotoRow(supabase, row))
    );
    revalidateOwnerVerificationPaths(unitId);
    return { ok: true, photos };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload verification photos.";
    if (message.includes("Unauthorized")) {
      return { ok: false, error: "Only owners can manage verification photos." };
    }
    return { ok: false, error: message };
  }
}

export async function saveOwnerVerificationPhotoNotes(input: {
  unitId: string;
  notes: OwnerVerificationPhotoNoteInput[];
}): Promise<ActionResult<{ photos: OwnerVerificationPhoto[] }>> {
  try {
    await requireOwner();
    const unitId = input.unitId;
    const notes = input.notes ?? [];
    if (!unitId) return { ok: false, error: "Missing unit." };
    if (notes.length === 0) return { ok: true, photos: [] };

    const normalizedNotes = notes.map((item) => ({
      id: String(item.id ?? ""),
      note: normalizeOwnerVerificationNote(item.note),
    }));
    if (normalizedNotes.some((item) => !item.id)) {
      return { ok: false, error: "Missing verification photo." };
    }

    for (const item of normalizedNotes) {
      const validation = validateOwnerVerificationNote(item.note);
      if (validation) return { ok: false, error: validation };
    }

    const supabase = await createClient();
    const unitError = await assertUnitExists(supabase, unitId);
    if (unitError) return unitError;

    const updatedRows: OwnerVerificationPhotoRow[] = [];
    for (const item of normalizedNotes) {
      const { data, error } = await supabase
        .from("owner_verification_photos")
        .update({ note: item.note })
        .eq("id", item.id)
        .eq("unit_id", unitId)
        .select("id, unit_id, storage_path, note, created_by_name, created_at, updated_at")
        .maybeSingle();

      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Verification photo not found." };
      updatedRows.push(data as OwnerVerificationPhotoRow);
    }

    const photos = await Promise.all(
      updatedRows.map((row) => signOwnerVerificationPhotoRow(supabase, row))
    );
    revalidateOwnerVerificationPaths(unitId);
    return { ok: true, photos };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save verification notes.";
    if (message.includes("Unauthorized")) {
      return { ok: false, error: "Only owners can manage verification notes." };
    }
    return { ok: false, error: message };
  }
}

export async function deleteOwnerVerificationPhoto(input: {
  unitId: string;
  photoId: string;
}): Promise<ActionResult> {
  try {
    await requireOwner();
    const unitId = input.unitId;
    const photoId = input.photoId;
    if (!unitId || !photoId) return { ok: false, error: "Missing verification photo." };

    const supabase = await createClient();
    const { data: photo, error: fetchError } = await supabase
      .from("owner_verification_photos")
      .select("id, storage_path")
      .eq("id", photoId)
      .eq("unit_id", unitId)
      .maybeSingle();

    if (fetchError) return { ok: false, error: fetchError.message };
    if (!photo) return { ok: false, error: "Verification photo not found." };

    const { error: storageError } = await supabase.storage
      .from(OWNER_VERIFICATION_BUCKET)
      .remove([photo.storage_path]);

    if (storageError) return { ok: false, error: normalizeStorageError(storageError.message) };

    const { error: deleteError } = await supabase
      .from("owner_verification_photos")
      .delete()
      .eq("id", photoId)
      .eq("unit_id", unitId);

    if (deleteError) return { ok: false, error: deleteError.message };

    revalidateOwnerVerificationPaths(unitId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete verification photo.";
    if (message.includes("Unauthorized")) {
      return { ok: false, error: "Only owners can delete verification photos." };
    }
    return { ok: false, error: message };
  }
}
