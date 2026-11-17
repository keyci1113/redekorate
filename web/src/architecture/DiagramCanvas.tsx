import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode, type RefObject } from "react";
import {
  Background, BackgroundVariant, BaseEdge, ConnectionMode, Controls, EdgeLabelRenderer, Handle, MarkerType, MiniMap, NodeResizer, Panel, Position,
  ReactFlow, ReactFlowProvider, SelectionMode, applyEdgeChanges, applyNodeChanges, getBezierPath, getNodesBounds, getSmoothStepPath, getStraightPath,
  useReactFlow, type Connection, type Edge, type EdgeChange, type EdgeProps, type FinalConnectionState, type Node, type NodeChange, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeftRight, ArrowRight, Copy, Download, Hand, Minus, MousePointer2, Redo2, Spline, Trash2, Type, Undo2 } from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { t } from "../lib/i18n";
import { uid } from "../lib/hooks";
import { useTheme } from "../lib/theme";
import { cx } from "../components/ui";
import {
  COLORS, DEFAULT_COLOR, DEFAULT_SIZE, SHAPES, alignedLine, onOutline, type ArrowStyle, type ColorId, type DEdge, type DNode, type DiagramData, type LineStyle, type PathStyle,
  type Shape, type Side, type TextSize,
} from "./model";
import { ShapeIcon, ShapeSvg, fillOf, strokeOf, textBox, textOf } from "./shapes";

type ShapeData = { shape: Shape; text: string; color: ColorId; size?: TextSize };
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
};
const SHORTCUT: Partial<Record<Shape, string>> = { rect: "r", ellipse: "o", diamond: "d", page: "p", note: "s", text: "t", frame: "f" };
const TOOL_GROUPS: { label: string; shapes: Shape[] }[] = [
  { label: "Figuras", shapes: ["rect", "rounded", "ellipse", "diamond", "triangle", "parallelogram", "hexagon", "cylinder"] },
  { label: "Arquitectura de información", shapes: ["page", "pages"] },
  { label: "Pizarra", shapes: ["note", "text", "frame"] },
];
const SIZE_PX: Record<TextSize, number> = { s: 12, m: 14, l: 19 };

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
      data: { shape: n.shape, text: n.text, color: n.color, ...(n.size ? { size: n.size } : {}) },
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
      text: n.data.text, color: n.data.color, ...(n.data.size ? { size: n.data.size } : {}),
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
}
const DiagramCtx = createContext<Ctx>({
  readOnly: true, editing: null, editingEdge: null, startEdit: () => {}, endEdit: () => {}, setText: () => {}, setLabel: () => {}, snapshot: () => {},
});

function EditText({ value, onChange, onDone, className, style }: { value: string; onChange: (v: string) => void; onDone: () => void; className?: string; style?: CSSProperties }) {
  return (
    <textarea autoFocus value={value} aria-label={t("Texto")} onChange={(e) => onChange(e.target.value)} onBlur={onDone}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) e.currentTarget.blur(); }}
      className={cx("nodrag nowheel nopan h-full w-full resize-none bg-transparent outline-none", className)} style={style} />
  );
}

const ShapeNode = memo(function ShapeNode({ id, data, selected, width, height }: NodeProps<FNode>) {
  const ctx = useContext(DiagramCtx);
  const w = width ?? DEFAULT_SIZE[data.shape][0], h = height ?? DEFAULT_SIZE[data.shape][1];
  const box = textBox(data.shape, w, h);
  const editing = ctx.editing === id;
  const frame = data.shape === "frame", note = data.shape === "note", text = data.shape === "text";
  const align = note || text || frame ? "items-start justify-start text-left" : "items-center justify-center text-center";
  const style = { fontSize: SIZE_PX[data.size ?? (frame ? "s" : "m")], color: frame || text ? "var(--color-ink)" : textOf(data.color), lineHeight: 1.3 };
  return (
    <div className="relative h-full w-full" onDoubleClick={(e) => { if (!ctx.readOnly) { e.stopPropagation(); ctx.startEdit(id); } }}>
      {!ctx.readOnly && <NodeResizer isVisible={selected} minWidth={30} minHeight={24} color="var(--color-accent)" onResizeStart={ctx.snapshot}
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-2 !border-[var(--color-accent)] !bg-[var(--color-surface)]" />}
      <ShapeSvg shape={data.shape} w={w} h={h} color={data.color} selected={selected && !ctx.readOnly && text} />
      {text && selected && !ctx.readOnly && <span className="pointer-events-none absolute inset-0 rounded border border-dashed border-[var(--color-accent)]" />}
      <div className={cx("absolute flex overflow-hidden break-words whitespace-pre-wrap", align, frame && "font-semibold")}
        style={{ top: box.top, right: box.right, bottom: box.bottom, left: box.left, ...style }}>
        {editing
          ? <EditText value={data.text} onChange={(v) => ctx.setText(id, v)} onDone={ctx.endEdit} className={cx(!(note || text || frame) && "text-center")} style={{ ...style, ...(note || text || frame ? {} : { paddingTop: Math.max(0, (h - box.top - box.bottom) / 2 - 10) }) }} />
          : data.text ? <span className="max-h-full">{data.text}</span>
          : !ctx.readOnly && (note || text) ? <span className="opacity-40">{t("Escribe algo")}</span> : null}
      </div>
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Handle key={side} id={side} type="source" position={SIDE_POS[side]} isConnectable={!ctx.readOnly} className="rk-handle" />
      ))}
    </div>
  );
});

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
}

export function DiagramCanvas(props: CanvasProps) {
  return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>;
}

