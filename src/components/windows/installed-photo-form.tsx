"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { Camera, CheckCircle, UploadSimple } from "@phosphor-icons/react";
import { uploadWindowInstalledPhoto } from "@/app/actions/fsr-data";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import type { RiskFlag, UnitStatus } from "@/lib/types";
import { canUploadInstallationPhotos } from "@/lib/unit-install-guard";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { WindowStageNav } from "@/components/window-stage-nav";
import { WindowRiskNotesFields } from "@/components/windows/window-risk-notes-fields";
import { compressImageForUpload, validateUploadImage } from "@/lib/image-upload";

export function InstalledPhotoForm({
  data,
  mediaItems,
  routeBasePath = "/installer/units",
}: {
  data: AppDataset;
  mediaItems: UnitStageMediaItem[];
  routeBasePath?: "/installer/units" | "/scheduler/units";
}) {
  const { id, roomId, windowId } = useParams<{
    id: string;
    roomId: string;
    windowId: string;
  }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const unit = data.units.find((u) => u.id === id);
  const room = data.rooms.find((r) => r.id === roomId);
  const windowItem = data.windows.find((w) => w.id === windowId && w.roomId === roomId);
  const existingInstalled = mediaItems.find(
    (item) =>
      item.windowId === windowId &&
      item.stage === "installed_pending_approval" &&
      item.uploadKind === "window_measure"
  );

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    existingInstalled?.publicUrl ?? null
  );
  const [photoOrientation, setPhotoOrientation] = useState<
    "portrait" | "landscape" | "square"
  >("landscape");
  const [riskFlag, setRiskFlag] = useState<RiskFlag>(windowItem?.riskFlag ?? "green");
  const [notes, setNotes] = useState(windowItem?.notes ?? "");
  const [notesError, setNotesError] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [optimizingPhoto, setOptimizingPhoto] = useState(false);

  if (!unit || !room || !windowItem) {
    return <div className="p-6 text-center text-muted">Window not found</div>;
  }

  const installPhotosBlocked =
    !existingInstalled &&
    !canUploadInstallationPhotos(unit.status as UnitStatus);

  useEffect(() => {
    if (!photoPreview) return;
    const probe = new window.Image();
    probe.onload = () => {
      if (probe.naturalHeight > probe.naturalWidth) {
        setPhotoOrientation("portrait");
      } else if (probe.naturalHeight < probe.naturalWidth) {
        setPhotoOrientation("landscape");
      } else {
        setPhotoOrientation("square");
      }
    };
    probe.src = photoPreview;
  }, [photoPreview]);

  const onFileChange = (file: File | null) => {
    setError("");
    if (file) {
      const validationError = validateUploadImage(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setPhotoFile(file);
    setPhotoPreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError("");
    setNotesError("");

    if (installPhotosBlocked) {
      setError(
        "Both measurements and bracketing photos must be completed for every window before installation photos can be uploaded."
      );
      return;
    }

    if (!photoFile) {
      setError("Installed photo is required.");
      return;
    }
    if ((riskFlag === "yellow" || riskFlag === "red") && !notes.trim()) {
      setNotesError("Notes are required for yellow or red risk.");
      return;
    }

    startTransition(async () => {
      const validationError = validateUploadImage(photoFile);
      if (validationError) {
        setError(validationError);
        return;
      }
      setOptimizingPhoto(true);
      let compressedPhoto: File;
      try {
        compressedPhoto = await compressImageForUpload(photoFile);
      } finally {
        setOptimizingPhoto(false);
      }
      const fd = new FormData();
      fd.set("unitId", unit.id);
      fd.set("roomId", room.id);
      fd.set("windowId", windowItem.id);
      fd.set("photo", compressedPhoto, compressedPhoto.name);
      fd.set("riskFlag", riskFlag);
      fd.set("notes", notes);

      const result = await uploadWindowInstalledPhoto(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`${routeBasePath}/${id}/rooms/${roomId}`);
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PageHeader
        title="Installed Photo"
        subtitle={`${windowItem.label} • ${room.name}`}
        backHref={`${routeBasePath}/${id}/rooms/${roomId}/windows/new?edit=${windowItem.id}`}
      />

      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-6 px-5 py-5">
        <WindowStageNav
          unitId={id}
          roomId={roomId}
          windowId={windowItem.id}
          active="installed"
          routeBasePath={routeBasePath}
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />

        <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-xs text-zinc-600">
          Upload one installed/completion photo for this window.
        </div>

        {installPhotosBlocked && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Both measurements and bracketing photos must be completed for every window in this unit
            before installation photos can be uploaded.
          </div>
        )}

        {error && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div>
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            Installed Photo
            <span className="ml-1 text-red-500">*</span>
          </h2>
          {photoPreview ? (
            <button
              type="button"
              disabled={installPhotosBlocked}
              onClick={() => fileRef.current?.click()}
              className="relative w-full overflow-hidden rounded-2xl border border-border text-left disabled:pointer-events-none disabled:opacity-50"
            >
              <img
                src={photoPreview}
                alt="Installed preview"
                className={`w-full bg-surface ${
                  photoOrientation === "portrait"
                    ? "max-h-[70dvh] object-contain"
                    : photoOrientation === "square"
                      ? "aspect-square object-cover"
                      : "aspect-[16/9] object-cover"
                }`}
              />
              <div className="absolute right-3 top-3">
                <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white">
                  <CheckCircle size={14} weight="fill" />
                  {photoFile ? "New photo" : "Saved - tap to replace"}
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              disabled={installPhotosBlocked}
              onClick={() => fileRef.current?.click()}
              className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 bg-white transition-colors active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
            >
              <Camera size={28} className="text-zinc-400" />
              <span className="text-sm font-medium text-zinc-500">Tap to take or choose a photo</span>
            </button>
          )}
        </div>

        {existingInstalled && (
          <p className="text-xs text-zinc-500">
            An installed photo is already saved for this window. You can replace it anytime.
          </p>
        )}

        <div>
          <WindowRiskNotesFields
            riskFlag={riskFlag}
            notes={notes}
            notesError={notesError}
            onRiskFlagChange={setRiskFlag}
            onNotesChange={(value) => {
              setNotes(value);
              if (notesError) setNotesError("");
            }}
          />
        </div>

        <div className="pb-24 pt-2">
          <Button
            type="submit"
            fullWidth
            size="lg"
            disabled={pending || optimizingPhoto || installPhotosBlocked}
          >
            <UploadSimple size={18} weight="bold" />
            {optimizingPhoto
              ? "Optimizing photo…"
              : pending
              ? "Saving…"
              : existingInstalled
                ? "Update Installed Photo"
                : "Save Installed Photo"}
          </Button>
        </div>
      </form>
    </div>
  );
}
