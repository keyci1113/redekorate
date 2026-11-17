// How a profile photo sits in its circle. The position travels with the photo's address as a fragment
// ("/uploads/abc.gif#c=0.42,0.3,1.8"), so it needs no column, works for animated GIFs (nothing is re-encoded)
// and can be adjusted again at any time. Pure functions, shared by Avatar, the editor and the tests.
import type { CSSProperties } from "react";

/** x and y: the point of the photo the circle centers on (0–1 of its width and height); z: zoom, 1 = fills the circle. */
export interface Crop { x: number; y: number; z: number }

export const ZOOM_MIN = 1, ZOOM_MAX = 4;
export const CENTER: Crop = { x: 0.5, y: 0.5, z: 1 };
const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

export function clampCrop(c: Crop): Crop {
  return { x: clamp(c.x, 0, 1), y: clamp(c.y, 0, 1), z: clamp(c.z, ZOOM_MIN, ZOOM_MAX) };
}

/** The photo's address and its crop (centered when the address carries none or a broken one). */
export function parseAvatar(url: string): { src: string; crop: Crop } {
  const [src, frag = ""] = url.split("#", 2);
  const m = /^c=([\d.]+),([\d.]+),([\d.]+)$/.exec(frag);
  return { src, crop: m ? clampCrop({ x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) }) : CENTER };
}

const r = (n: number, d: number) => String(Number(n.toFixed(d)));
/** The address to store; a centered, unzoomed photo stays a plain address. */
export function withCrop(src: string, crop: Crop): string {
  const c = clampCrop(crop);
  const plain = src.split("#")[0];
  if (Math.abs(c.x - 0.5) < 0.001 && Math.abs(c.y - 0.5) < 0.001 && c.z - 1 < 0.001) return plain;
  return `${plain}#c=${r(c.x, 3)},${r(c.y, 3)},${r(c.z, 2)}`;
}

/**
 * The <img> style that shows `crop` inside a square box. object-fit: cover fills the box and object-position picks
 * the part of a non-square photo; scaling around the same point zooms in without ever showing an empty edge.
 */
export function cropStyle(c: Crop): CSSProperties {
  const at = `${(c.x * 100).toFixed(1)}% ${(c.y * 100).toFixed(1)}%`;
  return { objectFit: "cover", objectPosition: at, transform: c.z > 1 ? `scale(${c.z})` : undefined, transformOrigin: at };
}

/**
 * The crop after dragging the photo by (dx, dy) screen pixels in a box `box` pixels wide, for a photo of
 * natural size w×h. The photo follows the pointer: moving it right shows more of its left side.
 */
export function dragCrop(c: Crop, dx: number, dy: number, box: number, w: number, h: number): Crop {
  const short = Math.min(w, h) || 1;
  // How far, in box widths, the photo can travel along each axis at this zoom.
  const travelX = Math.max((w / short) * c.z - 1, 0), travelY = Math.max((h / short) * c.z - 1, 0);
  return clampCrop({
    x: travelX ? c.x - dx / (box * travelX) : c.x,
    y: travelY ? c.y - dy / (box * travelY) : c.y,
    z: c.z,
  });
}
