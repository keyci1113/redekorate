// Crazy 8s: the stored drawing format, the timer, and the template's eight panels.
import { describe, expect, it } from "vitest";
import { MAX_POINTS, addPoint, clock, pointCount, timerAt, toPath, validStroke } from "./sketchModel";
import { DOC_TEMPLATES, docTemplate } from "./templates";
import { docBlocks } from "./export";
import { EN as en } from "../lib/en";

describe("sketch strokes", () => {
  it("are compact path data with whole coordinates, and count their points", () => {
    const d = toPath([[1.4, 2.6], [10, 20.2]]);
    expect(d).toBe("M1 3L10 20");
    expect(validStroke(d)).toBe(true);
    expect(pointCount([d, "M0 0L1 1L2 2"])).toBe(5);
  });

  it("clamp points to the panel and drop ones too close to the last", () => {
    let pts = addPoint([], -5, 500);
    expect(pts).toEqual([[0, 200]]);
    expect(addPoint(pts, 0.5, 199.5)).toBe(pts);
    pts = addPoint(pts, 10, 190);
    expect(pts).toHaveLength(2);
  });

  it("reject anything that is not plain move/line data (it comes from the API too)", () => {
    for (const bad of ["", "M1 2 Z", "M1 2L3", "<script>", 42, "M-1 2"]) expect(validStroke(bad)).toBe(false);
  });

  it("keep eight full panels under the 2 MB request limit", () => {
    const panel = toPath(Array.from({ length: MAX_POINTS }, () => [300, 200] as [number, number]));
    expect(JSON.stringify(Array(8).fill({ idea: "", strokes: [panel] })).length).toBeLessThan(2_000_000 / 2);
  });
});

describe("the Crazy 8s timer", () => {
  it("gives each of the eight panels one minute, then stops", () => {
    expect(timerAt(0)).toEqual({ frame: 0, left: 60_000, done: false });
    expect(timerAt(61_000)).toEqual({ frame: 1, left: 59_000, done: false });
    expect(timerAt(7 * 60_000 + 59_999).frame).toBe(7);
    expect(timerAt(8 * 60_000)).toEqual({ frame: 7, left: 0, done: true });
    expect([clock(60_000), clock(59_001), clock(500), clock(0)]).toEqual(["1:00", "1:00", "0:01", "0:00"]);
  });
});

describe("the Crazy 8s template", () => {
  const tpl = docTemplate("crazy_eights")!;
  it("has eight sketch panels in order", () => {
    expect(tpl.sections.filter((s) => s.type === "sketch").map((s) => s.id)).toEqual(Array.from({ length: 8 }, (_, i) => `sketch_${i + 1}`));
  });

  it("is translated", () => {
    for (const key of [tpl.name, tpl.description, tpl.purpose, tpl.question, tpl.credit!, ...tpl.instructions, ...tpl.sections.flatMap((s) => [s.title, s.prompt]).filter(Boolean) as string[]])
      expect(en[key], key).toBeTruthy();
  });

  it("exports each panel's idea under its sketch heading", () => {
    const out = docBlocks(tpl, "Ideas", { sketch_2: { idea: "Reorder in one tap", strokes: ["M0 0L1 1"] } }, "en");
    const i = out.findIndex((b) => b.t === "h" && b.text === "Sketch 2");
    expect(out[i + 1]).toEqual({ t: "p", text: "Reorder in one tap" });
    expect(out.some((b) => b.t === "h" && b.text === "Sketch 1")).toBe(false);
  });

  it("no other template has sketch sections yet (the sheet assumes one per document)", () => {
    expect(DOC_TEMPLATES.filter((t) => t.sections.some((s) => s.type === "sketch")).map((t) => t.kind)).toEqual(["crazy_eights"]);
  });
});
