"use client";

const MAX_DIMENSION_PRIMARY = 1280;
const MAX_DIMENSION_FALLBACK = 1024;
const PRIMARY_QUALITY = 0.6;
const FALLBACK_QUALITY = 0.5;
const MAX_OUTPUT_BYTES = 400_000;
const SKIP_REENCODE_BELOW_BYTES = 500_000;
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20MB

type CompressionWorkerResponse =
  | { id: string; ok: true; blob: Blob }
  | { id: string; ok: false; error: string };

let compressionWorker: Worker | null = null;
let compressionWorkerFailed = false;
const pendingWorkerRequests = new Map<
  string,
  { resolve: (blob: Blob) => void; reject: (error: Error) => void }
>();

function fileNameToJpeg(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "upload"}.jpg`;
}

function validateImageMimeType(file: File): boolean {
  return typeof file.type === "string" && file.type.startsWith("image/");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image."));
    img.src = url;
  });
}

async function drawToJpegBlob(
  source: File,
  maxDimension: number,
  quality: number
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(source);
  try {
    const image = await loadImage(objectUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const longEdge = Math.max(width, height);
    const scale = longEdge > maxDimension ? maxDimension / longEdge : 1;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is unavailable.");
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) throw new Error("Could not compress image.");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canUseCompressionWorker(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

function getCompressionWorker(): Worker | null {
  if (compressionWorkerFailed || !canUseCompressionWorker()) {
    return null;
  }

  if (!compressionWorker) {
    compressionWorker = new Worker(
      new URL("./image-upload.worker.ts", import.meta.url),
      { type: "module" }
    );
    compressionWorker.onmessage = (
      event: MessageEvent<CompressionWorkerResponse>
    ) => {
      const response = event.data;
      const pending = pendingWorkerRequests.get(response.id);
      if (!pending) return;
      pendingWorkerRequests.delete(response.id);
      if (response.ok) {
        pending.resolve(response.blob);
      } else {
        pending.reject(new Error(response.error));
      }
    };
    compressionWorker.onerror = () => {
      compressionWorkerFailed = true;
      for (const pending of pendingWorkerRequests.values()) {
        pending.reject(new Error("Image compression worker failed."));
      }
      pendingWorkerRequests.clear();
      compressionWorker?.terminate();
      compressionWorker = null;
    };
  }

  return compressionWorker;
}

async function drawToJpegBlobOffThread(source: File): Promise<Blob> {
  const worker = getCompressionWorker();
  if (!worker) {
    throw new Error("Image compression worker unavailable.");
  }

  const id = `compress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise<Blob>((resolve, reject) => {
    pendingWorkerRequests.set(id, { resolve, reject });
    worker.postMessage({
      id,
      file: source,
      maxDimensionPrimary: MAX_DIMENSION_PRIMARY,
      maxDimensionFallback: MAX_DIMENSION_FALLBACK,
      primaryQuality: PRIMARY_QUALITY,
      fallbackQuality: FALLBACK_QUALITY,
      maxOutputBytes: MAX_OUTPUT_BYTES,
    });
  });
}

export function validateUploadImage(file: File): string | null {
  if (!validateImageMimeType(file)) {
    return "Please select an image file.";
  }
  if (file.size <= 0) {
    return "Selected image is empty.";
  }
  if (file.size > MAX_INPUT_BYTES) {
    return "Image is too large. Please use an image under 20MB.";
  }
  return null;
}

export async function compressImageForUpload(file: File): Promise<File> {
  const validation = validateUploadImage(file);
  if (validation) {
    throw new Error(validation);
  }

  // Keep already-small JPEG files to avoid needless processing latency.
  if (file.type === "image/jpeg" && file.size <= SKIP_REENCODE_BELOW_BYTES) {
    return file;
  }

  let compressed: Blob;
  try {
    compressed = await drawToJpegBlobOffThread(file);
  } catch {
    let primary = await drawToJpegBlob(file, MAX_DIMENSION_PRIMARY, PRIMARY_QUALITY);
    if (primary.size > MAX_OUTPUT_BYTES) {
      primary = await drawToJpegBlob(file, MAX_DIMENSION_FALLBACK, FALLBACK_QUALITY);
    }
    compressed = primary;
  }

  return new File([compressed], fileNameToJpeg(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
