export const OWNER_VERIFICATION_BUCKET = "fsr-owner-verification";
export const MAX_OWNER_VERIFICATION_PHOTOS = 6;
export const MAX_OWNER_VERIFICATION_NOTE_LENGTH = 1000;
export const OWNER_VERIFICATION_SIGNED_URL_TTL_SECONDS = 60 * 60;

export type OwnerVerificationPhoto = {
  id: string;
  unitId: string;
  signedUrl: string;
  note: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type OwnerVerificationPhotoNoteInput = {
  id: string;
  note: string;
};

export function normalizeOwnerVerificationNote(note: unknown): string {
  return typeof note === "string" ? note.replace(/\r\n/g, "\n").trim() : "";
}

export function validateOwnerVerificationNote(note: unknown): string | null {
  const normalized = normalizeOwnerVerificationNote(note);
  if (normalized.length > MAX_OWNER_VERIFICATION_NOTE_LENGTH) {
    return `Notes must be ${MAX_OWNER_VERIFICATION_NOTE_LENGTH} characters or less.`;
  }
  return null;
}

export function getRemainingOwnerVerificationPhotoSlots(currentCount: number): number {
  return Math.max(0, MAX_OWNER_VERIFICATION_PHOTOS - Math.max(0, currentCount));
}
