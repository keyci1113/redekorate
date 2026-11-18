import { createContext, memo, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode, type Ref, type RefObject } from "react";
import {
  Background, BackgroundVariant, BaseEdge, ConnectionMode, Controls, EdgeLabelRenderer, Handle, MarkerType, MiniMap, NodeResizer, Panel, Position,
  ReactFlow, ReactFlowProvider, SelectionMode, applyEdgeChanges, applyNodeChanges, getBezierPath, getNodesBounds, getSmoothStepPath, getStraightPath,
  useReactFlow, type Connection, type Edge, type EdgeChange, type EdgeProps, type FinalConnectionState, type Node, type NodeChange, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ArrowLeftRight, ArrowRight, Bold, Copy,
  Download, ExternalLink, Hand, Image as ImageIcon, Italic, Link2, List, ListOrdered, Minus, MousePointer2, Palette, Pipette, Redo2, Spline, Strikethrough, Trash2, Type, Underline, Undo2,
} from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { plural, t } from "../lib/i18n";
import { uid } from "../lib/hooks";
import { api } from "../lib/api";
import { useTheme } from "../lib/theme";
import { cx } from "../components/ui";
import {
  COLORS, DEFAULT_COLOR, DEFAULT_SIZE, SHAPES, alignedLine, onOutline, type ArrowStyle, type ColorId, type DEdge, type DNode, type DiagramData, type LineStyle, type PathStyle,
  TEXT_COLORS, type Shape, type Side, type TextAlign, type TextColor, type TextSize, type TextVAlign,
  dominantColors, hostOf, isMedia, normalizeHex, safeImageSrc, safeUrl, swatchRow, withScheme,
} from "./model";
import { domToRich, parseRich, toEditorHtml, type Seg } from "./richText";
import { ShapeIcon, ShapeSvg, fillOf, strokeOf, textBox, textOf } from "./shapes";

type ShapeData = { shape: Shape; text: string; color: ColorId; size?: TextSize; align?: TextAlign; valign?: TextVAlign; textColor?: TextColor; src?: string; hex?: string; url?: string };
type FNode = Node<ShapeData, "shape">;
type LineData = { label?: string; line: LineStyle; arrow: ArrowStyle; path: PathStyle };
type FEdge = Edge<LineData, "line">;
type Snap = { nodes: FNode[]; edges: FEdge[] };

const EDGE_COLOR = "var(--color-ink-2)";
const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const SIDE_POS: Record<Side, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };

export const SHAPE_NAMES: Record<Shape, string> = {
  rect: "Rectángulo", rounded: "Proceso", ellipse: "Elipse", diamond: "Decisión", triangle: "Triángulo", parallelogram: "Entrada / salida",
  hexagon: "Hexágono", cylinder: "Base de datos", page: "Página", pages: "Grupo de páginas", note: "Nota adhesiva", text: "Texto", frame: "Sección",
  image: "Imagen", swatch: "Muestra de color", link: "Enlace",
};
const SHORTCUT: Partial<Record<Shape, string>> = { rect: "r", ellipse: "o", diamond: "d", page: "p", note: "s", text: "t", frame: "f" };
const TOOL_GROUPS: { label: string; shapes: Shape[] }[] = [
  { label: "Figuras", shapes: ["rect", "rounded", "ellipse", "diamond", "triangle", "parallelogram", "hexagon", "cylinder"] },
  { label: "Arquitectura de información", shapes: ["page", "pages"] },
  { label: "Pizarra", shapes: ["note", "text", "frame"] },
];
/** A mood board's toolbar: its own items first, then the whiteboard pieces and a few plain shapes. */
const BOARD_GROUPS: { label: string; shapes: Shape[] }[] = [
  { label: "Tablero", shapes: ["image", "swatch", "link"] },
  { label: "Pizarra", shapes: ["note", "card", "text", "frame"] },
  { label: "Figuras", shapes: ["rect", "rounded", "ellipse"] },
];
const MEDIA_ICON: Partial<Record<Shape, ReactNode>> = { image: <ImageIcon size={16} />, swatch: <Palette size={16} />, link: <Link2 size={16} /> };
const SIZE_PX: Record<TextSize, number> = { s: 12, m: 14, l: 19, xl: 26 };
/** Fixed text colors, picked to read on the light pastel fills; "auto" follows the fill and the theme. */
const TEXT_COLOR_CSS: Record<Exclude<TextColor, "auto">, string> = {
  ink: "#16191F", gray: "#5B6270", red: "#C2262E", orange: "#C2410C", green: "#15803D", blue: "#1D4ED8", purple: "#7E22CE", white: "#FFFFFF",
};
const TEXT_COLOR_NAMES: Record<TextColor, string> = {
  auto: "Automático", ink: "Negro", gray: "Gris", red: "Rojo", orange: "Naranja", green: "Verde", blue: "Azul", purple: "Morado", white: "Blanco",
};
const JUSTIFY: Record<TextVAlign, string> = { top: "flex-start", middle: "center", bottom: "flex-end" };
/** Optional text settings, copied only when set so stored diagrams stay small. */
const textOpts = (d: { size?: TextSize; align?: TextAlign; valign?: TextVAlign; textColor?: TextColor }) => ({
  ...(d.size ? { size: d.size } : {}), ...(d.align ? { align: d.align } : {}), ...(d.valign ? { valign: d.valign } : {}),
  ...(d.textColor && d.textColor !== "auto" ? { textColor: d.textColor } : {}),
});
/** A mood board item's picture, color or address, copied only when the item has one. */
const mediaOpts = (d: { src?: string; hex?: string; url?: string }) => ({
  ...(d.src ? { src: d.src } : {}), ...(d.hex ? { hex: d.hex } : {}), ...(d.url ? { url: d.url } : {}),
});
/** Text with its formatting marks taken out, for an image's alt text. */
const plainText = (s: string) => s.replace(/\\(.)/g, "$1").replace(/[*_~]/g, "").replace(/^\s*(?:[-*]|\d+\.)\s+/gm, "").trim();

// ---------- stored diagram <-> React Flow ----------

const withMarkers = (e: FEdge): FEdge => {
  const marker = { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 };
  const arrow = e.data?.arrow ?? "end";
  return { ...e, markerEnd: arrow === "none" ? undefined : marker, markerStart: arrow === "both" ? marker : undefined };
};

function toFlow(d: DiagramData): Snap {
  return {
    nodes: d.nodes.map((n) => ({
      id: n.id, type: "shape", position: { x: n.x, y: n.y }, width: n.w, height: n.h, zIndex: n.shape === "frame" ? -1 : 0,
      data: { shape: n.shape, text: n.text, color: n.color, ...textOpts(n), ...mediaOpts(n) },
    })),
    edges: d.edges.map((e) => withMarkers({
      id: e.id, type: "line", source: e.from, target: e.to, sourceHandle: e.fromSide ?? null, targetHandle: e.toSide ?? null,
      data: { label: e.label, line: e.line ?? "solid", arrow: e.arrow ?? "end", path: e.path ?? "elbow" },
    })),
  };
}

function fromFlow(nodes: FNode[], edges: FEdge[]): DiagramData {
  return {
    nodes: nodes.map((n): DNode => ({
      id: n.id, shape: n.data.shape, x: Math.round(n.position.x), y: Math.round(n.position.y),
      w: Math.round(n.width ?? n.measured?.width ?? DEFAULT_SIZE[n.data.shape][0]), h: Math.round(n.height ?? n.measured?.height ?? DEFAULT_SIZE[n.data.shape][1]),
      text: n.data.text, color: n.data.color, ...textOpts(n.data), ...mediaOpts(n.data),
    })),
    edges: edges.map((e): DEdge => ({
      id: e.id, from: e.source, to: e.target,
      ...(e.sourceHandle ? { fromSide: e.sourceHandle as Side } : {}), ...(e.targetHandle ? { toSide: e.targetHandle as Side } : {}),
      ...(e.data?.label ? { label: e.data.label } : {}),
      line: e.data?.line ?? "solid", arrow: e.data?.arrow ?? "end", path: e.data?.path ?? "elbow",
    })),
  };
}

