"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CaretLeft,
  CaretRight,
  ImageSquare,
  Images,
  X,
} from "@phosphor-icons/react";
import type { Room, Window } from "@/lib/types";
import type { UnitMilestoneCoverage } from "@/lib/unit-milestones";
import type { UnitStageMediaItem } from "@/lib/server-data";
import {
  buildUnitMediaOverview,
  type UnitEvidencePhoto,
} from "@/lib/unit-media";
import { Button } from "@/components/ui/button";
import { UnitStageSummaryGrid } from "@/components/unit-stage-summary-grid";

type ActiveImageState = {
  photos: UnitEvidencePhoto[];
  index: number;
};

export function UnitStageMediaViewer({
  items,
  milestones,
  rooms,
  windows,
  triggerClassName = "",
}: {
  items: UnitStageMediaItem[];
  milestones: UnitMilestoneCoverage;
  rooms: Room[];
  windows: Window[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeImage, setActiveImage] = useState<ActiveImageState | null>(null);

  const overview = useMemo(
    () => buildUnitMediaOverview({ items, rooms, windows }),
    [items, rooms, windows]
  );

  const visiblePhotoCount = overview.summary.totalDisplayablePhotos;
  const activePhoto = activeImage ? activeImage.photos[activeImage.index] : null;
  const canStep = activeImage ? activeImage.photos.length > 1 : false;

  const closeViewer = () => {
    setActiveImage(null);
    setOpen(false);
  };

  const stepLightbox = (direction: -1 | 1) => {
    setActiveImage((current) => {
      if (!current) return current;
      const nextIndex =
        (current.index + direction + current.photos.length) % current.photos.length;
      return { ...current, index: nextIndex };
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        <Images size={15} />
        View Images
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
          {visiblePhotoCount}
        </span>
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close image viewer"
              className="fixed inset-0 z-40 bg-zinc-950/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeViewer}
            />

            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col overflow-hidden rounded-t-[2rem] border border-border bg-white shadow-2xl sm:inset-6 sm:mx-auto sm:max-w-6xl sm:rounded-[2rem]"
            >
              <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/8 text-accent">
                  <ImageSquare size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-tight text-foreground">
                    Unit photo evidence
                  </p>
                  <p className="text-xs text-muted">
                    Audit measurement, post-bracketing, installed, and room-finished proof.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close image viewer"
                  onClick={closeViewer}
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-zinc-500 transition-colors hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {overview.summary.totalWindows === 0 && overview.summary.roomFinishedPhotos === 0 ? (
                  <div className="flex min-h-full flex-col items-center justify-center gap-3 rounded-[1.75rem] border border-dashed border-border bg-surface px-6 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
                      <Camera size={28} />
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      No photo evidence yet
                    </p>
                    <p className="max-w-sm text-sm leading-relaxed text-muted">
                      Measurement, post-bracketing, installation, and room-finished photos will appear here once this unit starts moving through the workflow.
                    </p>
                  </div>
                ) : (
                  <div className="pb-3">
                    <UnitStageSummaryGrid
                      overview={overview}
                      measuredWindowsCount={milestones.measuredCount}
                      onOpenLightbox={(photos, index) => setActiveImage({ photos, index })}
                    />
                  </div>
                )}
              </div>

              <AnimatePresence>
                {activePhoto && activeImage && (
                  <>
                    <motion.button
                      type="button"
                      aria-label="Close photo preview"
                      className="fixed inset-0 z-[60] bg-zinc-950/80"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setActiveImage(null)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.18 }}
                      className="fixed inset-4 z-[70] flex flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 sm:inset-8"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-semibold text-white">
                            {activePhoto.title}
                          </p>
                          <p className="mt-1 text-xs text-zinc-400">
                            {activePhoto.caption}
                            {canStep ? ` • ${activeImage.index + 1} of ${activeImage.photos.length}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {canStep && (
                            <>
                              <button
                                type="button"
                                aria-label="Previous photo"
                                onClick={() => stepLightbox(-1)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 text-zinc-200"
                              >
                                <CaretLeft size={16} />
                              </button>
                              <button
                                type="button"
                                aria-label="Next photo"
                                onClick={() => stepLightbox(1)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 text-zinc-200"
                              >
                                <CaretRight size={16} />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            aria-label="Close photo preview"
                            onClick={() => setActiveImage(null)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 text-zinc-200"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="relative flex-1 bg-black">
                        <Image
                          src={activePhoto.publicUrl}
                          alt={activePhoto.title}
                          fill
                          unoptimized
                          sizes="100vw"
                          className="object-contain"
                        />
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
