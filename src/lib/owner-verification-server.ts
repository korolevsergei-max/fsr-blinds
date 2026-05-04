import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  OWNER_VERIFICATION_BUCKET,
  OWNER_VERIFICATION_SIGNED_URL_TTL_SECONDS,
  type OwnerVerificationPhoto,
} from "@/lib/owner-verification-photos";

export type OwnerVerificationPhotoRow = {
  id: string;
  unit_id: string;
  storage_path: string;
  note: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string | null;
};

export function mapOwnerVerificationPhotoRow(
  row: OwnerVerificationPhotoRow,
  signedUrl: string
): OwnerVerificationPhoto {
  return {
    id: row.id,
    unitId: row.unit_id,
    signedUrl,
    note: row.note ?? "",
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

export async function signOwnerVerificationPhotoRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: OwnerVerificationPhotoRow
): Promise<OwnerVerificationPhoto> {
  const { data, error } = await supabase.storage
    .from(OWNER_VERIFICATION_BUCKET)
    .createSignedUrl(row.storage_path, OWNER_VERIFICATION_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not prepare verification photo.");
  }

  return mapOwnerVerificationPhotoRow(row, data.signedUrl);
}

export const loadOwnerVerificationPhotos = cache(
  async (unitId: string): Promise<OwnerVerificationPhoto[]> => {
    if (!unitId) return [];

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("owner_verification_photos")
      .select("id, unit_id, storage_path, note, created_by_name, created_at, updated_at")
      .eq("unit_id", unitId)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "42P01") return [];
      throw new Error(error.message);
    }

    return Promise.all(
      ((data ?? []) as OwnerVerificationPhotoRow[]).map((row) =>
        signOwnerVerificationPhotoRow(supabase, row)
      )
    );
  }
);
