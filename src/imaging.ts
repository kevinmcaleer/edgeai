// Turning files and camera frames into stored pictures: one normalised JPEG plus a thumbnail.

/** Longest side of a stored picture, in px. Big enough for 640 px training input with room to crop. */
export const MAX_SIDE = 1280;
/** Longest side of a grid thumbnail, in px. */
export const THUMB_SIDE = 320;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];

export interface Encoded {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

/** Size that fits inside maxSide on its longest side, keeping the aspect ratio. Never enlarges. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function isImageFile(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the picture"))), "image/jpeg", quality),
  );
}

function draw(source: CanvasImageSource, sw: number, sh: number, maxSide: number): HTMLCanvasElement {
  const { width, height } = fitWithin(sw, sh, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw pictures (no 2D canvas)");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** Encodes any drawable source (a decoded file, a video frame) as a stored picture and thumbnail. */
export async function encodeSource(source: CanvasImageSource, sw: number, sh: number): Promise<Encoded> {
  const full = draw(source, sw, sh, MAX_SIDE);
  const thumb = draw(full, full.width, full.height, THUMB_SIDE);
  const [blob, thumbBlob] = await Promise.all([canvasToBlob(full, 0.9), canvasToBlob(thumb, 0.8)]);
  return { blob, thumb: thumbBlob, width: full.width, height: full.height };
}

export async function encodeBlob(file: Blob): Promise<Encoded> {
  const bitmap = await createImageBitmap(file);
  try {
    return await encodeSource(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

export async function encodeVideoFrame(video: HTMLVideoElement): Promise<Encoded> {
  if (!video.videoWidth) throw new Error("The camera has not sent a picture yet");
  return encodeSource(video, video.videoWidth, video.videoHeight);
}

/** A file name for a captured picture: cam-2026-11-25-001203-4.jpg */
export function captureName(prefix: string, when = new Date(), n?: number): string {
  const p = (x: number, l = 2) => String(x).padStart(l, "0");
  const stamp = `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}-${p(when.getHours())}${p(when.getMinutes())}${p(when.getSeconds())}`;
  return `${prefix}-${stamp}${n != null ? "-" + n : ""}.jpg`;
}
