"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
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
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totalSaved = existingPhotos.length + (saved ? pendingFiles.length : 0);
  const remaining = MAX_PHOTOS - existingPhotos.length - pendingFiles.length;
  const hasExisting = existingPhotos.length > 0;
  const hasPending = pendingFiles.length > 0;

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

      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      setPendingFiles([]);
      setPreviewUrls([]);
      setSaved(true);
    });
  };

  // Only show the trigger button if: canUpload, or there are existing photos (read-only view)
  if (!canUpload && existingPhotos.length === 0) return null;

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-white py-3.5 text-sm font-semibold text-foreground active:scale-[0.98] transition-transform"
      >
        <Images size={16} className="text-accent" />
        {canUpload
          ? totalSaved > 0
            ? `Room Photos (${totalSaved})`
            : "Add Room Photos"
          : `View Room Photos (${existingPhotos.length})`}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-zinc-950/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[2rem] border-t border-border bg-white shadow-2xl"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-zinc-200" />
              </div>

              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/8 text-accent">
                  <Images size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">Room Photos</p>
                  <p className="text-[11px] text-zinc-400">
                    {canUpload ? "Upload up to 3 photos of the finished room." : "Finished room photos."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-zinc-400 hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-5 py-5 flex flex-col gap-4 overflow-y-auto max-h-[70dvh]">
                {/* Photo grid — saved + pending + add tile */}
                {(hasExisting || hasPending || canUpload) && (
                  <div className="grid grid-cols-3 gap-2">
                    {existingPhotos.map((photo) => (
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
                      </a>
                    ))}

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
                        >
                          <X size={11} weight="bold" />
                        </button>
                      </div>
                    ))}

                    {canUpload && remaining > 0 && (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={isPending || optimizing}
                        className="aspect-square flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 hover:border-accent/40 hover:text-accent disabled:opacity-50 active:scale-[0.97] transition-colors"
                      >
                        <Plus size={20} weight="bold" />
                        <span className="text-[10px] font-semibold">Add</span>
                      </button>
                    )}

                    {!hasExisting && !hasPending && !canUpload && (
                      <div className="col-span-3 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 py-10">
                        <Camera size={26} className="text-zinc-300" />
                        <p className="text-sm text-zinc-400">No room photos yet</p>
                      </div>
                    )}
                  </div>
                )}

                {saved && (
                  <div className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
                    <CheckCircle size={15} weight="fill" />
                    Photos saved successfully.
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                    {error}
                  </p>
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

                    {hasPending && (
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={isPending || optimizing}
                        className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-accent py-3 text-sm font-semibold text-white disabled:opacity-50 active:scale-[0.97]"
                      >
                        {optimizing ? "Optimizing…" : isPending ? "Saving…" : "Save Photos"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
