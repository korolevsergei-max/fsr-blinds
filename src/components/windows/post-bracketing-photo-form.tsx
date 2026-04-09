"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { Camera, CheckCircle, Trash, UploadSimple } from "@phosphor-icons/react";
import { uploadWindowPostBracketingPhoto, deleteWindowMediaItem } from "@/app/actions/fsr-data";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import type { RiskFlag } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { WindowStageNav } from "@/components/window-stage-nav";
import { WindowRiskNotesFields } from "@/components/windows/window-risk-notes-fields";
import { compressImageForUpload, validateUploadImage } from "@/lib/image-upload";
import { useQueuedUpload } from "@/lib/use-queued-upload";
import { PhotoSourcePicker } from "@/components/ui/photo-source-picker";

export function PostBracketingPhotoForm({
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
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  const unit = data.units.find((u) => u.id === id);
  const room = data.rooms.find((r) => r.id === roomId);
  const windowItem = data.windows.find((w) => w.id === windowId && w.roomId === roomId);
  const existingPostBracketing = mediaItems.find(
    (item) =>
      item.windowId === windowId &&
      item.stage === "bracketed_measured" &&
      item.uploadKind === "window_measure"
  );

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    existingPostBracketing?.publicUrl ?? null
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
  const [deleting, setDeleting] = useState(false);
  const enqueuePhoto = useQueuedUpload("uploadWindowPostBracketingPhoto", uploadWindowPostBracketingPhoto);

  // mediaItems loads asynchronously — sync preview once it arrives
  useEffect(() => {
    if (existingPostBracketing?.publicUrl && !photoFile) {
      setPhotoPreview(existingPostBracketing.publicUrl);
    }
  }, [existingPostBracketing?.publicUrl, photoFile]);

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

  if (!unit || !room || !windowItem) {
    return <div className="p-6 text-center text-muted">Window not found</div>;
  }

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

  const onDeletePhoto = async () => {
    if (!existingPostBracketing) return;
    setDeleting(true);
    try {
      const result = await deleteWindowMediaItem(
        existingPostBracketing.id,
        windowItem.id,
        "bracketed_measured"
      );
      if (result.ok) {
        setPhotoPreview(null);
        setPhotoFile(null);
      } else {
        setError(result.error ?? "Failed to delete photo.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError("");
    setNotesError("");

    const isGreen = riskFlag === "green";

    if (!isGreen && !photoFile && !existingPostBracketing) {
      setError("Post-bracketing photo is required for yellow or red risk.");
      return;
    }
    if ((riskFlag === "yellow" || riskFlag === "red") && !notes.trim()) {
      setNotesError("Notes are required for yellow or red risk.");
      return;
    }

    startTransition(async () => {
      try {
        let compressedPhoto: File | null = null;
        if (photoFile) {
          const validationError = validateUploadImage(photoFile);
          if (validationError) {
            setError(validationError);
            return;
          }
          setOptimizingPhoto(true);
          try {
            compressedPhoto = await compressImageForUpload(photoFile);
          } finally {
            setOptimizingPhoto(false);
          }
        }
        const fd = new FormData();
        fd.set("unitId", unit.id);
        fd.set("roomId", room.id);
        fd.set("windowId", windowItem.id);
        if (compressedPhoto) {
          fd.set("photo", compressedPhoto, compressedPhoto.name);
        }
        fd.set("riskFlag", riskFlag);
        fd.set("notes", notes);

        if (compressedPhoto) {
          // Photo present — queue for background upload so navigation is instant
          await enqueuePhoto(fd);
        } else {
          // No photo — call directly and wait before navigating.
          // Android Chrome cancels in-flight fetch requests on navigation, so
          // queuing and immediately navigating drops the save on Android.
          const result = await uploadWindowPostBracketingPhoto(fd);
          if (!result.ok) {
            setError(result.error ?? "Failed to save. Please try again.");
            return;
          }
        }

        router.push(`${routeBasePath}/${id}/rooms/${roomId}`);
      } catch {
        setError("Something went wrong. Please try again.");
        setOptimizingPhoto(false);
      }
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PageHeader
        title="Post-Bracketing Photo"
        subtitle={`${windowItem.label} • ${room.name}`}
        backHref={`${routeBasePath}/${id}/rooms/${roomId}/windows/new?edit=${windowItem.id}`}
      />

      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-6 px-5 py-5">
        <WindowStageNav
          unitId={id}
          roomId={roomId}
          windowId={windowItem.id}
          isMeasured={windowItem.measured}
          isBracketed={windowItem.bracketed}
          isInstalled={windowItem.installed}
          active="bracketed"
          routeBasePath={routeBasePath}
        />

        <PhotoSourcePicker
          open={photoPickerOpen}
          onClose={() => setPhotoPickerOpen(false)}
          onChange={(files) => onFileChange(files?.[0] ?? null)}
        />

        <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-[11px] text-zinc-500 leading-relaxed">
          <p className="font-bold text-zinc-700 mb-1 flex items-center gap-1.5">
            <UploadSimple size={14} weight="bold" />
            Bracketing Step
          </p>
          Confirm that brackets are installed correctly. A photo is {riskFlag === "green" ? <span className="font-bold text-emerald-600">optional</span> : <span className="font-bold text-amber-600 underline">required</span>} for this window based on its status.
        </div>

        {error && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div>
          <h2 className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            Post-Bracketing Photo
            {riskFlag !== "green" && <span className="ml-1 text-red-500">*</span>}
          </h2>
          <p className="text-[11px] text-zinc-400 mb-3">
            {riskFlag === "green" 
              ? "Optional for green status windows." 
              : "Required for yellow or red risk indicators."}
          </p>
          {photoPreview ? (
            <div className="relative w-full overflow-hidden rounded-2xl border border-border">
              <button
                type="button"
                onClick={() => setPhotoPickerOpen(true)}
                className="relative w-full text-left"
              >
                <div className={`relative w-full bg-surface overflow-hidden ${
                  photoOrientation === "portrait"
                    ? "h-[70dvh]"
                    : photoOrientation === "square"
                      ? "aspect-square"
                      : "aspect-[16/9]"
                }`}>
                  <Image
                    src={photoPreview}
                    alt="Post-bracketing preview"
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </div>
                <div className="absolute left-3 top-3">
                  <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-lg">
                    <CheckCircle size={14} weight="fill" />
                    {photoFile ? "New photo" : "Saved — tap to replace"}
                  </span>
                </div>
              </button>
              {existingPostBracketing && !photoFile && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onDeletePhoto}
                  className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white shadow-lg disabled:opacity-60"
                >
                  <Trash size={13} weight="bold" />
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPhotoPickerOpen(true)}
              className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 transition-all active:scale-[0.98] hover:bg-zinc-100/50"
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white border border-zinc-200 shadow-sm">
                <Camera size={24} className="text-zinc-500" />
              </div>
              <div className="text-center">
                <span className="block text-sm font-bold text-zinc-700">Take Bracketing Photo</span>
                <span className="block text-[11px] text-zinc-500 uppercase tracking-wider mt-0.5">Optional for green</span>
              </div>
            </button>
          )}
        </div>

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

        <div className="pb-24 pt-4">
          <Button 
            type="submit" 
            fullWidth 
            size="lg" 
            disabled={pending || optimizingPhoto}
            className={!photoFile && !existingPostBracketing ? "bg-emerald-600 hover:bg-emerald-700 shadow-md" : ""}
          >
            {optimizingPhoto ? (
              "Optimizing photo…"
            ) : pending ? (
              "Saving…"
            ) : !photoFile && !existingPostBracketing ? (
              <>
                <CheckCircle size={20} weight="bold" />
                Mark Bracketing as Complete
              </>
            ) : (
              <>
                <UploadSimple size={20} weight="bold" />
                {existingPostBracketing ? "Update Bracketing" : "Save Bracketing Photo"}
              </>
            )}
          </Button>
          {!photoFile && !existingPostBracketing && riskFlag === "green" && (
            <p className="text-center text-[11px] text-zinc-400 mt-3 italic">
              You can complete this stage without a photo for green status windows.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
