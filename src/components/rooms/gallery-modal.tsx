"use client";

import Image from "next/image";

import { Camera, Images, User, X } from "@phosphor-icons/react";
import { STAGE_META, type GalleryItem, type WindowStageKey } from "./gallery-shared";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function GalleryModal({
  galleryWindow,
  items,
  onClose,
}: {
  galleryWindow: { label: string } | null;
  items: GalleryItem[];
  onClose: () => void;
}) {
  return (
    <>
      {galleryWindow && (
        <>
          <button
            type="button"
            aria-label="Close window image gallery"
            className="animate-fade-in fixed inset-0 z-40 bg-zinc-950/45"
            onClick={onClose}
          />
          <div
            className="animate-fade-scale fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col overflow-hidden rounded-t-[2rem] border border-border bg-white shadow-2xl sm:inset-6 sm:mx-auto sm:max-w-5xl sm:rounded-[2rem]"
          >
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/8 text-accent">
                <Images size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight text-foreground">
                  {galleryWindow.label} Images
                </p>
                <p className="text-xs text-muted">
                  Review every saved photo for this window across all stages.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close window image gallery"
                onClick={onClose}
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
                  <p className="text-sm font-semibold text-foreground">No images saved yet</p>
                  <p className="max-w-sm text-sm leading-relaxed text-muted">
                    When bracketing, measured, or installed photos are uploaded for this window,
                    they will appear here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-5 pb-3">
                  {(["pre", "bracketed", "installed"] as WindowStageKey[]).map((stage) => {
                    const stageItems = items.filter((item) => item.stage === stage);
                    if (stageItems.length === 0) return null;

                    return (
                      <section
                        key={stage}
                        className="overflow-hidden rounded-[1.75rem] border border-border bg-white"
                      >
                        <div className="border-b border-border bg-surface px-4 py-3.5">
                          <p className="text-sm font-bold text-foreground">
                            {STAGE_META[stage].label}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {stageItems.length} image{stageItems.length !== 1 ? "s" : ""} saved
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-3">
                          {stageItems.map((item) => (
                            <a
                              key={item.key}
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="group overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-zinc-300"
                            >
                              <div className="relative aspect-square overflow-hidden bg-zinc-100">
                                <Image
                                  src={item.url}
                                  alt={item.title}
                                  fill
                                  sizes="(max-width: 640px) 50vw, 240px"
                                  unoptimized={item.url.startsWith("blob:")}
                                  className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                />
                                {/* Uploader overlay */}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 pointer-events-none">
                                  <p className="flex items-center gap-1 text-[10px] font-medium text-white/90 leading-tight">
                                    <User size={10} />
                                    {item.uploadedByName ?? "Unknown"}
                                    {item.uploadedByRole && (
                                      <span className="capitalize opacity-70">
                                        · {item.uploadedByRole}
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[10px] text-white/60 mt-0.5">
                                    {item.createdAt
                                      ? formatRelativeTime(item.createdAt)
                                      : "Existing photo"}
                                  </p>
                                </div>
                              </div>
                            </a>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
