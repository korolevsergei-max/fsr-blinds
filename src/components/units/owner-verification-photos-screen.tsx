"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Camera, CheckCircle, Plus, Spinner, Trash } from "@phosphor-icons/react";
import {
  deleteOwnerVerificationPhoto,
  saveOwnerVerificationPhotoNotes,
  uploadOwnerVerificationPhotos,
} from "@/app/actions/owner-verification-actions";
import { useAppDatasetMaybe } from "@/lib/dataset-context";
import {
  MAX_OWNER_VERIFICATION_NOTE_LENGTH,
  MAX_OWNER_VERIFICATION_PHOTOS,
  getRemainingOwnerVerificationPhotoSlots,
  type OwnerVerificationPhoto,
} from "@/lib/owner-verification-photos";
import { compressImageForUpload, validateUploadImage } from "@/lib/image-upload";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PhotoSourcePicker } from "@/components/ui/photo-source-picker";

type OwnerVerificationPhotosScreenProps = {
  unitId: string;
  initialPhotos: OwnerVerificationPhoto[];
};

const APP_TIME_ZONE = "America/Toronto";
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function sortNewestFirst(photos: OwnerVerificationPhoto[]) {
  return [...photos].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function mergePhotos(
  current: OwnerVerificationPhoto[],
  incoming: OwnerVerificationPhoto[]
) {
  const byId = new Map(current.map((photo) => [photo.id, photo]));
  for (const photo of incoming) {
    byId.set(photo.id, photo);
  }
  return sortNewestFirst(Array.from(byId.values()));
}

function formatSavedDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(value));

  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const monthIndex = Number(partValue("month")) - 1;
  const month = SHORT_MONTHS[monthIndex] ?? partValue("month");
  const day = partValue("day");
  const hour = partValue("hour");
  const minute = partValue("minute");
  const dayPeriod = partValue("dayPeriod").toUpperCase();

  return `${month} ${day} at ${hour}:${minute} ${dayPeriod}`;
}

