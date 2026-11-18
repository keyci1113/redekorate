/**
 * Small schemas several services share.
 */
import { z } from "zod";

/** A real calendar day as YYYY-MM-DD: "2026-02-30" matches the pattern but is no day, so it fails here instead of in the database. */
export const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Not a real date");

/**
 * Every field optional and without its default, for edits: a patch changes only what it sends.
 * zod's .partial() keeps defaults, so a patch of { reviewed: true } would also reset every field that has one.
 */
export function patchOf<S extends z.ZodRawShape>(o: z.ZodObject<S>): ReturnType<z.ZodObject<S>["partial"]> {
  const shape = Object.fromEntries(Object.entries(o.shape).map(([k, s]) => {
    let inner = s as z.ZodType;
    while (inner instanceof z.ZodDefault || inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodType;
    return [k, inner.optional()];
  }));
  return z.object(shape) as any;
}
