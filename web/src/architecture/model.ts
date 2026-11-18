/**
 * Architecture section: diagrams drawn on a canvas (shapes joined by arrows) and sitemaps written as an outline.
 * Both are stored as documents (kind "diagram" or "sitemap"), so sharing, comments, duplicates and the API work as for
 * any other document. This file is the data model and holds no React, so it can be tested on its own.
 */
import { tr, type Lang } from "../lib/i18n";

export const DIAGRAM_KINDS = ["diagram", "sitemap", "moodboard"] as const;
export type DiagramKind = (typeof DIAGRAM_KINDS)[number];
export const isDiagramKind = (kind: string): kind is DiagramKind => (DIAGRAM_KINDS as readonly string[]).includes(kind);

/** Every shape the canvas can draw. server/src/mcp/reference.ts describes the same list for outside assistants. */
export const SHAPES = [
  "rect", "rounded", "ellipse", "diamond", "triangle", "parallelogram", "hexagon", "cylinder",
  "page", "pages", "note", "text", "frame", "image", "swatch", "link",
] as const;
export type Shape = (typeof SHAPES)[number];
/** Mood board items: they hold a picture, a color or a web address instead of a drawn outline. */
export const MEDIA_SHAPES = ["image", "swatch", "link"] as const satisfies readonly Shape[];
export const isMedia = (s: Shape) => (MEDIA_SHAPES as readonly Shape[]).includes(s);

export const COLORS = ["none", "gray", "yellow", "orange", "pink", "purple", "blue", "green"] as const;
export type ColorId = (typeof COLORS)[number];
export const TEXT_SIZES = ["s", "m", "l", "xl"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];
export const TEXT_VALIGNS = ["top", "middle", "bottom"] as const;
export type TextVAlign = (typeof TEXT_VALIGNS)[number];
/** Text colors on top of the shape's fill. "auto" (or none) follows the fill, readable in light and dark mode. */
export const TEXT_COLORS = ["auto", "ink", "gray", "red", "orange", "green", "blue", "purple", "white"] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

export type Side = "top" | "right" | "bottom" | "left";
export type LineStyle = "solid" | "dashed";
export type ArrowStyle = "end" | "both" | "none";
export type PathStyle = "elbow" | "curved" | "straight";

export interface DNode { id: string; shape: Shape; x: number; y: number; w: number; h: number; text: string; color: ColorId; size?: TextSize;
  /** Formatting of the text as a whole; bold, italic, lists and the like live in the text itself (see richText.ts). */
  align?: TextAlign; valign?: TextVAlign; textColor?: TextColor;
  /** image: the picture's address. swatch: its color as #rrggbb. link: the web page it points to. */
  src?: string; hex?: string; url?: string;
}
export interface DEdge {
  id: string; from: string; to: string; fromSide?: Side; toSide?: Side;
  label?: string; line?: LineStyle; arrow?: ArrowStyle; path?: PathStyle;
}
export interface DiagramData { nodes: DNode[]; edges: DEdge[] }
export interface SitemapData { outline: string }

/** Size a new shape gets when it is added from the toolbar. */
export const DEFAULT_SIZE: Record<Shape, [number, number]> = {
  rect: [160, 80], rounded: [160, 80], ellipse: [140, 90], diamond: [150, 110], triangle: [130, 110],
  parallelogram: [170, 80], hexagon: [160, 90], cylinder: [120, 110], page: [150, 110], pages: [150, 110],
  note: [180, 180], text: [180, 40], frame: [480, 320],
  image: [240, 180], swatch: [120, 150], link: [240, 76],
};
export const DEFAULT_COLOR: Partial<Record<Shape, ColorId>> = { note: "yellow", frame: "gray" };