/** The side of `to` that faces `from`, so an arrow dropped anywhere on a shape enters it from the near side. */
export function facingSide(from: { position: { x: number; y: number }; width?: number; height?: number }, to: { position: { x: number; y: number }; width?: number; height?: number }): Side {
  const c = (n: typeof from) => ({ x: n.position.x + (n.width ?? 0) / 2, y: n.position.y + (n.height ?? 0) / 2 });
  const a = c(from), b = c(to), dx = a.x - b.x, dy = a.y - b.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "top" : "bottom";
}

// ---------- nodes and lines ----------

interface Ctx {
  readOnly: boolean; editing: string | null; editingEdge: string | null;
  startEdit: (id: string) => void; endEdit: () => void; setText: (id: string, text: string) => void;
  setLabel: (id: string, label: string) => void; snapshot: () => void;
  /** Makes a shape taller while its text is being written, so the text never hides behind a scrollbar. */
  grow: (id: string, h: number) => void;
}
const DiagramCtx = createContext<Ctx>({
  readOnly: true, editing: null, editingEdge: null, startEdit: () => {}, endEdit: () => {}, setText: () => {}, setLabel: () => {}, snapshot: () => {}, grow: () => {},
});

/** Formatted text as React elements; nothing is injected as HTML. */
function Segs({ segs }: { segs: Seg[] }) {
  return <>{segs.map((g, i) => {
    const deco = [g.u && "underline", g.s && "line-through"].filter(Boolean).join(" ");
    return g.b || g.i || deco
      ? <span key={i} style={{ fontWeight: g.b ? 700 : undefined, fontStyle: g.i ? "italic" : undefined, textDecoration: deco || undefined }}>{g.t}</span>
      : <span key={i}>{g.t}</span>;
  })}</>;
}

/** Formatted text as lines, bulleted lists and numbered lines. */
function RichText({ text }: { text: string }) {
  const lines = parseRich(text);
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    // A numbered line shows the number exactly as written, so "1. Set up" in older diagrams looks as before.
    if (l.kind === "p" || l.kind === "ol") {
      const segs = l.kind === "ol" ? [{ ...l.segs[0], t: `${"\u2003".repeat(l.depth)}${l.n}. ` }, ...l.segs] : l.segs;
      out.push(<div key={i}>{segs.length ? <Segs segs={segs} /> : "\u00a0"}</div>);
      i++; continue;
    }
    const kind = l.kind, start = i, items: ReactNode[] = [];
    for (; i < lines.length && lines[i].kind === kind; i++) items.push(<li key={i} style={{ marginInlineStart: lines[i].depth ? `${lines[i].depth * 1.1}em` : undefined }}><Segs segs={lines[i].segs} /></li>);
    out.push(<ul key={start} className="list-inside list-disc">{items}</ul>);
  }
  return <div className="w-full">{out}</div>;
}

/** The in-shape editor: what you see is what is saved, as markup (see richText.ts). */
function RichEditor({ value, onChange, onDone, onGrow }: { value: string; onChange: (v: string) => void; onDone: () => void; onGrow: (el: HTMLElement) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.innerHTML = toEditorHtml(value) || "<div><br></div>";
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
    onGrow(el);
    // Set once: React must not rewrite what the person is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cmd = (name: string) => { document.execCommand(name); };
  return (
    <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline aria-label={t("Texto")} data-rk-editor
      className="nodrag nowheel nopan w-full cursor-text outline-none [&_ol]:list-inside [&_ol]:list-decimal [&_ul]:list-inside [&_ul]:list-disc"
      onInput={(e) => { onChange(domToRich(e.currentTarget)); onGrow(e.currentTarget); }}
      onBlur={(e) => { if ((e.relatedTarget as HTMLElement | null)?.closest("[data-rk-texttools]")) return; onDone(); }}
      onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
        if (e.key === "Escape" || (e.key === "Enter" && mod)) { e.preventDefault(); e.currentTarget.blur(); return; }
        if (mod && e.shiftKey && k === "x") { e.preventDefault(); cmd("strikeThrough"); return; }
        if (mod && e.shiftKey && (k === "8" || k === "*")) { e.preventDefault(); cmd("insertUnorderedList"); return; }
        if (mod && e.shiftKey && (k === "7" || k === "&")) { e.preventDefault(); cmd("insertOrderedList"); return; }
      }} />
  );
}

const ShapeNode = memo(function ShapeNode({ id, data, selected, width, height }: NodeProps<FNode>) {
  const ctx = useContext(DiagramCtx);
  const w = width ?? DEFAULT_SIZE[data.shape][0], h = height ?? DEFAULT_SIZE[data.shape][1];
  const box = textBox(data.shape, w, h);
  const editing = ctx.editing === id;
  const frame = data.shape === "frame", note = data.shape === "note", text = data.shape === "text";
  const image = data.shape === "image", swatch = data.shape === "swatch", link = data.shape === "link";
  const left = note || text || frame || link || swatch;
  const align = data.align ?? (left ? "left" : "center"), valign = data.valign ?? (left ? "top" : "middle");
  const color = data.textColor && data.textColor !== "auto" ? TEXT_COLOR_CSS[data.textColor] : image ? "#FFFFFF" : frame || text || swatch || link ? "var(--color-ink)" : textOf(data.color);
  const style: CSSProperties = { fontSize: SIZE_PX[data.size ?? (frame ? "s" : "m")], color, lineHeight: 1.3, textAlign: align, justifyContent: JUSTIFY[valign] };
  // While typing, the shape gets taller until the text fits (never shorter, never wider).
  const grow = (el: HTMLElement) => {
    if (frame || image || swatch) return;
    const need = el.scrollHeight;
    let H = h;
    for (let k = 0; k < 60; k++) { const b = textBox(data.shape, w, H); if (H - b.top - b.bottom >= need) break; H += 8; }
    if (H > h) ctx.grow(id, H);
  };
  return (
    <div className="relative h-full w-full" onDoubleClick={(e) => { if (!ctx.readOnly) { e.stopPropagation(); ctx.startEdit(id); } }}>
      {!ctx.readOnly && <NodeResizer isVisible={selected} minWidth={30} minHeight={24} color="var(--color-accent)" onResizeStart={ctx.snapshot}
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-2 !border-[var(--color-accent)] !bg-[var(--color-surface)]" />}
      <ShapeSvg shape={data.shape} w={w} h={h} color={data.color} selected={selected && !ctx.readOnly && text} />
      {text && selected && !ctx.readOnly && <span className="pointer-events-none absolute inset-0 rounded border border-dashed border-[var(--color-accent)]" />}
      {isMedia(data.shape) && <MediaBody data={data} selected={selected && !ctx.readOnly} />}
      <div className={cx("absolute flex flex-col break-words whitespace-pre-wrap", editing ? "overflow-visible" : "overflow-hidden", frame && "font-semibold",
        image && (data.text || editing) && "rounded-md bg-[rgb(22_25_31/0.55)] px-1.5 py-0.5", swatch && "font-semibold", link && "font-semibold")}
        style={{ top: box.top, right: box.right, bottom: box.bottom, left: box.left, ...style, ...(swatch || link ? { fontSize: SIZE_PX[data.size ?? "s"] } : {}) }}>
        {editing
          ? <RichEditor value={data.text} onChange={(v) => ctx.setText(id, v)} onDone={ctx.endEdit} onGrow={grow} />
          : data.text ? <RichText text={data.text} />
          : !ctx.readOnly && (note || text) ? <span className="opacity-40">{t("Escribe algo")}</span>
          : link && data.url ? <span>{hostOf(data.url)}</span> : null}
      </div>
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Handle key={side} id={side} type="source" position={SIDE_POS[side]} isConnectable={!ctx.readOnly} className="rk-handle" />
      ))}
    </div>
  );
});

