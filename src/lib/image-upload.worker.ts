type CompressionRequest = {
  id: string;
  file: File;
  maxDimensionPrimary: number;
  maxDimensionFallback: number;
  primaryQuality: number;
  fallbackQuality: number;
  maxOutputBytes: number;
};

type CompressionResponse =
  | {
      id: string;
      ok: true;
      blob: Blob;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

async function drawToJpegBlob(
  source: Blob,
  maxDimension: number,
  quality: number
): Promise<Blob> {
  const image = await createImageBitmap(source);
  try {
    const width = image.width;
    const height = image.height;
    const longEdge = Math.max(width, height);
    const scale = longEdge > maxDimension ? maxDimension / longEdge : 1;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is unavailable.");
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas.convertToBlob({
      type: "image/jpeg",
      quality,
    });
  } finally {
    image.close();
  }
}

self.onmessage = async (event: MessageEvent<CompressionRequest>) => {
  const {
    id,
    file,
    maxDimensionPrimary,
    maxDimensionFallback,
    primaryQuality,
    fallbackQuality,
    maxOutputBytes,
  } = event.data;

  try {
    let primary = await drawToJpegBlob(file, maxDimensionPrimary, primaryQuality);
    if (primary.size > maxOutputBytes) {
      primary = await drawToJpegBlob(file, maxDimensionFallback, fallbackQuality);
    }

    const response: CompressionResponse = {
      id,
      ok: true,
      blob: primary,
    };
    self.postMessage(response);
  } catch (error) {
    const response: CompressionResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Could not compress image.",
    };
    self.postMessage(response);
  }
};

export {};
