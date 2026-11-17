import { describe, expect, test } from "vitest";
import { SITEMAP, isDiagramKind, layoutSitemap, normalizeDiagram, outlineStats, parseOutline, sitemapToDiagram, starter } from "./model";

describe("parseOutline", () => {
  test("indent puts a line under the nearest less-indented line above it", () => {
    const roots = parseOutline("Home\n  Products\n    Shoes\n  About\nLegal");
    expect(roots.map((r) => r.label)).toEqual(["Home", "Legal"]);
    expect(roots[0].children.map((c) => c.label)).toEqual(["Products", "About"]);
    expect(roots[0].children[0].children[0]).toMatchObject({ label: "Shoes", depth: 2 });
  });

  test("tabs, uneven indent, bullets and blank lines are all fine", () => {
    const roots = parseOutline("- Home\n\n\t* Shop\n\t\t• Cart\n Help\n");
    expect(roots).toHaveLength(1);
    expect(roots[0].children.map((c) => c.label)).toEqual(["Shop", "Help"]);
    expect(roots[0].children[0].children[0].label).toBe("Cart");
  });

  test("counts pages and levels", () => {
    expect(outlineStats(parseOutline("A\n  B\n    C\n  D"))).toEqual({ pages: 4, depth: 3 });
    expect(outlineStats(parseOutline(""))).toEqual({ pages: 0, depth: 0 });
  });
});

describe("layoutSitemap", () => {
  const d = layoutSitemap(parseOutline("Home\n  Shop\n    Shoes\n      Boots\n  Help\n    FAQ"));
  const at = (label: string) => d.nodes.find((x) => x.text === label)!;

  test("home on top, sections in one row, the rest stacked and indented below its section", () => {
    expect(at("Home").y).toBe(0);
    expect(at("Shop").y).toBe(at("Help").y);
    expect(at("Help").x).toBeGreaterThan(at("Shop").x);
    expect(at("Shoes").y).toBeGreaterThan(at("Shop").y);
    expect(at("Boots").y).toBeGreaterThan(at("Shoes").y);
    expect(at("Shoes").x - at("Shop").x).toBe(SITEMAP.indent);
    expect(at("Boots").x - at("Shoes").x).toBe(SITEMAP.indent);
  });

  test("no two pages overlap, even with deep columns next to each other", () => {
    const big = layoutSitemap(parseOutline("H\n  A\n    A1\n      A2\n        A3\n  B\n    B1\n  C"));
    for (const a of big.nodes) for (const b of big.nodes) {
      if (a === b) continue;
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect(apart, `${a.text} overlaps ${b.text}`).toBe(true);
    }
  });

  test("every page but the home has exactly one line coming in", () => {
    const into = (id: string) => d.edges.filter((e) => e.to === id).length;
    for (const x of d.nodes) expect(into(x.id)).toBe(x.text === "Home" ? 0 : 1);
  });

  test("an empty outline still draws a hint instead of nothing", () => {
    expect(layoutSitemap([], "en").nodes).toHaveLength(1);
  });
});

describe("normalizeDiagram", () => {
  test("keeps valid content and repairs the rest", () => {
    const d = normalizeDiagram({
      nodes: [{ id: "a", shape: "cloud", x: 5, y: "x", text: "A" }, { id: "b", shape: "note" }, { id: "a", shape: "rect" }, { shape: "rect" }],
      edges: [{ id: "1", from: "a", to: "b", arrow: "sideways" }, { id: "2", from: "a", to: "missing" }],
    });
    expect(d.nodes.map((x) => x.id)).toEqual(["a", "b"]);
    expect(d.nodes[0]).toMatchObject({ shape: "rect", x: 5, y: 0, color: "none" });
    expect(d.nodes[1]).toMatchObject({ shape: "note", color: "yellow", text: "" });
    expect(d.edges).toEqual([{ id: "1", from: "a", to: "b", line: "solid", arrow: "end", path: "elbow" }]);
  });

  test("anything that is not a diagram becomes an empty one", () => {
    expect(normalizeDiagram(null)).toEqual({ nodes: [], edges: [] });
    expect(normalizeDiagram({ nodes: "x" })).toEqual({ nodes: [], edges: [] });
  });
});

describe("starters", () => {
  test("every starter is a valid diagram or sitemap, with no dangling arrows", () => {
    for (const id of ["blank", "flowchart", "user_flow", "system", "sitemap"] as const) {
      for (const lang of ["es", "en"] as const) {
        const s = starter(id, lang);
        expect(isDiagramKind(s.kind)).toBe(true);
        if (s.kind === "diagram") expect(normalizeDiagram(s.data)).toEqual(s.data);
        else expect(outlineStats(parseOutline((s.data as { outline: string }).outline)).pages).toBeGreaterThan(5);
      }
    }
  });

  test("a sitemap opened as a diagram keeps every page and line", () => {
    const outline = (starter("sitemap", "en").data as { outline: string }).outline;
    const d = sitemapToDiagram(outline, "en");
    expect(normalizeDiagram(d)).toEqual(d);
    expect(d.nodes).toHaveLength(outlineStats(parseOutline(outline)).pages);
    expect(d.edges).toHaveLength(d.nodes.length - 1);
  });
});