/** What a mood board item shows under its text: the picture, the color with its code, or the link's site and a way to open it. */
function MediaBody({ data, selected }: { data: ShapeData; selected: boolean }) {
  const ring = selected ? "ring-2 ring-[var(--color-accent)]" : "";
  if (data.shape === "image") {
    return data.src && safeImageSrc(data.src)
      ? <img src={data.src} alt={plainText(data.text)} draggable={false} className={cx("pointer-events-none absolute inset-0 h-full w-full rounded-md object-cover shadow-sm", ring)} />
      : <div className={cx("absolute inset-0 flex items-center justify-center rounded-md border border-dashed border-line-2 bg-paper text-ink-3", ring)}><ImageIcon size={22} aria-hidden /></div>;
  }
  if (data.shape === "swatch") {
    const hex = data.hex ?? "#9ca3af";
    return (
      <div className={cx("absolute inset-0 flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm", ring)}>
        <div className="min-h-0 flex-1" style={{ background: hex }} />
        <div className="h-[46px] shrink-0" />
        <span className="absolute right-2.5 bottom-1 left-2.5 truncate font-mono text-[11px] text-ink-3 uppercase">{hex}</span>
      </div>
    );
  }
  const ok = data.url && safeUrl(data.url);
  return (
    <div className={cx("absolute inset-0 rounded-lg border border-line bg-surface shadow-sm", ring)}>
      <span className="absolute top-2.5 left-3 flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent"><Link2 size={14} aria-hidden /></span>
      {ok
        ? <a href={data.url} target="_blank" rel="noopener noreferrer" title={t("Abrir el enlace")} aria-label={t("Abrir el enlace")}
            className="nodrag nopan focus-ring absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-ink/5 hover:text-ink"
            onDoubleClick={(e) => e.stopPropagation()}><ExternalLink size={13} /></a>
        : <span className="absolute right-3 bottom-1.5 left-[42px] truncate text-[11px] text-ink-3">{t("Sin dirección todavía")}</span>}
    </div>
  );
}

