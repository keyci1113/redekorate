import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLOCK_REFERENCE, BLOCK_TYPES, DIAGRAM_REFERENCE, DIAGRAM_SHAPES, METHODS } from "./reference.js";

const web = (p: string) => readFileSync(new URL(`../../../web/src/${p}`, import.meta.url), "utf8");

test("every block type the app knows is described for outside assistants", () => {
  const inApp = [...web("blocks/types.ts").matchAll(/\btype: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(inApp.length > 10);
  assert.deepEqual([...new Set(inApp)].sort(), [...BLOCK_TYPES].sort());
  for (const t of BLOCK_TYPES) assert.match(BLOCK_REFERENCE, new RegExp(`\\n  ${t} `), `${t} is missing from BLOCK_REFERENCE`);
});

test("every template key is a method outside assistants may use", () => {
  const inApp = [...web("templates/catalog.ts").matchAll(/\bkey: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...inApp].sort(), [...METHODS].sort());
});

test("every diagram shape the canvas draws is described for outside assistants", () => {
  const list = web("architecture/model.ts").match(/export const SHAPES = \[([^\]]+)\]/);
  assert.ok(list, "SHAPES not found in web/src/architecture/model.ts");
  const inApp = [...list[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(inApp.length >= 10);
  assert.deepEqual([...inApp].sort(), [...DIAGRAM_SHAPES].sort());
  for (const s of DIAGRAM_SHAPES) assert.match(DIAGRAM_REFERENCE, new RegExp(`\\b${s}\\b`), `${s} is missing from DIAGRAM_REFERENCE`);
});
