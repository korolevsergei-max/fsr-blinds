"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  ImageSquare,
  Images,
  X,
} from "@phosphor-icons/react";
import {
  UNIT_PHOTO_STAGES,
  UNIT_PHOTO_STAGE_HELPERS,
  UNIT_PHOTO_STAGE_LABELS,
} from "@/lib/types";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { Button } from "@/components/ui/button";
import { UnitStageSummaryGrid } from "@/components/unit-stage-summary-grid";

export function UnitStageMediaViewer({
  items,
  triggerClassName = "",
}: {
  items: UnitStageMediaItem[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeImage, setActiveImage] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const groupedItems = useMemo(() => {
    const groups = new Map<typeof UNIT_PHOTO_STAGES[number], UnitStageMediaItem[]>();
    for (const stage of UNIT_PHOTO_STAGES) {
      groups.set(
        stage,
        items
          .filter((item) => item.stage === stage)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
      );
    }
    return groups;
  }, [items]);

  const stagesWithPhotos = UNIT_PHOTO_STAGES.filter(
    (stage) => (groupedItems.get(stage) ?? []).length > 0
  );
  const emptyStages = UNIT_PHOTO_STAGES.filter(
    (stage) => (groupedItems.get(stage) ?? []).length === 0
  );
  const missingStages = emptyStages.filter((stage) => stage !== "scheduled_bracketing");

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
          {items.length}
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
              onClick={() => setOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col overflow-hidden rounded-t-[2rem] border border-border bg-white shadow-2xl sm:inset-6 sm:mx-auto sm:max-w-5xl sm:rounded-[2rem]"
            >
              <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/8 text-accent">
                  <ImageSquare size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground tracking-tight">
                    Unit Images
                  </p>
                  <p className="text-xs text-muted">
                    Compare before, measured, and installed photo sets.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close image viewer"
                  onClick={() => setOpen(false)}
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-zinc-500 transition-colors hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {items.length === 0 ? (
                  <div className="flex min-h-full flex-col items-center justify-center gap-3 rounded-[1.75rem] border border-dashed border-border bg-surface px-6 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
                      <Camera size={28} />
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      No stage photos yet
                    </p>
                    <p className="max-w-sm text-sm leading-relaxed text-muted">
                      Photos added during scheduled bracketing, measurement, and installation
                      will appear here for quick comparison.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6 pb-3">
                    <UnitStageSummaryGrid items={items} />

                    {missingStages.length > 0 && (
                      <section className="overflow-hidden rounded-[1.75rem] border border-border bg-white">
                        <div className="border-b border-border bg-surface px-4 py-3.5">
                          <p className="text-sm font-bold text-foreground">Missing Photo Sets</p>
                          <p className="mt-1 text-xs text-muted">
                            These stages do not have photos yet.
                          </p>
                        </div>
                        <div className="px-4 py-4 flex flex-wrap gap-2">
                          {missingStages.map((stage) => (
                            <span
                              key={stage}
                              className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600"
                            >
                              {UNIT_PHOTO_STAGE_LABELS[stage]}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>

              <AnimatePresence>
                {activeImage && (
                  <>
                    <motion.button
                      type="button"
                      aria-label="Close photo preview"
                      className="fixed inset-0 z-[60] bg-zinc-950/75"
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
                      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
                        <p className="line-clamp-1 text-sm font-semibold text-white">
                          {activeImage.title}
                        </p>
                        <button
                          type="button"
                          aria-label="Close photo preview"
                          onClick={() => setActiveImage(null)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 text-zinc-200"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="relative flex-1 bg-black">
                        <Image
                          src={activeImage.url}
                          alt={activeImage.title}
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