function LineEdge({ id, sourceX: sx0, sourceY: sy0, targetX: tx0, targetY: ty0, sourcePosition, targetPosition, data, selected, markerEnd, markerStart }: EdgeProps<FEdge>) {
  const ctx = useContext(DiagramCtx);
  const kind = data?.path ?? "elbow";
  // Lines touch the shape's outline, not the far side of the hidden dot.
  const from = onOutline({ x: sx0, y: sy0, side: sourcePosition as Side });
  const to = onOutline({ x: tx0, y: ty0, side: targetPosition as Side });
  const p = { sourceX: from.x, sourceY: from.y, targetX: to.x, targetY: to.y, sourcePosition, targetPosition };
  // Shapes that are nearly lined up get one clean straight line, never a small zig-zag.
  const line = kind === "straight" ? null : alignedLine(from, to);
  const [path, lx, ly] = line ? getStraightPath({ sourceX: line.x1, sourceY: line.y1, targetX: line.x2, targetY: line.y2 })
    : kind === "curved" ? getBezierPath(p)
    : kind === "straight" ? getStraightPath(p)
    : getSmoothStepPath({ ...p, borderRadius: 10, offset: 22 });
  const editing = ctx.editingEdge === id;
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} markerStart={markerStart} interactionWidth={18}
        style={{ stroke: selected && !ctx.readOnly ? "var(--color-accent)" : EDGE_COLOR, strokeWidth: selected && !ctx.readOnly ? 2.25 : 1.6, strokeDasharray: data?.line === "dashed" ? "6 5" : undefined }} />
      {(editing || data?.label) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan absolute rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs text-ink shadow-sm"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: "all" }}
            onDoubleClick={() => !ctx.readOnly && ctx.startEdit(`edge:${id}`)}>
            {editing
              ? <input autoFocus value={data?.label ?? ""} aria-label={t("Etiqueta de la flecha")} onChange={(e) => ctx.setLabel(id, e.target.value)} onBlur={ctx.endEdit}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
                  className="w-28 bg-transparent outline-none" />
              : data?.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { shape: ShapeNode };
const edgeTypes = { line: LineEdge };

// ---------- canvas ----------

export interface CanvasProps {
  data: DiagramData; onChange?: (d: DiagramData) => void; readOnly?: boolean;
  /** Name used for exported files. */
  title?: string;
  /** Extra buttons for the top-right corner. */
  actions?: ReactNode;
  /** Read-only canvases refit whenever this changes (a sitemap redrawn from its outline). */
  fitKey?: string;
  /** A mood board: its toolbar puts images, color swatches and links first, and images can be dropped or pasted in. */
  board?: boolean;
  /** Lets the page take a picture of one section (a mood board direction for a preference test). */
  handle?: Ref<CanvasHandle>;
}

export interface CanvasHandle {
  /** A PNG of everything inside one section, cropped to it; null when the section is gone. */
  exportFrame: (id: string) => Promise<Blob | null>;
}

/** A data: URL as a Blob, without fetch (the content security policy does not allow fetching data: URLs). */
function dataUrlBlob(url: string): Blob {
  const [head, body] = url.split(",", 2);
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "application/octet-stream";
  const bin = atob(body), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
/** The picture's own width and height, so an image lands on the board without being stretched. */
const naturalSize = (src: string) => new Promise<[number, number]>((resolve) => {
  const i = new Image();
  i.onload = () => resolve([i.naturalWidth || DEFAULT_SIZE.image[0], i.naturalHeight || DEFAULT_SIZE.image[1]]);
  i.onerror = () => resolve(DEFAULT_SIZE.image);
  i.src = src;
});

export function DiagramCanvas(props: CanvasProps) {
  return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>;
}

function Canvas({ data, onChange, readOnly = false, title = "diagram", actions, fitKey, board = false, handle }: CanvasProps) {
  const { theme } = useTheme();
  const rf = useReactFlow<FNode, FEdge>();
  const wrap = useRef<HTMLDivElement>(null);
  const initial = useMemo(() => toFlow(data), [readOnly ? data : null]); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes] = useState<FNode[]>(initial.nodes);
  const [edges, setEdges] = useState<FEdge[]>(initial.edges);
  const [editing, setEditing] = useState<string | null>(null);
  const [tool, setTool] = useState<"select" | "hand">("select");
  const [connecting, setConnecting] = useState(false);
  const live = useRef<Snap>({ nodes, edges });
  live.current = { nodes, edges };

  // A read-only canvas just shows what it is given (a sitemap redraws as its outline changes).
  useEffect(() => {
    if (!readOnly) return;
    setNodes(initial.nodes); setEdges(initial.edges);
    const id = requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 200 }));
    return () => cancelAnimationFrame(id);
  }, [readOnly, initial, fitKey, rf]);

  // ----- history -----
  const past = useRef<Snap[]>([]), future = useRef<Snap[]>([]);
  const [, bump] = useState(0);
  const snapshot = useCallback(() => {
    past.current.push(live.current);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    bump((x) => x + 1);
  }, []);
  const restore = (from: RefObject<Snap[]>, to: RefObject<Snap[]>) => {
    const s = from.current.pop();
    if (!s) return;
    to.current.push(live.current);
    setNodes(s.nodes.map((n) => ({ ...n, selected: false }))); setEdges(s.edges.map((e) => ({ ...e, selected: false })));
    setEditing(null); bump((x) => x + 1);
  };
  const undo = () => restore(past, future), redo = () => restore(future, past);

  // ----- saving: what changed reaches the document a moment after it settles -----
  const saved = useRef(JSON.stringify(fromFlow(initial.nodes, initial.edges)));
  useEffect(() => {
    if (readOnly || !onChange) return;
    const id = setTimeout(() => {
      const d = fromFlow(nodes, edges), s = JSON.stringify(d);
      if (s !== saved.current) { saved.current = s; onChange(d); }
    }, 250);
    return () => clearTimeout(id);
  }, [nodes, edges, readOnly, onChange]);

  // ----- editing -----
  const setText = useCallback((id: string, text: string) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n))), []);
  const setLabel = useCallback((id: string, label: string) => setEdges((es) => es.map((e) => (e.id === id ? { ...e, data: { ...e.data!, label } } : e))), []);
  const grow = useCallback((id: string, h: number) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, height: h } : n))), []);
  const ctx = useMemo<Ctx>(() => ({
    readOnly, editing: editing && !editing.startsWith("edge:") ? editing : null, editingEdge: editing?.startsWith("edge:") ? editing.slice(5) : null,
    startEdit: (id) => { snapshot(); setEditing(id); }, endEdit: () => setEditing(null), setText, setLabel, snapshot, grow,
  }), [readOnly, editing, snapshot, setText, setLabel, grow]);

  const onNodesChange = useCallback((c: NodeChange<FNode>[]) => setNodes((ns) => applyNodeChanges(c, ns)), []);
  const onEdgesChange = useCallback((c: EdgeChange<FEdge>[]) => setEdges((es) => applyEdgeChanges(c, es)), []);

  const center = () => {
    const r = wrap.current?.getBoundingClientRect();
    return rf.screenToFlowPosition(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 });
  };
  const makeNode = (shape: Shape, at: { x: number; y: number }, color?: ColorId): FNode => {
    const [w, h] = DEFAULT_SIZE[shape];
    return {
      id: uid(), type: "shape", position: { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2) }, width: w, height: h,
      zIndex: shape === "frame" ? -1 : 0, selected: true, data: { shape, text: "", color: color ?? DEFAULT_COLOR[shape] ?? "none" },
    };
  };
  const addShape = (shape: Shape, at = center()) => {
    if (shape === "image") { imageAt.current = at; fileInput.current?.click(); return; }
    snapshot();
    const n = makeNode(shape, at);
    if (shape === "swatch") n.data.hex = "#7c3aed";
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), n]);
    setEdges((es) => es.map((x) => ({ ...x, selected: false })));
    // A link starts with its address field open in the inspector; a swatch with its color picker.
    if (shape !== "frame" && shape !== "link" && shape !== "swatch") setEditing(n.id);
  };

  // ----- mood board: images, links and colors -----
  const fileInput = useRef<HTMLInputElement>(null), imageAt = useRef<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const addNodes = (made: FNode[]) => {
    if (!made.length) return;
    snapshot();
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), ...made.map((n) => ({ ...n, selected: true }))]);
    setEdges((es) => es.map((x) => ({ ...x, selected: false })));
  };
  async function addImages(files: File[], at = imageAt.current ?? center()) {
    imageAt.current = null;
    const pics = files.filter((f) => f.type.startsWith("image/"));
    if (!pics.length) return;
    setNotice({ text: plural(pics.length, { one: "Subiendo la imagen…", other: "Subiendo {n} imágenes…" }) });
    const made: FNode[] = [];
    let failed: string | null = null;
    for (const f of pics) {
      try {
        const src = await api.upload(f);
        const [nw, nh] = await naturalSize(src);
        const w = Math.min(320, nw), h = Math.max(40, Math.round((w * nh) / nw));
        made.push({ id: uid(), type: "shape", position: { x: 0, y: Math.round(at.y - h / 2) }, width: w, height: h, zIndex: 0, data: { shape: "image", text: "", color: "none", src } });
      } catch (e) { failed = (e as Error).message; }
    }
    // The pictures sit side by side, the row centered where they were dropped (or in the middle of the screen).
    const gap = 24, total = made.reduce((sum, n) => sum + (n.width ?? 0), 0) + gap * Math.max(0, made.length - 1);
    let x = at.x - total / 2;
    for (const n of made) { n.position.x = Math.round(x); x += (n.width ?? 0) + gap; }
    addNodes(made);
    setNotice(failed ? { text: failed, error: true } : null);
  }
  const addLink = (url: string, at = center()) => {
    const n = makeNode("link", at);
    n.data = { ...n.data, url, text: hostOf(url) };
    addNodes([n]);
  };
  async function pullColors(n: FNode) {
    if (!n.data.src) return;
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = n.data.src;
      await img.decode();
      const side = 96, k = side / Math.max(img.naturalWidth, img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0, c.width, c.height);
      const colors = dominantColors(g.getImageData(0, 0, c.width, c.height).data, 5);
      const w = n.width ?? DEFAULT_SIZE.image[0], h = n.height ?? DEFAULT_SIZE.image[1];
      addNodes(swatchRow(colors, { x: n.position.x, y: n.position.y, w, h }, uid).map((s) => ({
        id: s.id, type: "shape", position: { x: s.x, y: s.y }, width: s.w, height: s.h, zIndex: 0, data: { shape: "swatch", text: "", color: "none", hex: s.hex },
      })));
    } catch { setNotice({ text: t("No se pudieron leer los colores de esta imagen."), error: true }); }
  }
  // Pasting on a board: a copied picture becomes an image and a copied web address a link; otherwise the shapes copied here.
  const pastePending = useRef(false);
  useEffect(() => {
    if (readOnly || !board) return;
    const on = (e: ClipboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (el && el !== document.body && !wrap.current?.contains(el)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      const text = e.clipboardData?.getData("text/plain").trim() ?? "";
      if (files.length) { e.preventDefault(); pastePending.current = false; void addImages(files); return; }
      if (/^https?:\/\/\S+$/i.test(text) && safeUrl(text)) { e.preventDefault(); pastePending.current = false; addLink(text); }
    };
    window.addEventListener("paste", on);
    return () => window.removeEventListener("paste", on);
  });

  // ----- a picture of one section, for testing a board's directions -----
  useImperativeHandle(handle, () => ({
    exportFrame: async (id: string) => {
      const f = live.current.nodes.find((n) => n.id === id);
      const el = wrap.current?.querySelector<HTMLElement>(".react-flow__viewport");
      if (!f || !el) return null;
      setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
      setEdges((es) => es.map((e) => ({ ...e, selected: false })));
      await nextFrame();
      const width = Math.round(f.width ?? DEFAULT_SIZE.frame[0]), height = Math.round(f.height ?? DEFAULT_SIZE.frame[1]);
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--color-surface").trim() || "#ffffff";
      const url = await toPng(el, {
        backgroundColor: bg, width, height, pixelRatio: Math.min(2, 1600 / Math.max(width, height)),
        style: { width: `${width}px`, height: `${height}px`, transform: `translate(${-f.position.x}px, ${-f.position.y}px) scale(1)` },
        filter: (n: HTMLElement) => !(n instanceof HTMLElement && (n.classList.contains("react-flow__handle") || n.classList.contains("react-flow__resize-control"))),
      } as Parameters<typeof toPng>[1]);
      return dataUrlBlob(url);
    },
  }), []);
  const newEdge = (source: string, target: string, sourceHandle: string | null, targetHandle: string | null): FEdge =>
    withMarkers({ id: uid(), type: "line", source, target, sourceHandle, targetHandle, data: { line: "solid", arrow: "end", path: "elbow" } });

  const onConnect = (c: Connection) => {
    if (c.source === c.target && c.sourceHandle === c.targetHandle) return;
    snapshot();
    setEdges((es) => [...es, newEdge(c.source, c.target, c.sourceHandle ?? null, c.targetHandle ?? null)]);
  };
  // Letting go of an arrow on empty canvas makes a new shape there, already joined, as in FigJam.
  const onConnectEnd = (e: MouseEvent | TouchEvent, s: FinalConnectionState) => {
    setConnecting(false);
    if (readOnly || s.isValid || !s.fromNode || !s.fromHandle) return;
    const pt = "changedTouches" in e ? e.changedTouches[0] : e;
    const from = s.fromNode as unknown as FNode;
    // Dropped on a shape but not on one of its dots: join it at the side that faces the arrow's start.
    const over = document.elementFromPoint(pt.clientX, pt.clientY)?.closest(".react-flow__node")?.getAttribute("data-id");
    if (over === from.id) return;
    const target = over ? live.current.nodes.find((n) => n.id === over) : undefined;
    if (target) {
      snapshot();
      setEdges((es) => [...es, newEdge(from.id, target.id, s.fromHandle.id ?? null, facingSide(from, target))]);
      return;
    }
    const shape: Shape = ["note", "text", "frame"].includes(from.data.shape) || isMedia(from.data.shape) ? "rounded" : from.data.shape;
    const side = (s.fromHandle.id ?? "right") as Side;
    const n = makeNode(shape, rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY }), from.data.color);
    const [w, h] = DEFAULT_SIZE[shape];
    // Put the new shape so its near side, not its center, is where the arrow was dropped.
    const shift = { top: [0, -h / 2], bottom: [0, h / 2], left: [-w / 2, 0], right: [w / 2, 0] }[side];
    n.position = { x: n.position.x + shift[0], y: n.position.y + shift[1] };
    snapshot();
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), n]);
    setEdges((es) => [...es, newEdge(from.id, n.id, side, OPPOSITE[side])]);
    setEditing(n.id);
  };

  // A frame carries the shapes inside it when it moves.
  const carried = useRef<{ frame: { x: number; y: number }; id: string; inside: Map<string, { x: number; y: number }> }[]>([]);
  const onNodeDragStart = (_: unknown, __: FNode, dragged: FNode[]) => {
    snapshot();
    const moving = new Set(dragged.map((d) => d.id));
    carried.current = dragged.filter((f) => f.data.shape === "frame").map((f) => {
      const fw = f.width ?? 0, fh = f.height ?? 0;
      const inside = new Map<string, { x: number; y: number }>();
      for (const n of live.current.nodes) {
        if (moving.has(n.id) || n.id === f.id) continue;
        const nw = n.width ?? 0, nh = n.height ?? 0;
        if (n.position.x >= f.position.x && n.position.y >= f.position.y && n.position.x + nw <= f.position.x + fw && n.position.y + nh <= f.position.y + fh) inside.set(n.id, { ...n.position });
      }
      return { frame: { ...f.position }, id: f.id, inside };
    });
  };
  const onNodeDrag = (_: unknown, __: FNode, dragged: FNode[]) => {
    if (!carried.current.length) return;
    const now = new Map(dragged.map((d) => [d.id, d.position]));
    const moves = new Map<string, { x: number; y: number }>();
    for (const c of carried.current) {
      const p = now.get(c.id);
      if (!p) continue;
      const dx = p.x - c.frame.x, dy = p.y - c.frame.y;
      c.inside.forEach((start, id) => moves.set(id, { x: start.x + dx, y: start.y + dy }));
    }
    if (moves.size) setNodes((ns) => ns.map((n) => (moves.has(n.id) ? { ...n, position: moves.get(n.id)! } : n)));
  };

  // ----- selection: style, copy, paste -----
  const selNodes = nodes.filter((n) => n.selected), selEdges = edges.filter((e) => e.selected);
  const patchNodes = (f: (d: ShapeData) => Partial<ShapeData>) => {
    snapshot();
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, data: { ...n.data, ...f(n.data) }, zIndex: (f(n.data).shape ?? n.data.shape) === "frame" ? -1 : 0 } : n)));
  };
  const patchEdges = (p: Partial<LineData>) => {
    snapshot();
    setEdges((es) => es.map((e) => (e.selected ? withMarkers({ ...e, data: { ...e.data!, ...p } }) : e)));
  };
  const removeSelected = () => {
    if (!selNodes.length && !selEdges.length) return;
    snapshot();
    const gone = new Set(selNodes.map((n) => n.id));
    setNodes((ns) => ns.filter((n) => !n.selected));
    setEdges((es) => es.filter((e) => !e.selected && !gone.has(e.source) && !gone.has(e.target)));
  };
  const clip = useRef<Snap | null>(null), pasteCount = useRef(0);
  const copySel = () => {
    if (!selNodes.length) return;
    const ids = new Set(selNodes.map((n) => n.id));
    clip.current = { nodes: selNodes, edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
    pasteCount.current = 0;
  };
  const paste = () => {
    if (!clip.current) return;
    snapshot();
    const off = 24 * ++pasteCount.current, map = new Map<string, string>();
    const ns = clip.current.nodes.map((n) => { const id = uid(); map.set(n.id, id); return { ...n, id, selected: true, position: { x: n.position.x + off, y: n.position.y + off } }; });
    const es = clip.current.edges.map((e) => ({ ...e, id: uid(), source: map.get(e.source)!, target: map.get(e.target)!, selected: false }));
    setNodes((x) => [...x.map((n) => ({ ...n, selected: false })), ...ns]);
    setEdges((x) => [...x.map((e) => ({ ...e, selected: false })), ...es]);
  };

  // ----- keyboard -----
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (readOnly) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
    if (el && el !== document.body && !wrap.current?.contains(el)) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === "y") { e.preventDefault(); redo(); return; }
    if (mod && k === "c") { copySel(); return; }
    if (mod && k === "x") { copySel(); removeSelected(); return; }
    if (mod && k === "v") {
      // On a board the browser's paste event comes first, so a copied picture or address wins over copied shapes.
      if (!board) { e.preventDefault(); paste(); return; }
      pastePending.current = true;
      setTimeout(() => { if (pastePending.current) { pastePending.current = false; paste(); } }, 60);
      return;
    }
    if (mod && k === "d") { e.preventDefault(); copySel(); paste(); return; }
    if (mod && k === "a") { e.preventDefault(); setNodes((ns) => ns.map((n) => ({ ...n, selected: true }))); return; }
    if (mod || e.altKey) return;
    if (k === "enter" && selNodes.length === 1) { e.preventDefault(); ctx.startEdit(selNodes[0].id); return; }
    if (k === "escape") { setNodes((ns) => ns.map((n) => ({ ...n, selected: false }))); setEdges((es) => es.map((x) => ({ ...x, selected: false }))); return; }
    if (k === "v") { setTool("select"); return; }
    if (k === "h") { setTool("hand"); return; }
    const shape = (Object.entries(SHORTCUT) as [Shape, string][]).find(([, key]) => key === k)?.[0];
    if (shape) { e.preventDefault(); addShape(shape); }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // ----- drag a shape from the toolbar onto the canvas -----
  const onDrop = (e: DragEvent) => {
    if (board && !readOnly && e.dataTransfer.files.length) {
      e.preventDefault();
      void addImages([...e.dataTransfer.files], rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      return;
    }
    const url = board && !readOnly ? e.dataTransfer.getData("text/uri-list").split(/\r?\n/).find((l) => l && !l.startsWith("#")) : undefined;
    if (url && safeUrl(url)) { e.preventDefault(); addLink(url, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })); return; }
    const shape = e.dataTransfer.getData("application/x-rk-shape") as Shape;
    if (!SHAPES.includes(shape)) return;
    e.preventDefault();
    addShape(shape, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  // ----- export -----
  async function exportAs(format: "png" | "svg") {
    const el = wrap.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!el || !nodes.length) return;
    const pad = 40, b = getNodesBounds(nodes);
    const width = Math.ceil(b.width + pad * 2), height = Math.ceil(b.height + pad * 2);
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--color-surface").trim() || "#ffffff";
    const opts = {
      backgroundColor: bg, width, height, pixelRatio: 2,
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${pad - b.x}px, ${pad - b.y}px) scale(1)` },
      filter: (n: Node | HTMLElement) => !(n instanceof HTMLElement && (n.classList.contains("react-flow__handle") || n.classList.contains("react-flow__resize-control"))),
    };
    const url = format === "png" ? await toPng(el, opts as Parameters<typeof toPng>[1]) : await toSvg(el, opts as Parameters<typeof toSvg>[1]);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "diagram"}.${format}`;
    a.click();
  }

  const empty = nodes.length === 0;
  return (
    <DiagramCtx.Provider value={ctx}>
      <div ref={wrap} className={cx("rk-diagram relative h-full w-full", connecting && "is-connecting", readOnly && "is-readonly")}
        onDragOver={(e) => { if (!readOnly) e.preventDefault(); }} onDrop={onDrop}>
        <ReactFlow<FNode, FEdge>
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={readOnly ? undefined : onNodesChange} onEdgesChange={readOnly ? undefined : onEdgesChange}
          onConnect={onConnect} onConnectStart={() => setConnecting(true)} onConnectEnd={onConnectEnd}
          onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag}
          onEdgeDoubleClick={(_, e) => !readOnly && ctx.startEdit(`edge:${e.id}`)}
          onBeforeDelete={async () => { snapshot(); return true; }}
          connectionMode={ConnectionMode.Loose} connectionRadius={28}
          connectionLineStyle={{ stroke: "var(--color-accent)", strokeWidth: 2 }}
          nodesDraggable={!readOnly} nodesConnectable={!readOnly} elementsSelectable={!readOnly} edgesFocusable={!readOnly} nodesFocusable={!readOnly}
          selectionOnDrag={!readOnly && tool === "select"} selectionMode={SelectionMode.Partial}
          panOnDrag={readOnly || tool === "hand" ? true : [1, 2]} panOnScroll={!readOnly} zoomOnDoubleClick={false}
          elevateNodesOnSelect={false} snapToGrid snapGrid={[8, 8]} minZoom={0.1} maxZoom={4}
          deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]} multiSelectionKeyCode={["Shift", "Meta", "Control"]}
          fitView fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }} colorMode={theme} proOptions={{ hideAttribution: true }}
          className={cx(tool === "hand" && !readOnly && "cursor-grab")}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="var(--color-line-2)" />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap<FNode> position="bottom-left" pannable zoomable className="!hidden md:!block" nodeStrokeWidth={2}
            nodeColor={(n) => (n.data.shape === "text" ? "transparent" : fillOf(n.data.color))} nodeStrokeColor={(n) => strokeOf(n.data.color)} />

          {!readOnly && (
            <Panel position="top-left" className="!m-3">
              <Toolbar tool={tool} setTool={setTool} add={(s) => addShape(s)} groups={board ? BOARD_GROUPS : TOOL_GROUPS} />
            </Panel>
          )}
          <Panel position="top-right" className="!m-3 flex items-center gap-1.5">
            {!readOnly && <>
              <IconBtn label={t("Deshacer")} keys="⌘Z" onClick={undo} disabled={!past.current.length}><Undo2 size={16} /></IconBtn>
              <IconBtn label={t("Rehacer")} keys="⇧⌘Z" onClick={redo} disabled={!future.current.length}><Redo2 size={16} /></IconBtn>
            </>}
            <ExportButton disabled={empty} onExport={exportAs} />
            {actions}
          </Panel>
          {!readOnly && ctx.editing && nodes.some((n) => n.id === ctx.editing) && (
            <Panel position="top-center" className="!mt-3">
              <TextTools data={nodes.find((n) => n.id === ctx.editing)!.data}
                patch={(p) => setNodes((ns) => ns.map((n) => (n.id === ctx.editing ? { ...n, data: { ...n.data, ...p } } : n)))} />
            </Panel>
          )}
          {!readOnly && (selNodes.length > 0 || selEdges.length > 0) && !editing && (
            <Panel position="top-center" className="!mt-3">
              <Inspector nodes={selNodes} edges={selEdges} patchNodes={patchNodes} patchEdges={patchEdges} remove={removeSelected}
                duplicate={() => { copySel(); paste(); }} label={() => selEdges[0] && ctx.startEdit(`edge:${selEdges[0].id}`)}
                setQuiet={(p) => setNodes((ns) => ns.map((n) => (n.selected ? { ...n, data: { ...n.data, ...p } } : n)))} snapshot={snapshot}
                pullColors={() => selNodes[0] && void pullColors(selNodes[0])} />
            </Panel>
          )}
        </ReactFlow>
        {empty && !readOnly && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl border border-dashed border-line-2 bg-surface/80 p-5 text-center text-sm text-ink-2 backdrop-blur">
              <p className="font-semibold text-ink">{board ? t("Tablero vacío") : t("Lienzo vacío")}</p>
              <p className="mt-1">{board
                ? t("Arrastra imágenes aquí, pégalas con ⌘V o usa la barra de la izquierda para agregar imágenes, colores, enlaces y notas.")
                : t("Elige una figura en la barra de la izquierda o arrástrala aquí. Para unir dos figuras, arrastra desde uno de sus puntos hasta la otra.")}</p>
            </div>
          </div>
        )}
        {notice && (
          <div role={notice.error ? "alert" : "status"} className={cx("absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border px-3.5 py-2 text-sm shadow-[var(--shadow-lift)]",
            notice.error ? "border-bad/30 bg-bad-soft text-bad" : "border-line bg-surface text-ink-2")}>
            <span>{notice.text}</span>
            {notice.error && <button type="button" onClick={() => setNotice(null)} className="focus-ring rounded px-1 text-xs font-semibold underline">{t("Cerrar")}</button>}
          </div>
        )}
        {board && !readOnly && (
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden aria-hidden tabIndex={-1}
            onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; void addImages(fs); }} />
        )}
      </div>
    </DiagramCtx.Provider>
  );
}

