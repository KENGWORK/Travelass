async function decodeImage(file: File): Promise<{ img: HTMLImageElement; original: string }> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode failed"));
    el.src = original;
  });

  return { img, original };
}

// Read an image File, downscale it, and return a JPEG data URL small enough to
// live comfortably in localStorage. Browser-only (uses Image/canvas).
export async function fileToDataUrl(file: File, maxDim = 1280, quality = 0.72): Promise<string> {
  const { img, original } = await decodeImage(file);

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale === 1 && file.size < 400 * 1024) return original; // already small

  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

// Same downscale as fileToDataUrl but returns a JPEG Blob for upload.
// Vercel serverless functions hard-cap request bodies at 4.5MB, well under
// what a phone camera photo (HEIC/JPEG, often 3-15MB) produces uncompressed —
// so uploads to Drive must always go through this, not the raw File.
export async function fileToUploadBlob(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  const { img } = await decodeImage(file);

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  return blob ?? file;
}
