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

const SAFE_UPLOAD_SIZE = 4 * 1024 * 1024; // margin under Vercel's 4.5MB request-body cap

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

// Downscale only as much as needed to clear Vercel's 4.5MB request-body cap.
// Files already under that (the vast majority of camera/gallery photos) pass
// through untouched — full original quality, sharp at any zoom. Only the
// rare oversized shot gets re-encoded, starting at a large 2400px/90% pass
// and stepping quality down further only if that single pass isn't enough.
export async function fileToUploadBlob(file: File): Promise<Blob> {
  if (file.size <= SAFE_UPLOAD_SIZE) return file;

  const { img } = await decodeImage(file);
  const maxDim = 2400;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);

  for (const quality of [0.9, 0.8, 0.65, 0.5]) {
    const blob = await canvasToBlob(canvas, quality);
    if (blob && blob.size <= SAFE_UPLOAD_SIZE) return blob;
    if (blob && quality === 0.5) return blob; // last attempt, ship it even if still large
  }
  return file;
}
