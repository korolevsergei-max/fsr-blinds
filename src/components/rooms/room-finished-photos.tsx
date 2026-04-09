"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Camera, CheckCircle, Images, Plus, X } from "@phosphor-icons/react";
import { uploadRoomFinishedPhotos } from "@/app/actions/fsr-data";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { compressImageForUpload, validateUploadImage } from "@/lib/image-upload";

const MAX_PHOTOS = 3;

interface RoomFinishedPhotosProps {
  unitId: string;
  roomId: string;
  existingPhotos: UnitStageMediaItem[];
  canUpload?: boolean;
}

export function RoomFinishedPhotos({
  unitId,
  roomId,
  existingPhotos,
  canUpload = false,
}: RoomFinishedPhotosProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const remaining = MAX_PHOTOS - existingPhotos.length - pendingFiles.length;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    setSaved(false);
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;

    const available = MAX_PHOTOS - existingPhotos.length - pendingFiles.length;
    const toAdd = selected.slice(0, available);

    for (const file of toAdd) {
      const validationError = validateUploadImage(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    const newUrls = toAdd.map((f) => URL.createObjectURL(f));
    setPendingFiles((prev) => [...prev, ...toAdd]);
    setPreviewUrls((prev) => [...prev, ...newUrls]);

    // Reset so same file can be re-added if removed
    e.target.value = "";
  };

  const removePending = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
    setError("");
  };

  const handleSave = () => {
    if (pendingFiles.length === 0) return;
    setError("");
    setSaved(false);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("unitId", unitId);
      fd.set("roomId", roomId);

      try {
        setOptimizing(true);
        for (const file of pendingFiles) {
          const compressed = await compressImageForUpload(file);
          fd.append("photos", compressed, compressed.name);
        }
      } finally {
        setOptimizing(false);
      }

      const result = await uploadRoomFinishedPhotos(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Clean up preview URLs
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      setPendingFiles([]);
      setPreviewUrls([]);
      setSaved(true);
    });
  };

  const allPhotos = existingPhotos;
  const hasExisting = allPhotos.length > 0;
  const hasPending = pendingFiles.length > 0;

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/8 text-accent">
          <Images size={16} />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Room Photos</p>
          <p className="text-[11px] text-zinc-400">
            {canUpload ? "Up to 3 photos of the finished room." : "Finished room photos."}
          </p>
        </div>
      </div>

      {/* Existing saved photos */}
      {hasExisting && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {allPhotos.map((photo) => (
            <a
              key={photo.id}
              href={photo.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-zinc-100"
            >
              <Image
                src={photo.publicUrl}
                alt={photo.label ?? "Room photo"}
                fill
                unoptimized
                className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-zinc-950/0 group-hover:bg-zinc-950/10 transition-colors" />
            </a>
          ))}
        </div>
      )}

      {/* Pending previews */}
      {hasPending && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {pendingFiles.map((_, index) => (
            <div
              key={previewUrls[index]}
              className="relative aspect-square overflow-hidden rounded-xl border border-accent/30 bg-zinc-100"
            >
              <Image
                src={previewUrls[index]}
                alt={`New photo ${index + 1}`}
                fill
                unoptimized
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => removePending(index)}
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900/70 text-white"
                aria-label="Remove photo"
              >
                <X size={11} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!hasExisting && !hasPending && (
        <div className="mb-3 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-6">
          <Camera size={22} className="text-zinc-300" />
          <p className="text-xs text-zinc-400">No room photos yet</p>
        </div>
      )}

      {error && (
        <p className="mb-3 text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {saved && (
        <div className="mb-3 flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          <CheckCircle size={14} weight="fill" />
          Room photos saved.
        </div>
      )}

      {canUpload && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={handleFileChange}
          />

          <div className="flex gap-2">
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isPending || optimizing}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-sm font-semibold text-foreground disabled:opacity-50 active:scale-[0.97]"
              >
                <Plus size={14} weight="bold" />
                {hasExisting || hasPending ? "Add More" : "Add Photos"}
                {remaining < MAX_PHOTOS && (
                  <span className="text-xs font-normal text-zinc-400">
                    ({remaining} left)
                  </span>
                )}
              </button>
            )}

            {hasPending && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending || optimizing}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50 active:scale-[0.97]"
              >
                {optimizing ? "Optimizing…" : isPending ? "Saving…" : "Save Photos"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