export function OwnerVerificationPhotosScreen({
  unitId,
  initialPhotos,
}: OwnerVerificationPhotosScreenProps) {
  const datasetCtx = useAppDatasetMaybe();
  const unit = datasetCtx?.data.units.find((item) => item.id === unitId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [photos, setPhotos] = useState(() => sortNewestFirst(initialPhotos));
  const [notesById, setNotesById] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialPhotos.map((photo) => [photo.id, photo.note]))
  );
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingScrollPhotoId, setPendingScrollPhotoId] = useState<string | null>(null);
  const [highlightedPhotoId, setHighlightedPhotoId] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setPhotos(sortNewestFirst(initialPhotos));
    setNotesById(Object.fromEntries(initialPhotos.map((photo) => [photo.id, photo.note])));
    setDirtyIds(new Set());
  }, [initialPhotos]);

  useEffect(() => {
    if (!pendingScrollPhotoId) return;
    const target = document.querySelector<HTMLElement>(
      `[data-owner-verification-photo-id="${pendingScrollPhotoId}"]`
    );
    if (!target) return;

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start", behavior: "smooth" });
      setHighlightedPhotoId(pendingScrollPhotoId);
      setPendingScrollPhotoId(null);

      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedPhotoId(null);
        highlightTimerRef.current = null;
      }, 2200);
    });
  }, [pendingScrollPhotoId, photos]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const remaining = getRemainingOwnerVerificationPhotoSlots(photos.length);
  const hasDirtyNotes = dirtyIds.size > 0;
  const dirtyNoteCount = dirtyIds.size;
  const countLabel = useMemo(
    () => `${photos.length}/${MAX_OWNER_VERIFICATION_PHOTOS}`,
    [photos.length]
  );

  const setPhotoNote = (photoId: string, note: string) => {
    setNotice("");
    setError("");
    setNotesById((prev) => ({ ...prev, [photoId]: note }));
    setDirtyIds((prev) => new Set(prev).add(photoId));
  };

  const handleFileChange = async (files: FileList | null) => {
    setError("");
    setNotice("");
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;

    if (selected.length > remaining) {
      setError(
        remaining === 0
          ? `This unit already has ${MAX_OWNER_VERIFICATION_PHOTOS} verification photos.`
          : `You can add ${remaining} more verification photo${remaining === 1 ? "" : "s"}.`
      );
      return;
    }

    for (const file of selected) {
      const validation = validateUploadImage(file);
      if (validation) {
        setError(validation);
        return;
      }
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("unitId", unitId);
      for (const file of selected) {
        const compressed = await compressImageForUpload(file);
        fd.append("photos", compressed, compressed.name);
      }

      const result = await uploadOwnerVerificationPhotos(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setPhotos((prev) => mergePhotos(prev, result.photos));
      setNotesById((prev) => ({
        ...prev,
        ...Object.fromEntries(result.photos.map((photo) => [photo.id, photo.note])),
      }));
      setPendingScrollPhotoId(sortNewestFirst(result.photos)[0]?.id ?? null);
      setNotice(
        result.photos.length === 1
          ? "Verification photo added."
          : `${result.photos.length} verification photos added.`
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload photos.");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveNotes = async () => {
    setError("");
    setNotice("");
    const notePayload = photos
      .filter((photo) => dirtyIds.has(photo.id))
      .map((photo) => ({
        id: photo.id,
        note: notesById[photo.id] ?? "",
      }));

    if (notePayload.length === 0) return;

    const tooLong = notePayload.find(
      (item) => item.note.length > MAX_OWNER_VERIFICATION_NOTE_LENGTH
    );
    if (tooLong) {
      setError(`Notes must be ${MAX_OWNER_VERIFICATION_NOTE_LENGTH} characters or less.`);
      return;
    }

    setSaving(true);
    try {
      const result = await saveOwnerVerificationPhotoNotes({
        unitId,
        notes: notePayload,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setPhotos((prev) => mergePhotos(prev, result.photos));
      setNotesById((prev) => ({
        ...prev,
        ...Object.fromEntries(result.photos.map((photo) => [photo.id, photo.note])),
      }));
      setDirtyIds(new Set());
      setNotice(dirtyNoteCount === 1 ? "Note saved." : "Notes saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (photo: OwnerVerificationPhoto) => {
    if (!confirm("Delete this verification photo?")) return;
    setError("");
    setNotice("");
    setDeletingId(photo.id);
    try {
      const result = await deleteOwnerVerificationPhoto({ unitId, photoId: photo.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setPhotos((prev) => prev.filter((item) => item.id !== photo.id));
      setNotesById((prev) => {
        const next = { ...prev };
        delete next[photo.id];
        return next;
      });
      setDirtyIds((prev) => {
        const next = new Set(prev);
        next.delete(photo.id);
        return next;
      });
      setNotice("Verification photo deleted.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-card">
      <PageHeader
        title="Verification Photos"
        subtitle={unit ? `Unit ${unit.unitNumber}` : "Owner-only inspection photos"}
        backHref={`/management/units/${unitId}`}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={remaining === 0 || uploading}
              onClick={() => setPickerOpen(true)}
            >
              <Plus size={15} />
              Add Photo
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!hasDirtyNotes || saving}
              onClick={handleSaveNotes}
            >
              {saving ? <Spinner size={15} className="animate-spin" /> : null}
              Save Notes
            </Button>
          </>
        }
      />

      <PhotoSourcePicker
        open={pickerOpen}
        multiple
        onClose={() => setPickerOpen(false)}
        onChange={handleFileChange}
      />

      <main className="flex flex-col gap-5 px-4 py-5 pb-28">
        <div className="flex items-center justify-between rounded-[1.25rem] border border-border bg-surface px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Owner verification</p>
            <p className="mt-0.5 text-xs text-muted">
              Private owner photos and notes for this unit.
            </p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-accent shadow-[0_0_0_1px_rgba(15,118,110,0.12)]">
            {countLabel}
          </span>
        </div>

        {photos.length === 0 && !uploading && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-border bg-surface px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-zinc-300 shadow-sm">
              <Camera size={26} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                No verification photos yet
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Add private owner photos after checking the installed unit.
              </p>
            </div>
            <Button
              type="button"
              size="md"
              disabled={uploading}
              onClick={() => setPickerOpen(true)}
              className="mt-2"
            >
              <Plus size={16} />
              Add Photo
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {photos.map((photo) => {
            const noteValue = notesById[photo.id] ?? "";
            const tooLong = noteValue.length > MAX_OWNER_VERIFICATION_NOTE_LENGTH;
            return (
              <div
                key={photo.id}
                data-owner-verification-photo-id={photo.id}
                className={[
                  "overflow-hidden rounded-[1.35rem] border bg-white shadow-[0_1px_2px_rgba(26,26,26,0.04)] transition-[border-color,box-shadow] duration-500",
                  highlightedPhotoId === photo.id
                    ? "border-accent shadow-[0_0_0_3px_rgba(15,118,110,0.14)]"
                    : "border-border",
                ].join(" ")}
              >
                <div className="relative aspect-[4/3] bg-zinc-100">
                  <Image
                    src={photo.signedUrl}
                    alt="Owner verification photo"
                    fill
                    sizes="(max-width: 640px) 100vw, 480px"
                    className="object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Delete verification photo"
                    disabled={deletingId === photo.id}
                    onClick={() => handleDelete(photo)}
                    className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-950/65 text-white shadow-sm transition-colors hover:bg-danger disabled:opacity-60"
                  >
                    {deletingId === photo.id ? (
                      <Spinner size={16} className="animate-spin" />
                    ) : (
                      <Trash size={16} />
                    )}
                  </button>
                </div>
                <div className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold text-muted">
                      Added by {photo.createdByName}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {formatSavedDate(photo.createdAt)}
                    </p>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-tertiary">
                      Notes
                    </span>
                    <textarea
                      value={noteValue}
                      onChange={(event) => setPhotoNote(photo.id, event.target.value)}
                      placeholder="Add what you noticed in this photo..."
                      rows={4}
                      className={[
                        "min-h-28 resize-y rounded-2xl border bg-surface px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-zinc-400 focus:border-accent focus:bg-white",
                        tooLong ? "border-danger/50" : "border-border",
                      ].join(" ")}
                    />
                  </label>
                  <div className="flex items-center justify-between">
                    <span
                      className={[
                        "text-[10px] font-medium",
                        tooLong ? "text-danger" : "text-zinc-400",
                      ].join(" ")}
                    >
                      {noteValue.length}/{MAX_OWNER_VERIFICATION_NOTE_LENGTH}
                    </span>
                    {dirtyIds.has(photo.id) && (
                      <span className="text-[10px] font-semibold text-accent">
                        Unsaved
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {uploading && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-4 text-sm font-semibold text-accent">
            <Spinner size={18} className="animate-spin" />
            Uploading verification photos
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-danger/20 bg-red-50 px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </div>
        )}

        {notice && !error && (
          <div className="flex items-center gap-2 rounded-2xl border border-accent/15 bg-accent/5 px-4 py-3 text-sm font-semibold text-accent">
            <CheckCircle size={17} weight="fill" />
            {notice}
          </div>
        )}

        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={remaining === 0 || uploading}
              onClick={() => setPickerOpen(true)}
            >
              <Plus size={16} />
              Add Photo
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={!hasDirtyNotes || saving}
              onClick={handleSaveNotes}
            >
              {saving ? <Spinner size={16} className="animate-spin" /> : null}
              Save Notes
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