// ---------- toolbars ----------

function IconBtn({ label, keys, onClick, disabled, active, children }: { label: string; keys?: string; onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={keys ? `${label} (${keys})` : label} aria-label={label} aria-pressed={active}
      className={cx("focus-ring flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-ink-2 transition hover:bg-ink/5 hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent",
        active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent")}>
      {children}
    </button>
  );
}

function Toolbar({ tool, setTool, add, groups }: { tool: "select" | "hand"; setTool: (t: "select" | "hand") => void; add: (s: Shape) => void; groups: { label: string; shapes: Shape[] }[] }) {
  return (
    <div className="flex max-h-[calc(100vh-9rem)] flex-col gap-0.5 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-lift)]" role="toolbar" aria-label={t("Herramientas")}>
      <IconBtn label={t("Seleccionar")} keys="V" onClick={() => setTool("select")} active={tool === "select"}><MousePointer2 size={16} /></IconBtn>
      <IconBtn label={t("Mover el lienzo")} keys="H" onClick={() => setTool("hand")} active={tool === "hand"}><Hand size={16} /></IconBtn>
      {groups.map((g) => (
        <div key={g.label} className="mt-1 flex flex-col gap-0.5 border-t border-line pt-1" role="group" aria-label={t(g.label)}>
          {g.shapes.map((s) => (
            <button key={s} type="button" draggable={s !== "image"} onDragStart={(e) => { e.dataTransfer.setData("application/x-rk-shape", s); e.dataTransfer.effectAllowed = "copy"; }}
              onClick={() => add(s)} title={SHORTCUT[s] ? `${t(SHAPE_NAMES[s])} (${SHORTCUT[s].toUpperCase()})` : s === "image" ? t("Subir imágenes") : t(SHAPE_NAMES[s])} aria-label={s === "image" ? t("Subir imágenes") : t(SHAPE_NAMES[s])}
              className={cx("focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition hover:bg-ink/5 hover:text-ink", s === "image" ? "cursor-pointer" : "cursor-grab")}>
              {MEDIA_ICON[s] ?? <ShapeIcon shape={s} />}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function ExportButton({ disabled, onExport }: { disabled: boolean; onExport: (f: "png" | "svg") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)} aria-expanded={open}
        className="focus-ring flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold text-ink-2 shadow-sm hover:text-ink disabled:opacity-40">
        <Download size={14} />{t("Exportar")}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-line bg-surface p-1 text-sm shadow-[var(--shadow-lift)]" onMouseLeave={() => setOpen(false)}>
          {(["png", "svg"] as const).map((f) => (
            <button key={f} type="button" onClick={() => { setOpen(false); onExport(f); }} className="block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-ink/5">
              {f === "png" ? t("Imagen PNG") : t("Vector SVG")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T | null; options: { id: T; label: string; icon: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-lg bg-ink/5 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} title={o.label} aria-label={o.label} aria-pressed={value === o.id}
          className={cx("flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-ink-2", value === o.id && "bg-surface text-ink shadow-sm")}>{o.icon}</button>
      ))}
    </div>
  );
}

const same = <T,>(xs: T[]): T | null => (xs.length && xs.every((x) => x === xs[0]) ? xs[0] : null);

function Inspector({ nodes, edges, patchNodes, patchEdges, remove, duplicate, label, setQuiet, snapshot, pullColors }: {
  nodes: FNode[]; edges: FEdge[]; patchNodes: (f: (d: ShapeData) => Partial<ShapeData>) => void; patchEdges: (p: Partial<LineData>) => void;
  remove: () => void; duplicate: () => void; label: () => void;
  /** Changes the selection without an undo step of its own (the step is taken when the field is first touched). */
  setQuiet: (p: Partial<ShapeData>) => void; snapshot: () => void; pullColors: () => void;
}) {
  const shapeNow = same(nodes.map((n) => n.data.shape)), colorNow = same(nodes.map((n) => n.data.color));
  const sep = <span className="mx-0.5 h-6 w-px bg-line" />;
  const media = nodes.some((n) => isMedia(n.data.shape));
  const one = nodes.length === 1 ? nodes[0] : null;
  return (
    <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lift)]">
      {one?.data.shape === "swatch" && <><SwatchFields key={one.id} hex={one.data.hex ?? "#9ca3af"} set={(hex) => setQuiet({ hex })} snapshot={snapshot} />{sep}</>}
      {one?.data.shape === "link" && <><LinkField key={one.id} data={one.data} set={setQuiet} snapshot={snapshot} />{sep}</>}
      {one?.data.shape === "image" && one.data.src && <>
        <button type="button" onClick={pullColors} title={t("Agrega los colores principales de la imagen como muestras debajo de ella.")}
          className="focus-ring flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-ink-2 hover:bg-ink/5 hover:text-ink"><Pipette size={14} />{t("Extraer colores")}</button>
        {sep}
      </>}
      {nodes.length > 0 && !media && <>
        <div className="flex gap-1 px-0.5" role="group" aria-label={t("Color")}>
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => patchNodes(() => ({ color: c }))} title={t(COLOR_NAMES[c])} aria-label={t(COLOR_NAMES[c])} aria-pressed={colorNow === c}
              className={cx("h-6 w-6 rounded-full border", colorNow === c ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "")}
              style={{ background: c === "none" ? "var(--color-surface)" : fillOf(c), borderColor: strokeOf(c) }} />
          ))}
        </div>
        {sep}
      </>}
      {nodes.length > 0 && <>
        {!media && <select value={shapeNow ?? ""} onChange={(e) => patchNodes(() => ({ shape: e.target.value as Shape }))} aria-label={t("Figura")}
          className="focus-ring h-7 rounded-md border border-line bg-surface px-1.5 text-xs">
          {!shapeNow && <option value="">{t("Varias")}</option>}
          {SHAPES.filter((s) => !isMedia(s)).map((s) => <option key={s} value={s}>{t(SHAPE_NAMES[s])}</option>)}
        </select>}
        {!media && <><TextSettings datas={nodes.map((n) => n.data)} patch={(p) => patchNodes(() => p)} />{sep}</>}
        <IconBtn label={t("Duplicar")} keys="⌘D" onClick={duplicate}><Copy size={15} /></IconBtn>
      </>}
      {nodes.length === 0 && edges.length > 0 && <>
        <Seg label={t("Línea")} value={same(edges.map((e) => e.data?.line ?? "solid"))} onChange={(line) => patchEdges({ line })} options={[
          { id: "solid", label: t("Línea continua"), icon: <Minus size={16} /> },
          { id: "dashed", label: t("Línea punteada"), icon: <svg width="16" height="16" aria-hidden><path d="M2 8h3M7 8h3M12 8h3" stroke="currentColor" strokeWidth="2" /></svg> },
        ]} />
        <Seg label={t("Puntas")} value={same(edges.map((e) => e.data?.arrow ?? "end"))} onChange={(arrow) => patchEdges({ arrow })} options={[
          { id: "end", label: t("Flecha al final"), icon: <ArrowRight size={16} /> },
          { id: "both", label: t("Flecha en ambos lados"), icon: <ArrowLeftRight size={16} /> },
          { id: "none", label: t("Sin flecha"), icon: <Minus size={16} /> },
        ]} />
        <Seg label={t("Trazo")} value={same(edges.map((e) => e.data?.path ?? "elbow"))} onChange={(path) => patchEdges({ path })} options={[
          { id: "elbow", label: t("En ángulo"), icon: <svg width="16" height="16" aria-hidden fill="none"><path d="M2 3h6v10h6" stroke="currentColor" strokeWidth="1.8" /></svg> },
          { id: "curved", label: t("Curva"), icon: <Spline size={16} /> },
          { id: "straight", label: t("Recta"), icon: <svg width="16" height="16" aria-hidden><path d="M2 14L14 2" stroke="currentColor" strokeWidth="1.8" /></svg> },
        ]} />
        {edges.length === 1 && <button type="button" onClick={label} className="focus-ring h-7 rounded-md px-2 text-xs font-semibold text-ink-2 hover:bg-ink/5 hover:text-ink">{edges[0].data?.label ? t("Editar etiqueta") : t("Agregar etiqueta")}</button>}
      </>}
      {sep}
      <IconBtn label={t("Eliminar")} keys="⌫" onClick={remove}><Trash2 size={15} /></IconBtn>
    </div>
  );
}

/** A swatch's color: the system picker and the code, which takes #abc or #aabbcc. */
function SwatchFields({ hex, set, snapshot }: { hex: string; set: (hex: string) => void; snapshot: () => void }) {
  const [draft, setDraft] = useState(hex);
  useEffect(() => setDraft(hex), [hex]);
  const commit = () => { const h = normalizeHex(draft); if (h && h !== hex) { snapshot(); set(h); } else setDraft(hex); };
  return (
    <div className="flex items-center gap-1.5 px-0.5">
      <input type="color" value={hex} aria-label={t("Color de la muestra")} onFocus={snapshot} onPointerDown={snapshot} onChange={(e) => set(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded-md border border-line bg-surface p-0.5" />
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }}
        aria-label={t("Código del color")} spellCheck={false} className="focus-ring h-7 w-[5.5rem] rounded-md border border-line bg-surface px-1.5 font-mono text-xs uppercase" />
    </div>
  );
}

/** A link's address. Typed without https:// it gets one; the title fills in with the site's name if it is empty. */
function LinkField({ data, set, snapshot }: { data: ShapeData; set: (p: Partial<ShapeData>) => void; snapshot: () => void }) {
  const [draft, setDraft] = useState(data.url ?? "");
  const [bad, setBad] = useState(false);
  const commit = () => {
    const url = withScheme(draft);
    if (!url) { setBad(false); return; }
    if (!safeUrl(url)) { setBad(true); return; }
    setBad(false); setDraft(url);
    if (url === data.url) return;
    snapshot();
    set({ url, ...(!data.text || (data.url && data.text === hostOf(data.url)) ? { text: hostOf(url) } : {}) });
  };
  return (
    <label className="flex items-center gap-1.5 px-0.5 text-xs text-ink-3">
      <Link2 size={14} aria-hidden />
      <input autoFocus={!data.url} value={draft} placeholder="https://" onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }} aria-label={t("Dirección del enlace")} aria-invalid={bad}
        className={cx("focus-ring h-7 w-56 rounded-md border bg-surface px-1.5 text-xs text-ink", bad ? "border-bad" : "border-line")} />
      {bad && <span className="text-bad">{t("Usa una dirección http o https.")}</span>}
    </label>
  );
}

const LEFT_SHAPES = new Set<Shape>(["note", "text", "frame", "link", "swatch"]);

/** Size, alignment and color of the text as a whole: in the inspector, and in the bar shown while typing. */
function TextSettings({ datas, patch, keepFocus }: { datas: ShapeData[]; patch: (p: Partial<ShapeData>) => void; keepFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  const def = (d: ShapeData) => LEFT_SHAPES.has(d.shape);
  const size = same(datas.map((d) => d.size ?? (d.shape === "frame" ? "s" : "m")));
  const align = same(datas.map((d) => d.align ?? (def(d) ? "left" : "center")));
  const valign = same(datas.map((d) => d.valign ?? (def(d) ? "top" : "middle")));
  const color = same(datas.map((d) => d.textColor ?? "auto"));
  const hold = keepFocus ? (e: { preventDefault: () => void }) => e.preventDefault() : undefined;
  return (
    <div className="flex flex-wrap items-center gap-1.5" onMouseDown={hold}>
      <Seg label={t("Tamaño del texto")} value={size} onChange={(s) => patch({ size: s })} options={[
        { id: "s", label: t("Texto chico"), icon: <Type size={11} /> }, { id: "m", label: t("Texto mediano"), icon: <Type size={14} /> },
        { id: "l", label: t("Texto grande"), icon: <Type size={17} /> }, { id: "xl", label: t("Texto muy grande"), icon: <Type size={20} /> },
      ]} />
      <Seg label={t("Alineación")} value={align} onChange={(a) => patch({ align: a })} options={[
        { id: "left", label: t("Alinear a la izquierda"), icon: <AlignLeft size={15} /> }, { id: "center", label: t("Centrar"), icon: <AlignCenter size={15} /> },
        { id: "right", label: t("Alinear a la derecha"), icon: <AlignRight size={15} /> },
      ]} />
      <Seg label={t("Posición vertical")} value={valign} onChange={(v) => patch({ valign: v })} options={[
        { id: "top", label: t("Arriba"), icon: <AlignVerticalJustifyStart size={15} /> }, { id: "middle", label: t("En medio"), icon: <AlignVerticalJustifyCenter size={15} /> },
        { id: "bottom", label: t("Abajo"), icon: <AlignVerticalJustifyEnd size={15} /> },
      ]} />
      <div className="relative">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} title={t("Color del texto")} aria-label={t("Color del texto")}
          className="focus-ring flex h-7 w-8 flex-col items-center justify-center rounded-md text-ink-2 hover:bg-ink/5">
          <span className="text-[13px] font-bold leading-none">A</span>
          <span className="mt-0.5 h-1 w-4 rounded-full border border-line-2" style={{ background: color && color !== "auto" ? TEXT_COLOR_CSS[color] : "linear-gradient(90deg,#16191F 50%,#fff 50%)" }} />
        </button>
        {open && (
          <div className="absolute left-1/2 z-20 mt-1 grid w-max -translate-x-1/2 grid-cols-5 gap-1 rounded-lg border border-line bg-surface p-1.5 shadow-[var(--shadow-lift)]" role="group" aria-label={t("Color del texto")}>
            {TEXT_COLORS.map((c) => (
              <button key={c} type="button" title={t(TEXT_COLOR_NAMES[c])} aria-label={t(TEXT_COLOR_NAMES[c])} aria-pressed={color === c}
                onClick={() => { patch({ textColor: c === "auto" ? undefined : c }); setOpen(false); }}
                className={cx("flex h-6 w-6 items-center justify-center rounded-full border border-line-2 text-[10px] font-bold", color === c && "ring-2 ring-accent ring-offset-1 ring-offset-surface")}
                style={{ background: c === "auto" ? "linear-gradient(135deg,#16191F 50%,#fff 50%)" : TEXT_COLOR_CSS[c] }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Shown while a shape's text is being written: marks on the selected words, then the settings for the whole text. */
function TextTools({ data, patch }: { data: ShapeData; patch: (p: Partial<ShapeData>) => void }) {
  const [state, setState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const read = () => {
      const q = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };
      setState({ bold: q("bold"), italic: q("italic"), underline: q("underline"), strikeThrough: q("strikeThrough"), insertUnorderedList: q("insertUnorderedList"), insertOrderedList: q("insertOrderedList") });
    };
    read();
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, []);
  const mark = (name: string, label: string, keys: string, icon: ReactNode) => (
    <button key={name} type="button" title={`${label} (${keys})`} aria-label={label} aria-pressed={!!state[name]}
      onMouseDown={(e) => e.preventDefault()} onClick={() => { document.execCommand(name); }}
      className={cx("focus-ring flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-ink-2 hover:bg-ink/5 hover:text-ink", state[name] && "bg-accent-soft text-accent")}>{icon}</button>
  );
  return (
    <div data-rk-texttools className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lift)]" role="toolbar" aria-label={t("Formato del texto")}
      onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("input,select")) e.preventDefault(); }}>
      {mark("bold", t("Negrita"), "⌘B", <Bold size={15} />)}
      {mark("italic", t("Cursiva"), "⌘I", <Italic size={15} />)}
      {mark("underline", t("Subrayado"), "⌘U", <Underline size={15} />)}
      {mark("strikeThrough", t("Tachado"), "⇧⌘X", <Strikethrough size={15} />)}
      <span className="mx-0.5 h-6 w-px bg-line" />
      {mark("insertUnorderedList", t("Lista con viñetas"), "⇧⌘8", <List size={15} />)}
      {mark("insertOrderedList", t("Lista numerada"), "⇧⌘7", <ListOrdered size={15} />)}
      <span className="mx-0.5 h-6 w-px bg-line" />
      <TextSettings datas={[data]} patch={patch} keepFocus />
    </div>
  );
}

const COLOR_NAMES: Record<ColorId, string> = {
  none: "Sin color", gray: "Gris", yellow: "Amarillo", orange: "Naranja", pink: "Rosa", purple: "Morado", blue: "Azul", green: "Verde",
};
