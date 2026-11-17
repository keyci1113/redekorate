// Display size of the image attached to a block, chosen in the builder as a share of the column width.
import type { ImageRef } from "./types";

export const IMAGE_SIZE = { min: 20, max: 100, step: 5 };
/** The chosen width in percent, or null when the builder left the automatic size. */
export function imageSize(image: ImageRef | null | undefined): number | null {
  const v = Number(image?.size);
  return Number.isFinite(v) && v > 0 ? Math.min(IMAGE_SIZE.max, Math.max(IMAGE_SIZE.min, Math.round(v))) : null;
}
/** Inline style for the image: a width when a size was chosen, nothing otherwise (the default classes apply). */
export const imageStyle = (image: ImageRef | null | undefined) => { const s = imageSize(image); return s === null ? undefined : { width: `${s}%` }; };