const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Reads stored (or API-written) content into a valid diagram: unknown shapes become rectangles, dangling arrows are dropped. */
export function normalizeDiagram(raw: unknown): DiagramData {
  const r = (raw ?? {}) as { nodes?: unknown; edges?: unknown };
  const seen = new Set<string>();
  const nodes: DNode[] = [];
  for (const n of Array.isArray(r.nodes) ? r.nodes : []) {
    const o = (n ?? {}) as Record<string, unknown>;
    const id = str(o.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const shape = pick(o.shape, SHAPES, "rect");
    const [w, h] = DEFAULT_SIZE[shape];
    const node: DNode = {
      id, shape, x: num(o.x, 0), y: num(o.y, 0), w: Math.max(20, num(o.w, w)), h: Math.max(20, num(o.h, h)),
      text: str(o.text), color: pick(o.color, COLORS, DEFAULT_COLOR[shape] ?? "none"),
    };
    if (o.size !== undefined) node.size = pick(o.size, TEXT_SIZES, "m");
    if (TEXT_ALIGNS.includes(o.align as TextAlign)) node.align = o.align as TextAlign;
    if (TEXT_VALIGNS.includes(o.valign as TextVAlign)) node.valign = o.valign as TextVAlign;
    if (TEXT_COLORS.includes(o.textColor as TextColor) && o.textColor !== "auto") node.textColor = o.textColor as TextColor;
    if (shape === "image" && safeImageSrc(o.src)) node.src = o.src as string;
    if (shape === "swatch") node.hex = normalizeHex(o.hex) ?? "#9ca3af";
    if (shape === "link" && safeUrl(o.url)) node.url = o.url as string;
    nodes.push(node);
  }
  const edges: DEdge[] = [];
  const edgeIds = new Set<string>();
  for (const e of Array.isArray(r.edges) ? r.edges : []) {
    const o = (e ?? {}) as Record<string, unknown>;
    const id = str(o.id), from = str(o.from), to = str(o.to);
    if (!id || edgeIds.has(id) || !seen.has(from) || !seen.has(to)) continue;
    edgeIds.add(id);
    const edge: DEdge = { id, from, to };
    if (SIDES.includes(o.fromSide as Side)) edge.fromSide = o.fromSide as Side;
    if (SIDES.includes(o.toSide as Side)) edge.toSide = o.toSide as Side;
    if (str(o.label)) edge.label = str(o.label);
    edge.line = pick(o.line, ["solid", "dashed"] as const, "solid");
    edge.arrow = pick(o.arrow, ["end", "both", "none"] as const, "end");
    edge.path = pick(o.path, ["elbow", "curved", "straight"] as const, "elbow");
    edges.push(edge);
  }
  return { nodes, edges };
}

// ---------- mood boards: pictures, colors and links ----------

/** A picture uploaded to this app, or any https address. Anything else (javascript:, data:, http:) is dropped. */
export function safeImageSrc(v: unknown): v is string {
  return typeof v === "string" && (/^\/uploads\/[A-Za-z0-9._-]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/i.test(v));
}
/** A link a person can open: http or https only. */
export function safeUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 2000) return false;
  try { const u = new URL(v); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}
/** Accepts "#abc", "abc", "#AABBCC" or "aabbcc" and returns "#aabbcc"; null when it is not a color. */
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}
/** Adds https:// to an address typed without it ("example.com"), so the link opens. */
export function withScheme(v: string): string {
  const s = v.trim();
  return !s || /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
}
export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;

/**
 * The main colors of a picture, from its RGBA pixels: colors are grouped into buckets, the fullest buckets win,
 * and a color too close to one already picked is skipped so the palette is not five shades of the same thing.
 */
export function dominantColors(px: Uint8ClampedArray | number[], count = 5): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const k = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    k.n++; k.r += r; k.g += g; k.b += b;
    buckets.set(key, k);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).map((k) => [k.r / k.n, k.g / k.n, k.b / k.n] as const);
  const picked: (readonly [number, number, number])[] = [];
  for (const minDist of [48, 24, 0]) {
    for (const c of ranked) {
      if (picked.length >= count) break;
      if (picked.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) <= minDist)) continue;
      picked.push(c);
    }
  }
  return picked.map((c) => toHex(c[0], c[1], c[2]));
}

