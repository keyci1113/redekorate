import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOC_KINDS, SECTION_SHAPES, documentReference } from "./documentReference.js";

const src = readFileSync(new URL("../../../web/src/docs/templates.tsx", import.meta.url), "utf8");

/** Each template in the app as kind → "id:type[:component][(field ids)]" per section, read from the source. */
function appKinds() {
  const marks = [...src.matchAll(/\bkind: "(\w+)", name: "/g)];
  return Object.fromEntries(marks.map((m, i) => {
    const body = src.slice(m.index, marks[i + 1]?.index ?? src.length);
    const sections = body.split("\n").map((l) => l.trim()).filter((l) => /^\{ id: "\w+", type: "/.test(l)).map((l) => {
      const [, id, type] = l.match(/^\{ id: "(\w+)", type: "(\w+)"/)!;
      const component = l.match(/component: "(\w+)"/)?.[1];
      const fields = [...l.matchAll(/\{ id: "(\w+)", label: "[^"]*"(?:[^}]*date: "(\w+)")?/g)].map((f) => f[1] + (f[2] ? `@${f[2]}` : ""));
      return [id, type, component].filter(Boolean).join(":") + (fields.length ? `(${fields.join(",")})` : "");
    });
    return [m[1], sections];
  }));
}
const serverKinds = () => Object.fromEntries(Object.entries(DOC_KINDS).map(([k, v]) => [k, v.sections.map((s) =>
  [s.id, s.type, s.component].filter(Boolean).join(":") + (s.fields ? `(${s.fields.map((f) => f.id + (f.date ? `@${f.date}` : "")).join(",")})` : ""))]));

test("every document template and its sections are described for outside assistants", () => {
  const app = appKinds();
  assert.ok(Object.keys(app).length >= 20);
  assert.deepEqual(serverKinds(), app);
});

test("every section type has a value shape", () => {
  for (const [kind, k] of Object.entries(DOC_KINDS)) {
    for (const s of documentReference(kind)!.sections) assert.ok(s.value_shape, `${kind}.${s.id} (${s.type}${s.component ? `:${s.component}` : ""}) has no shape`);
    assert.ok(k.name && k.description);
  }
  assert.ok(SECTION_SHAPES.text);
  assert.equal(documentReference("research_plan"), null);
});
