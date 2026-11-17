import type { ColorId, Shape } from "./model";

/** Fill, outline and text for each color. They are theme tokens, so a diagram follows light and dark mode by itself. */
const FILL: Record<ColorId, string> = {
  none: "var(--color-surface)", gray: "var(--color-paper-2)",
  yellow: "var(--color-note-yellow)", orange: "var(--color-note-orange)", pink: "var(--color-note-pink)",
  purple: "var(--color-note-lavender)", blue: "var(--color-note-blue)", green: "var(--color-note-green)",
};
export const fillOf = (c: ColorId) => FILL[c];
export const strokeOf = (c: ColorId) => (c === "none" ? "var(--color-ink-3)" : c === "gray" ? "var(--color-line-2)" : `color-mix(in oklab, ${FILL[c]} 45%, #16191F)`);
/** The pastel fills stay light in dark mode too, so text on them is always dark. */
export const textOf = (c: ColorId) => (c === "none" || c === "gray" ? "var(--color-ink)" : "#16191F");
/** A frame is a light wash of its color behind the shapes it holds. */
const frameFill = (c: ColorId) => (c === "none" ? "transparent" : `color-mix(in oklab, ${FILL[c]} 40%, var(--color-surface))`);

/** Where the text sits inside each shape, so it never crosses the outline of a diamond, triangle or cylinder. */
export function textBox(shape: Shape, w: number, h: number): { top: number; right: number; bottom: number; left: number } {
  switch (shape) {
    case "diamond": return { top: h * 0.22, right: w * 0.2, bottom: h * 0.22, left: w * 0.2 };
    case "triangle": return { top: h * 0.42, right: w * 0.22, bottom: 6, left: w * 0.22 };
    case "parallelogram": case "hexagon": return { top: 6, right: Math.min(28, w * 0.2), bottom: 6, left: Math.min(28, w * 0.2) };
    case "cylinder": { const ry = Math.min(14, h * 0.15); return { top: ry * 2 + 2, right: 8, bottom: ry + 4, left: 8 }; }
    case "page": return { top: 10, right: 12, bottom: 8, left: 10 };
    case "pages": return { top: 14, right: 16, bottom: 8, left: 10 };
    case "note": return { top: 14, right: 14, bottom: 14, left: 14 };
    case "frame": return { top: 8, right: 12, bottom: h - 34, left: 12 };
    case "text": return { top: 2, right: 2, bottom: 2, left: 2 };
    default: return { top: 6, right: 10, bottom: 6, left: 10 };
  }
}

/** The outline of a shape at its real size (not stretched, so corners and folds keep their proportions). */
export function ShapeSvg({ shape, w, h, color, selected = false, strokeWidth = 1.5 }: { shape: Shape; w: number; h: number; color: ColorId; selected?: boolean; strokeWidth?: number }) {
  if (shape === "text") return null;
  const fill = shape === "frame" ? frameFill(color) : FILL[color];
  const stroke = selected ? "var(--color-accent)" : strokeOf(color);
  const s = strokeWidth / 2 + 0.5, W = w - s, H = h - s;
  const p = { fill, stroke, strokeWidth, strokeLinejoin: "round" as const };
  let body;
  switch (shape) {
    case "rect": body = <rect x={s} y={s} width={W - s} height={H - s} rx={3} {...p} />; break;
    case "rounded": body = <rect x={s} y={s} width={W - s} height={H - s} rx={Math.min(16, h / 2)} {...p} />; break;
    case "ellipse": body = <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - s} ry={h / 2 - s} {...p} />; break;
    case "diamond": body = <polygon points={`${w / 2},${s} ${W},${h / 2} ${w / 2},${H} ${s},${h / 2}`} {...p} />; break;
    case "triangle": body = <polygon points={`${w / 2},${s} ${W},${H} ${s},${H}`} {...p} />; break;
    case "parallelogram": { const k = Math.min(24, w * 0.18); body = <polygon points={`${k},${s} ${W},${s} ${w - k},${H} ${s},${H}`} {...p} />; break; }
    case "hexagon": { const k = Math.min(24, w * 0.2); body = <polygon points={`${k},${s} ${w - k},${s} ${W},${h / 2} ${w - k},${H} ${k},${H} ${s},${h / 2}`} {...p} />; break; }
    case "cylinder": {
      const ry = Math.min(14, h * 0.15), rx = w / 2 - s;
      body = <>
        <path d={`M${s},${ry} L${s},${h - ry} A${rx},${ry - s} 0 0 0 ${W},${h - ry} L${W},${ry}`} {...p} />
        <ellipse cx={w / 2} cy={ry} rx={rx} ry={ry - s} {...p} />
      </>;
      break;
    }
    case "page": {
      const f = Math.min(18, w * 0.15, h * 0.3);
      body = <>
        <path d={`M${s},${s} L${W - f},${s} L${W},${s + f} L${W},${H} L${s},${H} Z`} {...p} />
        <path d={`M${W - f},${s} L${W - f},${s + f} L${W},${s + f}`} {...p} fill="none" />
      </>;
      break;
    }
    case "pages": {
      const o = Math.min(7, w * 0.06, h * 0.08);
      body = <>
        <rect x={s + o} y={s} width={W - s - o} height={H - s - o} rx={3} {...p} />
        <rect x={s} y={s + o} width={W - s - o} height={H - s - o} rx={3} {...p} />
      </>;
      break;
    }
    case "note": body = <rect x={s} y={s} width={W - s} height={H - s} rx={2} fill={fill} stroke={selected ? stroke : "none"} strokeWidth={strokeWidth} />; break;
    case "frame": body = <rect x={s} y={s} width={W - s} height={H - s} rx={Math.min(12, w / 6, h / 6)} fill={fill} stroke={selected ? stroke : strokeOf(color)} strokeWidth={1} strokeDasharray={color === "none" ? "6 5" : undefined} />; break;
  }
  return <svg width={w} height={h} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden style={shape === "note" ? { filter: "drop-shadow(0 2px 3px rgb(22 25 31 / 0.18))" } : undefined}>{body}</svg>;
}

/** Small icon of a shape for the toolbar. */
export function ShapeIcon({ shape }: { shape: Shape }) {
  if (shape === "text") return <span className="font-display text-[15px] leading-none font-bold">T</span>;
  const [w, h] = shape === "note" || shape === "frame" ? [18, 16] : shape === "ellipse" || shape === "cylinder" || shape === "page" || shape === "pages" || shape === "triangle" || shape === "diamond" ? [17, 17] : [20, 14];
  return (
    <span className="relative inline-block" style={{ width: w, height: h }}>
      <ShapeSvg shape={shape} w={w} h={h} color={shape === "note" ? "yellow" : "none"} strokeWidth={1.4} />
    </span>
  );
}
