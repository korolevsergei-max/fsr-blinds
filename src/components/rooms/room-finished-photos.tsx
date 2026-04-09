"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CheckCircle, Images, Plus, Spinner, X } from "@phosphor-icons/react";
import { uploadRoomFinishedPhotos } from "@/app/actions/fsr-data";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { compressImageForUpload, validateUploadImage } from "@/lib/image-upload";
import { PhotoSourcePicker } from "@/components/ui/photo-source-picker";

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
  const [pickerOpen, setPickerOpen] = useState(false);
  // Locally track newly uploaded photos so the grid updates immediately without a full page reload
  const [localPhotos, setLocalPhotos] = useState<UnitStageMediaItem[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();

  const allPhotos = [...existingPhotos, ...localPhotos];
  const remaining = MAX_PHOTOS - allPhotos.length;

  const handleFileChange = (files: FileList | null) => {
    setError("");
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;

    const available = MAX_PHOTOS - allPhotos.length;
    const toUpload = selected.slice(0, available);

    for (const file of toUpload) {
      const validationError = validateUploadImage(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setUploading(true);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("unitId", unitId);
        fd.set("roomId", roomId);

        const previews: string[] = [];
        for (const file of toUpload) {
          const compressed = await compressImageForUpload(file);
          fd.append("photos", compressed, compressed.name);
          previews.push(URL.createObjectURL(file));
        }

        const result = await uploadRoomFinishedPhotos(fd);
        if (!result.ok) {
          previews.forEach((u) => URL.revokeObjectURL(u));
          setError(result.error);
          return;
        }

        // Add optimistic local entries so the grid updates immediately
        const now = new Date().toISOString();
        setLocalPhotos((prev) => [
          ...prev,
          ...previews.map((url, i) => ({
            id: `local-${Date.now()}-${i}`,
            publicUrl: url,
            label: toUpload.length === 1 ? "Finished room" : `Finished room (${i + 1}/${toUpload.length})`,
            unitId,
            roomId,
            roomName: null,
            windowId: null,
            windowLabel: null,
            uploadKind: "room_finished_photo",
            stage: "installed_pending_approval" as const,
            createdAt: now,
          })),
        ]);
      } finally {
        setUploading(false);
      }
    });
  };

  if (!canUpload && allPhotos.length === 0) return null;

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
          ? allPhotos.length > 0
            ? `Room Photos (${allPhotos.length})`
            : "Add Room Photos"
          : `View Room Photos (${allPhotos.length})`}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-zinc-950/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-4 top-1/2 z-[60] flex flex-col -translate-y-1/2 rounded-3xl border border-border bg-white shadow-2xl max-w-lg mx-auto"
            >
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

              <div className="px-5 py-5 flex flex-col gap-4 overflow-y-auto max-h-[60dvh]">
                {canUpload && (
                  <PhotoSourcePicker
                    open={pickerOpen}
                    multiple
                    onClose={() => setPickerOpen(false)}
                    onChange={handleFileChange}
                  />
                )}

                {/* Photo grid */}
                <div className="grid grid-cols-3 gap-2">
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
                      {photo.id.startsWith("local-") && (
                        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/20">
                          <CheckCircle size={20} weight="fill" className="text-white" />
                        </div>
                      )}
                    </a>
                  ))}

                  {/* Uploading spinner tile */}
                  {uploading && (
                    <div className="aspect-square flex flex-col items-center justify-center gap-1 rounded-xl border border-accent/30 bg-accent/5">
                      <Spinner size={22} className="text-accent animate-spin" />
                      <span className="text-[10px] font-semibold text-accent">Uploading…</span>
                    </div>
                  )}

                  {/* Add tile */}
                  {canUpload && remaining > 0 && !uploading && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="aspect-square flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 hover:border-accent/40 hover:text-accent active:scale-[0.97] transition-colors"
                    >
                      <Plus size={20} weight="bold" />
                      <span className="text-[10px] font-semibold">Add</span>
                    </button>
                  )}

                  {/* Empty state when no photos and read-only */}
                  {allPhotos.length === 0 && !uploading && !canUpload && (
                    <div className="col-span-3 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 py-10">
                      <Camera size={26} className="text-zinc-300" />
                      <p className="text-sm text-zinc-400">No room photos yet</p>
                    </div>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                    {error}
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
