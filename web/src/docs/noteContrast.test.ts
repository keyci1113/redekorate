// Sticky notes keep light paper in both themes, so the ink drawn on them must stay dark. This reads the real
// stylesheet: every note color (light and dark theme) against every text color .note-paper sets.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe("sticky note contrast", () => {
  const papers = [...css.matchAll(/--color-note-(?!muted)[a-z]+:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
  const rule = css.match(/\.note-paper\s*\{([^}]*)\}/)?.[1] ?? "";
  const muted = [...css.matchAll(/--color-note-muted:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
  const inks = {
    ink: rule.match(/--color-ink:\s*(#[0-9A-Fa-f]{6})/)?.[1],
    accent: rule.match(/--color-accent:\s*(#[0-9A-Fa-f]{6})/)?.[1],
    bad: rule.match(/--color-bad:\s*(#[0-9A-Fa-f]{6})/)?.[1],
  };

  it("finds the note colors and the note ink", () => {
    expect(papers.length).toBeGreaterThanOrEqual(12);
    expect(muted.length).toBeGreaterThanOrEqual(1);
    expect(Object.values(inks).every(Boolean)).toBe(true);
  });

  it("every text color on a note reads at 4.5:1 or better, in both themes", () => {
    for (const paper of papers)
      for (const [name, ink] of [...Object.entries(inks), ...muted.map((m) => ["muted", m] as const)])
        expect(contrast(ink!, paper), `${name} ${ink} on ${paper}`).toBeGreaterThanOrEqual(4.5);
  });
});
