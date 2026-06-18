"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Images, Plus, Spinner, X } from "@phosphor-icons/react";
import { uploadRoomQuickPhotos, deleteWindowStagePhoto } from "@/app/actions/fsr-data";
import type { UnitStageMediaItem } from "@/lib/server-data";
import type { Room } from "@/lib/types";
import {
  useUnitMediaAndMilestones,
  upsertUnitStageMediaItem,
  removeUnitStageMediaItem,
} from "@/lib/use-unit-supplemental";
import { compressImageForUpload, validateUploadImage } from "@/lib/image-upload";
import { PhotoSourcePicker } from "@/components/ui/photo-source-picker";
import { Button } from "@/components/ui/button";

interface UnitQuickPhotosProps {
  unitId: string;
  rooms: Room[];
  canUpload?: boolean;
}

/**
 * Fast per-room photo capture for the field. Opens a single popup with one card per
 * room; photos attach to the room (not a window) and never affect window status. See
 * uploadRoomQuickPhotos in src/app/actions/fsr-data/photos.ts.
 */
export function UnitQuickPhotos({ unitId, rooms, canUpload = true }: UnitQuickPhotosProps) {
  const { mediaItems } = useUnitMediaAndMilestones(unitId);
  const [open, setOpen] = useState(false);
  const [pickerRoomId, setPickerRoomId] = useState<string | null>(null);
  // Photos uploaded this session, so the grid updates immediately without a refetch.
  const [localPhotos, setLocalPhotos] = useState<UnitStageMediaItem[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [uploadingRoomId, setUploadingRoomId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  // Merge server + local quick photos, dedupe by id, drop deleted, group by room.
  const photosByRoom = useMemo(() => {
    const byId = new Map<string, UnitStageMediaItem>();
    for (const item of mediaItems) {
      if (item.uploadKind === "room_quick_photo" && !deletedIds.has(item.id)) {
        byId.set(item.id, item);
      }
    }
    for (const item of localPhotos) {
      if (!deletedIds.has(item.id)) byId.set(item.id, item);
    }
    const grouped = new Map<string, UnitStageMediaItem[]>();
    for (const item of byId.values()) {
      if (!item.roomId) continue;
      const list = grouped.get(item.roomId) ?? [];
      list.push(item);
      grouped.set(item.roomId, list);
    }
    return grouped;
  }, [mediaItems, localPhotos, deletedIds]);

  const totalCount = useMemo(
    () => [...photosByRoom.values()].reduce((sum, list) => sum + list.length, 0),
    [photosByRoom]
  );

  const handleFileChange = (files: FileList | null) => {
    setError("");
    const roomId = pickerRoomId;
    const selected = Array.from(files ?? []);
    if (!roomId || selected.length === 0) return;

    for (const file of selected) {
      const validationError = validateUploadImage(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setUploadingRoomId(roomId);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("unitId", unitId);
        fd.set("roomId", roomId);
        for (const file of selected) {
          const compressed = await compressImageForUpload(file);
          fd.append("photos", compressed, compressed.name);
        }

        const result = await uploadRoomQuickPhotos(fd);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setLocalPhotos((prev) => [...prev, ...result.photos]);
        result.photos.forEach((photo) => upsertUnitStageMediaItem(unitId, photo));
      } finally {
        setUploadingRoomId(null);
      }
    });
  };

  const handleDelete = (photo: UnitStageMediaItem) => {
    setError("");
    setDeletingId(photo.id);
    startTransition(async () => {
      try {
        const result = await deleteWindowStagePhoto(photo.id, unitId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDeletedIds((prev) => new Set([...prev, photo.id]));
        setLocalPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        removeUnitStageMediaItem(unitId, photo.id);
      } finally {
        setDeletingId(null);
      }
    });
  };

  return (
    <>
      <Button variant="secondary" fullWidth size="lg" onClick={() => setOpen(true)}>
        <Images size={18} className="text-accent" />
        {totalCount > 0 ? `View / Add Photos (${totalCount})` : "View / Add Photos"}
      </Button>

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
              className="fixed inset-x-4 top-1/2 z-[60] flex max-h-[82dvh] flex-col -translate-y-1/2 rounded-3xl border border-border bg-white shadow-2xl max-w-lg mx-auto"
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/8 text-accent">
                  <Images size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">Unit Photos</p>
                  <p className="text-[11px] text-zinc-400">
                    {canUpload
                      ? "Snap or add photos to any room — no need to pick a window."
                      : "Photos uploaded for this unit's rooms."}
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

              <div className="px-5 py-5 flex flex-col gap-5 overflow-y-auto">
                {canUpload && (
                  <PhotoSourcePicker
                    open={pickerRoomId !== null}
                    multiple
                    onClose={() => setPickerRoomId(null)}
                    onChange={handleFileChange}
                  />
                )}

                {rooms.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 py-10">
                    <Camera size={26} className="text-zinc-300" />
                    <p className="text-sm text-zinc-400">No rooms yet</p>
                  </div>
                )}

                {rooms.map((room) => {
                  const roomPhotos = photosByRoom.get(room.id) ?? [];
                  const uploading = uploadingRoomId === room.id;
                  return (
                    <div key={room.id} className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-semibold text-foreground">{room.name}</p>
                        {roomPhotos.length > 0 && (
                          <span className="text-[11px] text-zinc-400">
                            {roomPhotos.length} photo{roomPhotos.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {roomPhotos.map((photo) => (
                          <div
                            key={photo.id}
                            className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-zinc-100"
                          >
                            <a
                              href={photo.publicUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block absolute inset-0"
                            >
                              <Image
                                src={photo.publicUrl}
                                alt={photo.label ?? "Room photo"}
                                fill
                                sizes="(max-width: 640px) 30vw, 160px"
                                unoptimized={photo.publicUrl.startsWith("blob:")}
                                className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                              />
                            </a>
                            {canUpload && (
                              <button
                                type="button"
                                onClick={() => handleDelete(photo)}
                                disabled={deletingId === photo.id}
                                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-50"
                              >
                                {deletingId === photo.id ? (
                                  <Spinner size={12} className="animate-spin" />
                                ) : (
                                  <X size={12} weight="bold" />
                                )}
                              </button>
                            )}
                          </div>
                        ))}

                        {uploading && (
                          <div className="aspect-square flex flex-col items-center justify-center gap-1 rounded-xl border border-accent/30 bg-accent/5">
                            <Spinner size={22} className="text-accent animate-spin" />
                            <span className="text-[10px] font-semibold text-accent">Uploading…</span>
                          </div>
                        )}

                        {canUpload && !uploading && (
                          <button
                            type="button"
                            onClick={() => setPickerRoomId(room.id)}
                            className="aspect-square flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 hover:border-accent/40 hover:text-accent active:scale-[0.97] transition-colors"
                          >
                            <Plus size={20} weight="bold" />
                            <span className="text-[10px] font-semibold">Add</span>
                          </button>
                        )}

                        {!canUpload && roomPhotos.length === 0 && (
                          <div className="col-span-3 flex items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-6 text-[12px] text-zinc-400">
                            No photos
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

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