function Canvas({ data, onChange, readOnly = false, title = "diagram", actions, fitKey }: CanvasProps) {
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
  const ctx = useMemo<Ctx>(() => ({
    readOnly, editing: editing && !editing.startsWith("edge:") ? editing : null, editingEdge: editing?.startsWith("edge:") ? editing.slice(5) : null,
    startEdit: (id) => { snapshot(); setEditing(id); }, endEdit: () => setEditing(null), setText, setLabel, snapshot,
  }), [readOnly, editing, snapshot, setText, setLabel]);

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
    snapshot();
    const n = makeNode(shape, at);
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), n]);
    setEdges((es) => es.map((x) => ({ ...x, selected: false })));
    if (shape !== "frame") setEditing(n.id);
  };
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
    const shape: Shape = ["note", "text", "frame"].includes(from.data.shape) ? "rounded" : from.data.shape;
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
    if (mod && k === "v") { e.preventDefault(); paste(); return; }
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
              <Toolbar tool={tool} setTool={setTool} add={(s) => addShape(s)} />
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
          {!readOnly && (selNodes.length > 0 || selEdges.length > 0) && !editing && (
            <Panel position="top-center" className="!mt-3">
              <Inspector nodes={selNodes} edges={selEdges} patchNodes={patchNodes} patchEdges={patchEdges} remove={removeSelected}
                duplicate={() => { copySel(); paste(); }} label={() => selEdges[0] && ctx.startEdit(`edge:${selEdges[0].id}`)} />
            </Panel>
          )}
        </ReactFlow>
        {empty && !readOnly && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl border border-dashed border-line-2 bg-surface/80 p-5 text-center text-sm text-ink-2 backdrop-blur">
              <p className="font-semibold text-ink">{t("Lienzo vacío")}</p>
              <p className="mt-1">{t("Elige una figura en la barra de la izquierda o arrástrala aquí. Para unir dos figuras, arrastra desde uno de sus puntos hasta la otra.")}</p>
            </div>
          </div>
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

function Toolbar({ tool, setTool, add }: { tool: "select" | "hand"; setTool: (t: "select" | "hand") => void; add: (s: Shape) => void }) {
  return (
    <div className="flex max-h-[calc(100vh-9rem)] flex-col gap-0.5 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-lift)]" role="toolbar" aria-label={t("Herramientas")}>
      <IconBtn label={t("Seleccionar")} keys="V" onClick={() => setTool("select")} active={tool === "select"}><MousePointer2 size={16} /></IconBtn>
      <IconBtn label={t("Mover el lienzo")} keys="H" onClick={() => setTool("hand")} active={tool === "hand"}><Hand size={16} /></IconBtn>
      {TOOL_GROUPS.map((g) => (
        <div key={g.label} className="mt-1 flex flex-col gap-0.5 border-t border-line pt-1" role="group" aria-label={t(g.label)}>
          {g.shapes.map((s) => (
            <button key={s} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData("application/x-rk-shape", s); e.dataTransfer.effectAllowed = "copy"; }}
              onClick={() => add(s)} title={SHORTCUT[s] ? `${t(SHAPE_NAMES[s])} (${SHORTCUT[s].toUpperCase()})` : t(SHAPE_NAMES[s])} aria-label={t(SHAPE_NAMES[s])}
              className="focus-ring flex h-8 w-8 cursor-grab items-center justify-center rounded-lg text-ink-2 transition hover:bg-ink/5 hover:text-ink">
              <ShapeIcon shape={s} />
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

function Inspector({ nodes, edges, patchNodes, patchEdges, remove, duplicate, label }: {
  nodes: FNode[]; edges: FEdge[]; patchNodes: (f: (d: ShapeData) => Partial<ShapeData>) => void; patchEdges: (p: Partial<LineData>) => void;
  remove: () => void; duplicate: () => void; label: () => void;
}) {
  const shapeNow = same(nodes.map((n) => n.data.shape)), colorNow = same(nodes.map((n) => n.data.color)), sizeNow = same(nodes.map((n) => n.data.size ?? "m"));
  const sep = <span className="mx-0.5 h-6 w-px bg-line" />;
  return (
    <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lift)]">
      {nodes.length > 0 && <>
        <div className="flex gap-1 px-0.5" role="group" aria-label={t("Color")}>
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => patchNodes(() => ({ color: c }))} title={t(COLOR_NAMES[c])} aria-label={t(COLOR_NAMES[c])} aria-pressed={colorNow === c}
              className={cx("h-6 w-6 rounded-full border", colorNow === c ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "")}
              style={{ background: c === "none" ? "var(--color-surface)" : fillOf(c), borderColor: strokeOf(c) }} />
          ))}
        </div>
        {sep}
        <select value={shapeNow ?? ""} onChange={(e) => patchNodes(() => ({ shape: e.target.value as Shape }))} aria-label={t("Figura")}
          className="focus-ring h-7 rounded-md border border-line bg-surface px-1.5 text-xs">
          {!shapeNow && <option value="">{t("Varias")}</option>}
          {SHAPES.map((s) => <option key={s} value={s}>{t(SHAPE_NAMES[s])}</option>)}
        </select>
        <Seg label={t("Tamaño del texto")} value={sizeNow} onChange={(size) => patchNodes(() => ({ size }))} options={[
          { id: "s", label: t("Texto chico"), icon: <Type size={11} /> }, { id: "m", label: t("Texto mediano"), icon: <Type size={14} /> }, { id: "l", label: t("Texto grande"), icon: <Type size={17} /> },
        ]} />
        {sep}
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

const COLOR_NAMES: Record<ColorId, string> = {
  none: "Sin color", gray: "Gris", yellow: "Amarillo", orange: "Naranja", pink: "Rosa", purple: "Morado", blue: "Azul", green: "Verde",
};
