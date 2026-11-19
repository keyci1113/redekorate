// The REST API answers in English: every message a service can throw must have an English translation in
// lib/i18n.ts, or a script would get Spanish. Reads the services' source, so a new message can't be forgotten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translate } from "../lib/i18n.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const sources = [
  ...readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => path.join(here, f)),
  path.join(here, "../lib/access.ts"), path.join(here, "../lib/versions.ts"),
];

/** Messages thrown as HttpError(status, "…") or notFound("…") (which says "… no encontrado"). */
function thrownMessages(source: string): string[] {
  const out = [...source.matchAll(/HttpError\(\d{3},\s*(?:[^"`]*?\?\s*)?"([^"]+)"/g)].map((m) => m[1]);
  out.push(...[...source.matchAll(/HttpError\(\d{3},[^;]*?:\s*"([^"]+)"/g)].map((m) => m[1]));
  out.push(...[...source.matchAll(/notFound\("([^"]+)"\)/g)].map((m) => `${m[1]} no encontrado`));
  out.push(...[...source.matchAll(/^const ORDER = "([^"]+)"/gm)].map((m) => m[1]));
  return out;
}

test("the scan finds messages (so an empty result can't pass by accident)", () => {
  assert.deepEqual(thrownMessages(`throw new HttpError(400, "Uno"); throw notFound("Ticket"); throw new HttpError(403, x ? "Dos" : "Tres");`).sort(), ["Dos", "Tres", "Ticket no encontrado", "Uno"].sort());
});

test("every message a service throws has an English translation", () => {
  const missing = new Set<string>();
  for (const f of sources) for (const m of thrownMessages(readFileSync(f, "utf8"))) if (translate(m, "en") === m) missing.add(m);
  assert.deepEqual([...missing], []);
});
