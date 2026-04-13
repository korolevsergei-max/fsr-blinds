"use client";

import Image from "next/image";
import {
  Camera,
  CheckCircle,
  Images,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  UnitEvidencePhoto,
  UnitEvidenceRoom,
  UnitEvidenceWindow,
  UnitMediaOverview,
} from "@/lib/unit-media";

function formatPhotoDate(createdAt: string | null): string {
  if (!createdAt) return "Legacy photo";
  return new Date(createdAt).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="text-[11px] font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{helper}</p>
    </div>
  );
}

function ThumbnailGrid({
  photos,
  emptyMessage,
  onOpenLightbox,
}: {
  photos: UnitEvidencePhoto[];
  emptyMessage: string;
  onOpenLightbox: (photos: UnitEvidencePhoto[], index: number) => void;
}) {
  if (photos.length === 0) {
    return (
      <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-[11px] text-zinc-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo, index) => (
        <button
          key={photo.id}
          type="button"
          onClick={() => onOpenLightbox(photos, index)}
          className="group overflow-hidden rounded-2xl border border-border bg-white text-left transition-colors hover:border-zinc-300"
        >
          <div className="relative aspect-square overflow-hidden bg-zinc-100">
            <Image
              src={photo.publicUrl}
              alt={photo.title}
              fill
              sizes="(max-width: 640px) 50vw, 220px"
              unoptimized={photo.publicUrl.startsWith("blob:")}
              className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            />
          </div>
          <div className="px-3 py-2.5">
            <p className="line-clamp-1 text-xs font-semibold text-foreground">{photo.title}</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted">{photo.caption}</p>
              <p className="text-[11px] text-zinc-400">{formatPhotoDate(photo.createdAt)}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function WindowEvidenceRow({
  title,
  helper,
  isComplete,
  photos,
  emptyMessage,
  onOpenLightbox,
}: {
  title: string;
  helper: string;
  isComplete: boolean;
  photos: UnitEvidencePhoto[];
  emptyMessage: string;
  onOpenLightbox: (photos: UnitEvidencePhoto[], index: number) => void;
}) {
  const statusTone =
    photos.length > 0
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : isComplete
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-zinc-500 bg-zinc-50 border-zinc-200";
  const statusLabel =
    photos.length > 0
      ? `${photos.length} saved`
      : isComplete
        ? "Complete, no photo"
        : "Missing";

  return (
    <section className="rounded-2xl border border-border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted">{helper}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone}`}>
          {statusLabel}
        </span>
      </div>
      <ThumbnailGrid
        photos={photos}
        emptyMessage={emptyMessage}
        onOpenLightbox={onOpenLightbox}
      />
    </section>
  );
}

function RoomHeader({ room }: { room: UnitEvidenceRoom }) {
  return (
    <div className="border-b border-border bg-surface px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold tracking-tight text-foreground">{room.roomName}</p>
          <p className="mt-1 text-xs text-muted">
            {room.counts.totalWindows} window{room.counts.totalWindows !== 1 ? "s" : ""} in this room
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
            {room.counts.measuredWindows} measured
          </span>
          <span className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
            {room.counts.postBracketingEvidenceWindows} post-bracketing
          </span>
          <span className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
            {room.counts.installedEvidenceWindows} installed
          </span>
          {room.roomFinishedPhotos.length > 0 && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              {room.roomFinishedPhotos.length} room photo{room.roomFinishedPhotos.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function RoomFinishedSection({
  photos,
  onOpenLightbox,
}: {
  photos: UnitEvidencePhoto[];
  onOpenLightbox: (photos: UnitEvidencePhoto[], index: number) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Room-finished photos</p>
          <p className="mt-1 text-xs text-muted">
            Wide-angle evidence for the completed room after installation.
          </p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          {photos.length} saved
        </span>
      </div>
      <ThumbnailGrid
        photos={photos}
        emptyMessage="No room-finished photos saved yet."
        onOpenLightbox={onOpenLightbox}
      />
    </section>
  );
}

function WindowCard({
  windowGroup,
  onOpenLightbox,
}: {
  windowGroup: UnitEvidenceWindow;
  onOpenLightbox: (photos: UnitEvidencePhoto[], index: number) => void;
}) {
  const missingNotes: string[] = [];
  if (windowGroup.measurementPhotos.length === 0) {
    missingNotes.push(windowGroup.measured ? "Measured without photo" : "Measurement photo missing");
  }
  if (windowGroup.postBracketingPhotos.length === 0) {
    missingNotes.push(
      windowGroup.bracketed ? "Post-bracketing complete without photo" : "No post-bracketing photo yet"
    );
  }
  if (windowGroup.installedPhotos.length === 0) {
    missingNotes.push(
      windowGroup.installed ? "Installed without photo" : "No installed photo yet"
    );
  }

  return (
    <article className="rounded-[1.6rem] border border-border bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold tracking-tight text-foreground">
            {windowGroup.windowName}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
            {windowGroup.blindType}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {windowGroup.measurementPhotos.length > 0 ||
          windowGroup.postBracketingPhotos.length > 0 ||
          windowGroup.installedPhotos.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <CheckCircle size={13} weight="fill" />
              Evidence saved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-500">
              <Camera size={13} />
              No photos yet
            </span>
          )}
        </div>
      </div>

      {missingNotes.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {missingNotes.map((note) => (
            <span
              key={`${windowGroup.windowId}-${note}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
            >
              <WarningCircle size={13} weight="fill" />
              {note}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <WindowEvidenceRow
          title="Measurement / before"
          helper="Pre-bracketing evidence, including legacy window photos."
          isComplete={windowGroup.measured}
          photos={windowGroup.measurementPhotos}
          emptyMessage={
            windowGroup.measured
              ? "Window is marked measured, but no measurement photo is saved."
              : "No measurement photo saved yet."
          }
          onOpenLightbox={onOpenLightbox}
        />
        <WindowEvidenceRow
          title="Post-bracketing"
          helper="Evidence captured after brackets are installed or checked."
          isComplete={windowGroup.bracketed}
          photos={windowGroup.postBracketingPhotos}
          emptyMessage={
            windowGroup.bracketed
              ? "Window is marked bracketed, but no post-bracketing photo is saved."
              : "No post-bracketing photo saved yet."
          }
          onOpenLightbox={onOpenLightbox}
        />
        <WindowEvidenceRow
          title="Installed"
          helper="Final blind installation evidence for this window."
          isComplete={windowGroup.installed}
          photos={windowGroup.installedPhotos}
          emptyMessage={
            windowGroup.installed
              ? "Window is marked installed, but no installed photo is saved."
              : "No installed photo saved yet."
          }
          onOpenLightbox={onOpenLightbox}
        />
      </div>
    </article>
  );
}

export function UnitStageSummaryGrid({
  overview,
  measuredWindowsCount,
  onOpenLightbox,
}: {
  overview: UnitMediaOverview;
  measuredWindowsCount: number;
  onOpenLightbox: (photos: UnitEvidencePhoto[], index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Measured windows"
          value={measuredWindowsCount}
          helper={`${overview.summary.measurementEvidenceWindows} with a saved photo`}
        />
        <MetricCard
          label="Post-bracketing evidence"
          value={overview.summary.postBracketingEvidenceWindows}
          helper="Windows with saved post-bracketing proof"
        />
        <MetricCard
          label="Installed evidence"
          value={overview.summary.installedEvidenceWindows}
          helper="Windows with saved installation proof"
        />
        <MetricCard
          label="Room-finished photos"
          value={overview.summary.roomFinishedPhotos}
          helper="Wide room-level completion photos"
        />
      </div>

      {overview.rooms.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed border-border bg-surface px-6 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-zinc-400">
            <Images size={28} />
          </div>
          <p className="mt-4 text-sm font-semibold text-foreground">No rooms or windows to audit yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Once windows are added to this unit, their measurement, post-bracketing, and installation evidence will show here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {overview.rooms.map((room) => (
            <section
              key={room.roomId}
              className="overflow-hidden rounded-[1.9rem] border border-border bg-white"
            >
              <RoomHeader room={room} />
              <div className="flex flex-col gap-4 p-4">
                {room.roomFinishedPhotos.length > 0 && (
                  <RoomFinishedSection
                    photos={room.roomFinishedPhotos}
                    onOpenLightbox={onOpenLightbox}
                  />
                )}

                {room.windows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
                    No windows have been added to this room yet.
                  </div>
                ) : (
                  room.windows.map((windowGroup) => (
                    <WindowCard
                      key={windowGroup.windowId}
                      windowGroup={windowGroup}
                      onOpenLightbox={onOpenLightbox}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