/** A row of swatches under an image, one per color, as the "Pull colors" button lays them out. */
export function swatchRow(colors: string[], below: { x: number; y: number; w: number; h: number }, makeId: () => string): DNode[] {
  const [w, h] = DEFAULT_SIZE.swatch, gap = 12, count = Math.max(1, colors.length);
  // As wide as fits under the image, never wider than a normal swatch nor too thin to read its code.
  const sw = Math.max(48, Math.min(w, Math.floor((below.w - gap * (count - 1)) / count)));
  const sh = Math.max(96, Math.round((h * sw) / w));
  return colors.map((hex, i) => ({ id: makeId(), shape: "swatch", x: below.x + i * (sw + gap), y: below.y + below.h + 24, w: sw, h: sh, text: "", color: "none", hex }));
}

/**
 * The design directions on a board, for a preference test: every section (frame) that holds at least one picture,
 * swatch or link, left to right and then top to bottom, as a person reads the board.
 */
export function boardDirections(d: DiagramData): DNode[] {
  const inside = (f: DNode, n: DNode) => n.x >= f.x && n.y >= f.y && n.x + n.w <= f.x + f.w && n.y + n.h <= f.y + f.h;
  return d.nodes
    .filter((f) => f.shape === "frame" && d.nodes.some((n) => n.id !== f.id && n.shape !== "frame" && inside(f, n)))
    .sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) / 2 ? a.y - b.y : a.x - b.x));
}

// ---------- sitemap: an indented outline, drawn as a tree ----------

export interface OutlineNode { id: string; label: string; depth: number; children: OutlineNode[] }

/**
 * One page per line; indenting a line (spaces or tabs) puts it under the line above, the same format the tree test uses.
 * Any amount of indent works: a line is a child of the nearest line above it that is indented less.
 */
export function parseOutline(text: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: { indent: number; node: OutlineNode }[] = [];
  let n = 0;
  for (const raw of text.replace(/\t/g, "  ").split(/\r?\n/)) {
    const label = raw.trim().replace(/^[-*•]\s+/, "");
    if (!label) continue;
    const indent = raw.length - raw.trimStart().length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1]?.node;
    const node: OutlineNode = { id: `p${++n}`, label, depth: parent ? parent.depth + 1 : 0, children: [] };
    (parent ? parent.children : roots).push(node);
    stack.push({ indent, node });
  }
  return roots;
}

export const SITEMAP = { w: 170, h: 56, gapX: 40, rowGap: 80, stackGap: 18, indent: 36 } as const;

/**
 * The classic sitemap layout: the home page on top, the main sections in one row under it, and everything below a
 * section stacked in a column, indented one step per level and joined from the left. With several top lines and no
 * single home page, the top lines themselves form the row.
 */
export function layoutSitemap(roots: OutlineNode[], lang: Lang = "es"): DiagramData {
  const { w, h, gapX, rowGap, stackGap, indent } = SITEMAP;
  const nodes: DNode[] = [];
  const edges: DEdge[] = [];
  const add = (o: OutlineNode, x: number, y: number) =>
    nodes.push({ id: o.id, shape: "page", x, y, w, h, text: o.label, color: o.depth === 0 ? "purple" : o.depth === 1 && roots.length === 1 ? "blue" : "none" });
  const link = (from: OutlineNode, to: OutlineNode, fromSide: Side, toSide: Side) =>
    edges.push({ id: `${from.id}-${to.id}`, from: from.id, to: to.id, fromSide, toSide, line: "solid", arrow: "none", path: "elbow" });

  const home = roots.length === 1 ? roots[0] : null;
  const row = home ? home.children : roots;
  const rowY = home ? h + rowGap : 0;
  // Column width grows with the deepest level under each section, so indented pages never overlap the next column.
  const deepest = (o: OutlineNode): number => o.children.reduce((m, c) => Math.max(m, deepest(c)), o.depth);
  let x = 0;
  for (const top of row) {
    add(top, x, rowY);
    if (home) link(home, top, "bottom", "top");
    let y = rowY + h + stackGap + 8;
    const walk = (parent: OutlineNode) => {
      for (const c of parent.children) {
        add(c, x + (c.depth - top.depth) * indent, y);
        link(parent, c, "left", "left");
        y += h + stackGap;
        walk(c);
      }
    };
    walk(top);
    x += w + gapX + (deepest(top) - top.depth) * indent;
  }
  if (home) {
    const width = row.length ? x - gapX : w;
    add(home, Math.round(width / 2 - w / 2), 0);
  }
  if (!nodes.length) nodes.push({ id: "empty", shape: "text", x: 0, y: 0, w: 260, h: 40, text: tr("Escribe páginas en el esquema", lang), color: "none" });
  return { nodes, edges };
}

