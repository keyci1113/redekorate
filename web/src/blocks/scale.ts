// The range a scale block actually shows. Emoji faces only come in five, so that style uses 1–5 while the
// block keeps its own min/max: switching back to numbers or stars brings the stored range back.
import type { ScaleBlock } from "./types";

export const EMOJI_RANGE = { min: 1, max: 5 } as const;

export function scaleRange(b: Pick<ScaleBlock, "style" | "min" | "max">): { min: number; max: number } {
  return b.style === "emoji" ? { ...EMOJI_RANGE } : { min: b.min, max: b.max };
}

/** True when the style shows a different range from the stored one (the editor explains it instead of overwriting). */
export const styleLimitsRange = (b: Pick<ScaleBlock, "style" | "min" | "max">) => {
  const r = scaleRange(b);
  return r.min !== b.min || r.max !== b.max;
};
