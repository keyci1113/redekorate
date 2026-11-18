import { describe, expect, test } from "vitest";
import { boardDirections, dominantColors, hostOf, normalizeHex, safeImageSrc, safeUrl, swatchRow, withScheme, type DiagramData, type DNode } from "./model";
import { SITEMAP, isDiagramKind, layoutSitemap, normalizeDiagram, outlineStats, parseOutline, sitemapToDiagram, starter, alignedLine, onOutline, HANDLE_HALF, ALIGN_SNAP } from "./model";

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
        if (s.kind !== "sitemap") expect(normalizeDiagram(s.data)).toEqual(s.data);
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

describe("arrow geometry", () => {
  test("line ends sit on the shape outline, not outside the dot", () => {
    expect(onOutline({ x: 100, y: 205, side: "bottom" })).toEqual({ x: 100, y: 200, side: "bottom" });
    expect(onOutline({ x: 100, y: 295, side: "top" })).toEqual({ x: 100, y: 300, side: "top" });
    expect(onOutline({ x: 55, y: 10, side: "right" }).x).toBe(55 - HANDLE_HALF);
  });
  test("nearly lined-up shapes get one straight line on the target's axis", () => {
    expect(alignedLine({ x: 140, y: 100, side: "bottom" }, { x: 146, y: 160, side: "top" })).toEqual({ x1: 146, y1: 100, x2: 146, y2: 160 });
    expect(alignedLine({ x: 0, y: 50, side: "right" }, { x: 200, y: 44, side: "left" })).toEqual({ x1: 0, y1: 44, x2: 200, y2: 44 });
  });
  test("an elbow is kept when the offset is real or the sides do not face each other", () => {
    expect(alignedLine({ x: 140, y: 100, side: "bottom" }, { x: 140 + ALIGN_SNAP + 1, y: 160, side: "top" })).toBeNull();
    expect(alignedLine({ x: 140, y: 100, side: "bottom" }, { x: 140, y: 40, side: "top" })).toBeNull();
    expect(alignedLine({ x: 140, y: 100, side: "bottom" }, { x: 140, y: 160, side: "left" })).toBeNull();
  });
});

describe("mood boards", () => {
  test("moodboard is a canvas kind and its starter puts two directions in sections", () => {
    expect(isDiagramKind("moodboard")).toBe(true);
    const s = starter("moodboard", "en");
    expect(s.kind).toBe("moodboard");
    const dirs = boardDirections(s.data as DiagramData);
    expect(dirs.map((d) => d.text)).toEqual(["Direction A", "Direction B"]);
  });

  test("stored items keep only a safe picture, a real color and an http(s) link", () => {
    const d = normalizeDiagram({ nodes: [
      { id: "a", shape: "image", src: "/uploads/abc123.png" },
      { id: "b", shape: "image", src: "javascript:alert(1)" },
      { id: "c", shape: "image", src: "data:image/png;base64,AAAA" },
      { id: "d", shape: "swatch", hex: "ABC" },
      { id: "e", shape: "swatch", hex: "not a color" },
      { id: "f", shape: "link", url: "https://example.com/x" },
      { id: "g", shape: "link", url: "javascript:alert(1)" },
      { id: "h", shape: "rect", src: "/uploads/x.png", hex: "#fff", url: "https://x.y" },
    ], edges: [] });
    const by = (id: string) => d.nodes.find((n) => n.id === id)!;
    expect(by("a").src).toBe("/uploads/abc123.png");
    expect(by("b").src).toBeUndefined();
    expect(by("c").src).toBeUndefined();
    expect(by("d").hex).toBe("#aabbcc");
    expect(by("e").hex).toBe("#9ca3af");
    expect(by("f").url).toBe("https://example.com/x");
    expect(by("g").url).toBeUndefined();
    expect(by("h")).not.toHaveProperty("src");
    expect(by("h")).not.toHaveProperty("hex");
    expect(by("h")).not.toHaveProperty("url");
  });

  test("addresses and color codes are cleaned the way people type them", () => {
    expect(normalizeHex("#FfF")).toBe("#ffffff");
    expect(normalizeHex(" 7c3aed ")).toBe("#7c3aed");
    expect(normalizeHex("#12345")).toBeNull();
    expect(withScheme("example.com/a")).toBe("https://example.com/a");
    expect(withScheme("http://x.org")).toBe("http://x.org");
    expect(safeUrl("ftp://x.org")).toBe(false);
    expect(safeImageSrc("https://cdn.example.com/a.jpg")).toBe(true);
    expect(safeImageSrc("http://cdn.example.com/a.jpg")).toBe(false);
    expect(safeImageSrc("/uploads/../secret")).toBe(false);
    expect(hostOf("https://www.dribbble.com/shots/1")).toBe("dribbble.com");
  });

  test("dominant colors: the biggest areas first, near-duplicates skipped, transparent pixels ignored", () => {
    const px = (rgb: [number, number, number], n: number, a = 255) => Array.from({ length: n }, () => [...rgb, a]).flat();
    const pixels = [
      ...px([250, 250, 250], 60), ...px([235, 236, 238], 30), // two near-identical whites, in different buckets
      ...px([20, 40, 200], 40), ...px([230, 60, 30], 20), ...px([0, 255, 0], 500, 0),
    ];
    expect(dominantColors(pixels, 3)).toEqual(["#fafafa", "#1428c8", "#e63c1e"]);
  });

  test("dominant colors still fills the palette from a picture with few distinct colors", () => {
    const pixels = [...Array.from({ length: 10 }, () => [10, 10, 10, 255]).flat(), ...Array.from({ length: 5 }, () => [20, 20, 20, 255]).flat()];
    expect(dominantColors(pixels, 5)).toHaveLength(2);
  });

  test("pulled swatches sit in a row under the image, no wider than it once they need to shrink", () => {
    let i = 0;
    const row = swatchRow(["#000000", "#111111", "#222222", "#333333", "#444444"], { x: 100, y: 50, w: 300, h: 200 }, () => `s${++i}`);
    expect(row).toHaveLength(5);
    expect(row.every((s) => s.shape === "swatch" && s.y === 274)).toBe(true);
    expect(row[0].x).toBe(100);
    const last = row[4];
    expect(last.x + last.w).toBeLessThanOrEqual(100 + 300 + 12);
    expect(row.map((s) => s.hex)).toEqual(["#000000", "#111111", "#222222", "#333333", "#444444"]);
  });

  test("directions are sections with something inside, read left to right then top to bottom", () => {
    const n = (id: string, shape: DNode["shape"], x: number, y: number, w: number, h: number): DNode => ({ id, shape, x, y, w, h, text: id, color: "none" });
    const d: DiagramData = { nodes: [
      n("B", "frame", 600, 0, 400, 300), n("A", "frame", 0, 10, 400, 300), n("C", "frame", 0, 400, 400, 300),
      n("empty", "frame", 600, 400, 400, 300),
      n("img-a", "image", 20, 40, 100, 100), n("img-b", "swatch", 620, 40, 100, 100), n("img-c", "note", 20, 440, 100, 100),
      n("outside", "image", 2000, 2000, 100, 100),
    ], edges: [] };
    expect(boardDirections(d).map((f) => f.id)).toEqual(["A", "B", "C"]);
  });
});
