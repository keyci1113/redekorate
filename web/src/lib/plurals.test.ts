import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EN } from "./en";

// Every source file of the app except the dictionary itself.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== "en.ts" ? [p] : [];
  });
}
const SRC = join(__dirname, "..");
const files = sources(SRC).map((p) => ({ p: p.slice(SRC.length + 1), text: readFileSync(p, "utf8") }));

describe("counts in the interface", () => {
  it("never write a plural as \"(s)\": counts go through plural()", () => {
    const hits = files.flatMap(({ p, text }) => [...text.matchAll(/\bt\("([^"]*[a-záéíóúñ]\((?:s|es)\)[^"]*)"/g)].map((m) => `${p}: ${m[1]}`));
    expect(hits).toEqual([]);
  });

  it("have an English translation for every singular and plural form", () => {
    const forms = files.flatMap(({ text }) => [...text.matchAll(/\bplural\([^;]*?\{\s*one:\s*"([^"]+)",\s*other:\s*"([^"]+)"/g)].flatMap((m) => [m[1], m[2]]));
    expect(forms.length).toBeGreaterThan(20);
    expect(forms.filter((k) => !(k in EN))).toEqual([]);
  });
});
