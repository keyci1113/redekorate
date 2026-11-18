import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { isoDay, patchOf } from "./schemas.js";

test("isoDay takes real days only", () => {
  assert.equal(isoDay.safeParse("2026-02-28").success, true);
  assert.equal(isoDay.safeParse("2028-02-29").success, true);
  for (const bad of ["2026-02-30", "2026-13-45", "2026-2-3", "tomorrow"]) assert.equal(isoDay.safeParse(bad).success, false, bad);
});

test("patchOf drops defaults, so a patch only carries what was sent", () => {
  const S = z.object({ title: z.string(), body: z.string().default(""), tags: z.array(z.string()).default([]), level: z.enum(["a", "b"]).default("a") });
  assert.deepEqual(S.partial().parse({}), { body: "", tags: [], level: "a" });   // what went wrong before
  assert.deepEqual(patchOf(S).parse({}), {});
  assert.deepEqual(patchOf(S).parse({ body: "x" }), { body: "x" });
  assert.equal(patchOf(S).safeParse({ level: "c" }).success, false);
});