export function outlineStats(roots: OutlineNode[]) {
  let pages = 0, depth = 0;
  const walk = (o: OutlineNode) => { pages++; depth = Math.max(depth, o.depth + 1); o.children.forEach(walk); };
  roots.forEach(walk);
  return { pages, depth };
}

// ---------- starters for a new diagram, written in the document's language ----------

export type StarterId = "blank" | "moodboard" | "flowchart" | "user_flow" | "system" | "sitemap";

const n = (id: string, shape: Shape, x: number, y: number, text: string, color: ColorId = "none", w?: number, h?: number): DNode => {
  const [dw, dh] = DEFAULT_SIZE[shape];
  return { id, shape, x, y, w: w ?? dw, h: h ?? dh, text, color };
};
const e = (from: string, to: string, label?: string, extra: Partial<DEdge> = {}): DEdge =>
  ({ id: `${from}-${to}`, from, to, label, line: "solid", arrow: "end", path: "elbow", ...extra });

export function starter(id: StarterId, lang: Lang): { kind: DiagramKind; data: DiagramData | SitemapData } {
  const T = (k: string) => tr(k, lang);
  switch (id) {
    case "moodboard":
      // Two empty directions side by side: each section becomes one option when the board is tested with participants.
      return { kind: "moodboard", data: {
        nodes: [
          { ...n("intro", "text", 0, -70, T("Pon cada dirección visual en su propia sección: imágenes, colores, notas y enlaces. Luego usa «Probar con participantes» para que elijan una."), "none", 1000, 44), size: "s" },
          n("dir-a", "frame", 0, 0, T("Dirección A"), "gray", 480, 420),
          n("dir-b", "frame", 540, 0, T("Dirección B"), "gray", 480, 420),
          n("note-a", "note", 30, 50, T("¿Qué debe sentir la persona?"), "yellow", 180, 140),
          n("note-b", "note", 570, 50, T("¿Qué debe sentir la persona?"), "yellow", 180, 140),
        ],
        edges: [],
      } };
    case "sitemap":
      return { kind: "sitemap", data: { outline: [
        T("Inicio"),
        `  ${T("Productos")}`, `    ${T("Categoría")}`, `      ${T("Detalle de producto")}`,
        `  ${T("Nosotros")}`, `    ${T("Equipo")}`,
        `  ${T("Ayuda")}`, `    ${T("Preguntas frecuentes")}`, `    ${T("Contacto")}`,
        `  ${T("Mi cuenta")}`,
      ].join("\n") } };
    case "flowchart":
      return { kind: "diagram", data: {
        nodes: [
          n("start", "ellipse", 10, 0, T("Inicio|flow"), "green", 140, 70),
          n("step", "rounded", 0, 140, T("Paso"), "none"),
          n("check", "diamond", 5, 290, T("¿Condición?"), "yellow"),
          n("yes", "rounded", -200, 470, T("Sí: siguiente paso"), "none"),
          n("no", "rounded", 200, 470, T("No: otro camino"), "none"),
          n("end", "ellipse", 10, 640, T("Fin"), "pink", 140, 70),
        ],
        edges: [
          e("start", "step"), e("step", "check"),
          e("check", "yes", T("Sí"), { fromSide: "left", toSide: "top" }), e("check", "no", T("No"), { fromSide: "right", toSide: "top" }),
          e("yes", "end", undefined, { fromSide: "bottom", toSide: "left" }), e("no", "end", undefined, { fromSide: "bottom", toSide: "right" }),
        ],
      } };
    case "user_flow":
      return { kind: "diagram", data: {
        nodes: [
          n("entry", "ellipse", 0, 15, T("Punto de entrada"), "green", 150, 80),
          n("home", "page", 220, 0, T("Página de inicio"), "none"),
          n("search", "page", 440, 0, T("Resultados de búsqueda"), "none"),
          n("found", "diamond", 660, 0, T("¿Encontró lo que buscaba?"), "yellow", 170, 110),
          n("detail", "page", 900, 0, T("Detalle"), "none"),
          n("done", "ellipse", 1120, 15, T("Objetivo cumplido"), "pink", 150, 80),
          n("help", "page", 660, 200, T("Ayuda"), "none", 170, 110),
          n("note", "note", 220, 200, T("Anota aquí lo que la persona piensa o siente en cada paso."), "yellow", 200, 150),
        ],
        edges: [
          e("entry", "home", undefined, { fromSide: "right", toSide: "left" }), e("home", "search", undefined, { fromSide: "right", toSide: "left" }),
          e("search", "found", undefined, { fromSide: "right", toSide: "left" }), e("found", "detail", T("Sí"), { fromSide: "right", toSide: "left" }),
          e("detail", "done", undefined, { fromSide: "right", toSide: "left" }), e("found", "help", T("No"), { fromSide: "bottom", toSide: "top", line: "dashed" }),
        ],
      } };
    case "system":
      return { kind: "diagram", data: {
        nodes: [
          n("zone", "frame", -40, -60, T("Nuestra plataforma"), "gray", 760, 300),
          n("users", "ellipse", -260, 40, T("Personas usuarias"), "purple", 150, 90),
          n("web", "rounded", 0, 45, T("App web"), "blue"),
          n("api", "rounded", 260, 45, T("API"), "blue"),
          n("db", "cylinder", 520, 30, T("Base de datos"), "green", 130, 110),
          n("ext", "hexagon", 260, 300, T("Servicio externo"), "orange"),
        ],
        edges: [
          e("users", "web", "HTTPS", { fromSide: "right", toSide: "left" }), e("web", "api", "REST", { fromSide: "right", toSide: "left" }),
          e("api", "db", "SQL", { fromSide: "right", toSide: "left" }), e("api", "ext", undefined, { fromSide: "bottom", toSide: "top", line: "dashed", arrow: "both" }),
        ],
      } };
    default:
      return { kind: "diagram", data: { nodes: [], edges: [] } };
  }
}

