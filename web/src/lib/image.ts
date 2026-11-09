/**
 * Client-side image optimization: images are resized and re-encoded in the browser
 * before they are uploaded, so participants download less and the server never has
 * to process a 10 MB PNG. The server still validates the real format by magic bytes.
 *
 * The pure helpers (planResize, targetFormat, chooseResult, renameForType) are unit
 * tested; optimizeImage is the browser glue around them.
 */

/** Longest side allowed. 2x phone exports from Figma (~780×1690) stay untouched; 2x desktop exports shrink. */
export const MAX_SIDE = 2048;
/** Files under this size are uploaded as they are unless they also exceed MAX_SIDE. */
export const SKIP_UNDER_BYTES = 150 * 1024;
export const WEBP_QUALITY = 0.82;
export const JPEG_QUALITY = 0.85;

export type Dims = { width: number; height: number };

/** New dimensions that fit inside `max`, or null when the image already fits. */
export function planResize({ width, height }: Dims, max = MAX_SIDE): Dims | null {
  const longest = Math.max(width, height);
  if (longest <= max || longest === 0) return null;
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export type Target = { type: "image/webp" | "image/jpeg" | "image/png"; quality?: number };

/**
 * Output format for a source type. WebP when the browser can encode it (keeps alpha, smallest);
 * otherwise PNG sources stay PNG (alpha-safe) and photos go to JPEG. GIFs are never re-encoded
 * because they may be animated.
 */
export function targetFormat(sourceType: string, webpSupported: boolean): Target | null {
  if (sourceType === "image/gif" || sourceType === "image/svg+xml") return null;
  if (webpSupported) return { type: "image/webp", quality: WEBP_QUALITY };
  if (sourceType === "image/png" || sourceType === "image/webp") return { type: "image/png" };
  return { type: "image/jpeg", quality: JPEG_QUALITY };
}

/** Keep the candidate only when it is smaller, or when the image had to be resized anyway. */
export function chooseResult(originalBytes: number, candidateBytes: number, resized: boolean): "candidate" | "original" {
  if (resized) return "candidate";
  return candidateBytes < originalBytes ? "candidate" : "original";
}

const EXT: Record<Target["type"], string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

/** Same base name with the extension of the new type; screen names are derived from it. */
export function renameForType(name: string, type: Target["type"]): string {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.${EXT[type]}`;
}

/** True when the file is worth decoding at all. */
export function shouldOptimize(file: { type: string; size: number }, dims?: Dims | null): boolean {
  if (!file.type.startsWith("image/") || targetFormat(file.type, true) === null) return false;
  if (dims && planResize(dims)) return true;
  return file.size >= SKIP_UNDER_BYTES;
}

// ── Browser glue ──────────────────────────────────────────────────────

let webpSupport: boolean | null = null;
function canEncodeWebp(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const c = document.createElement("canvas"); c.width = c.height = 1;
    webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch { webpSupport = false; }
  return webpSupport;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((ok, fail) => {
      const img = new Image();
      img.onload = () => ok(img); img.onerror = () => fail(new Error("decode"));
      img.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas, target: Target): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: target.type, quality: target.quality }).catch(() => null);
  return new Promise((ok) => (canvas as HTMLCanvasElement).toBlob(ok, target.type, target.quality));
}

/**
 * Resize to fit MAX_SIDE and re-encode. Returns the original file when nothing is gained,
 * when the format must not be touched (GIF) or when the browser cannot decode it; the
 * server will validate it either way.
 */
export async function optimizeImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || targetFormat(file.type, true) === null) return file;
  // Decoding is cheap; it is needed even for small files to catch huge dimensions.
  let src: ImageBitmap | HTMLImageElement;
  try { src = await decode(file); } catch { return file; }
  const dims = { width: src.width, height: src.height };
  if (!shouldOptimize(file, dims)) { if ("close" in src) src.close(); return file; }
  const plan = planResize(dims);

  const target = targetFormat(file.type, canEncodeWebp());
  if (!target) { if ("close" in src) src.close(); return file; }
  const out = plan ?? dims;
  const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(out.width, out.height) : Object.assign(document.createElement("canvas"), out);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) { if ("close" in src) src.close(); return file; }
  ctx.drawImage(src, 0, 0, out.width, out.height);
  if ("close" in src) src.close();

  const blob = await toBlob(canvas, target);
  if (!blob || blob.type !== target.type) return file;
  if (chooseResult(file.size, blob.size, plan !== null) === "original") return file;
  return new File([blob], renameForType(file.name, target.type), { type: target.type, lastModified: file.lastModified });
}
