// Crazy 8s: the drawing format of a sketch panel and the timer's arithmetic, kept free of React so they can be tested.

/** A panel's drawing area in its own units: 3:2, the shape of one eighth of a portrait sheet folded three times. */
export const VIEW = { w: 300, h: 200 } as const;
/** Points one panel may hold across all its strokes, so eight drawn panels stay far below the 2 MB request limit. */
export const MAX_POINTS = 6000;
/** A new point closer than this (in VIEW units) to the last one is dropped: it adds weight without changing the line. */
const MIN_STEP = 1.5;

export const FRAMES = 8;
export const FRAME_MS = 60_000;

export type Pt = [number, number];

/** One stroke as compact SVG path data: "M12 30L14 31L…", coordinates rounded to whole VIEW units. */
export function toPath(points: Pt[]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${Math.round(x)} ${Math.round(y)}`).join("");
}

/** How many points a set of stored strokes holds. */
export function pointCount(strokes: string[]): number {
  let n = 0;
  for (const s of strokes) n += (s.match(/[ML]/g) ?? []).length;
  return n;
}

/** Appends a point clamped to the panel, unless it is too close to the previous one. Returns the same array when nothing changed. */
export function addPoint(points: Pt[], x: number, y: number): Pt[] {
  const p: Pt = [Math.min(VIEW.w, Math.max(0, x)), Math.min(VIEW.h, Math.max(0, y))];
  const last = points.at(-1);
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_STEP) return points;
  return [...points, p];
}

/** A stored stroke is only ever drawn as a path's `d`, but data can come from the API, so only well-formed ones are kept. */
export const validStroke = (s: unknown): s is string => typeof s === "string" && /^M\d+ \d+(L\d+ \d+)*$/.test(s);

/** Where the timer is after `elapsed` ms: the panel being drawn (0-based), the ms left on it, and whether all eight are done. */
export function timerAt(elapsed: number, frames = FRAMES, frameMs = FRAME_MS) {
  if (elapsed >= frames * frameMs) return { frame: frames - 1, left: 0, done: true };
  const t = Math.max(0, elapsed);
  const frame = Math.floor(t / frameMs);
  return { frame, left: frameMs - (t - frame * frameMs), done: false };
}

/** m:ss, rounding up so the clock reads 1:00 at the start of a panel and 0:01 in its last second. */
export function clock(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