/** A sitemap opened as a free diagram: same pages and lines, now movable and editable one by one. */
export function sitemapToDiagram(outline: string, lang: Lang): DiagramData {
  const d = layoutSitemap(parseOutline(outline), lang);
  return { nodes: d.nodes.map((x) => ({ ...x, id: `s-${x.id}` })), edges: d.edges.map((x) => ({ ...x, id: `s-${x.id}`, from: `s-${x.from}`, to: `s-${x.to}` })) };
}

/** Half the size of a connection dot. React Flow starts and ends lines on the outer edge of the dot, which leaves a gap. */
export const HANDLE_HALF = 5;
/** Two shapes this close to lined up get one straight line instead of a tiny zig-zag. */
export const ALIGN_SNAP = 16;

type End = { x: number; y: number; side: Side };

/** Move a line end from the outer edge of its dot back onto the shape's outline. */
export function onOutline({ x, y, side }: End): End {
  const d = HANDLE_HALF;
  return side === "top" ? { x, y: y + d, side } : side === "bottom" ? { x, y: y - d, side } : side === "left" ? { x: x + d, y, side } : { x: x - d, y, side };
}

/**
 * A straight line when two facing sides are almost lined up (bottom to top, right to left, and so on),
 * drawn on the target's axis so the arrowhead lands square on it. Null when an elbow or curve is needed.
 */
export function alignedLine(s: End, t: End): { x1: number; y1: number; x2: number; y2: number } | null {
  const vertical = (s.side === "bottom" && t.side === "top" && t.y > s.y) || (s.side === "top" && t.side === "bottom" && t.y < s.y);
  const horizontal = (s.side === "right" && t.side === "left" && t.x > s.x) || (s.side === "left" && t.side === "right" && t.x < s.x);
  if (vertical && Math.abs(t.x - s.x) <= ALIGN_SNAP) return { x1: t.x, y1: s.y, x2: t.x, y2: t.y };
  if (horizontal && Math.abs(t.y - s.y) <= ALIGN_SNAP) return { x1: s.x, y1: t.y, x2: t.x, y2: t.y };
  return null;
}
