// Service Blueprint: the lanes, the links between steps and how a link is drawn, kept free of React so they can be tested.

/** The lanes from top to bottom, with their (Spanish i18n key) names. */
export const LANES = ["evidence", "customer", "frontstage", "backstage", "support"] as const;
export type Lane = (typeof LANES)[number];
export const LANE_LABEL: Record<Lane, string> = {
  evidence: "Evidencia física", customer: "Acciones del cliente", frontstage: "Frontstage (visible)", backstage: "Backstage (no visible)", support: "Procesos de soporte",
};

export interface BStage { id: string; name: string; evidence: string; customer: string; frontstage: string; backstage: string; support: string }
/** One step of the blueprint: a stage's cell in one lane. */
export interface Cell { stage: string; lane: Lane }
/** A line from one step to another (customer action → frontstage response, backstage → support…). */
export interface BLink { id: string; from: Cell; to: Cell }
export interface BlueprintData { stages: BStage[]; links?: BLink[] }

export const cellKey = (c: Cell) => `${c.stage}:${c.lane}`;
const same = (a: Cell, b: Cell) => a.stage === b.stage && a.lane === b.lane;

/** Connects two steps, or disconnects them when they already are (in either direction). A step never links to itself. */
export function toggleLink(links: BLink[], from: Cell, to: Cell, id: string): BLink[] {
  if (same(from, to)) return links;
  const hit = links.find((l) => (same(l.from, from) && same(l.to, to)) || (same(l.from, to) && same(l.to, from)));
  return hit ? links.filter((l) => l !== hit) : [...links, { id, from, to }];
}

/** The links whose two ends still exist (a stage may have been deleted; old or outside data may name unknown lanes). */
export function liveLinks(d: BlueprintData): BLink[] {
  const ids = new Set(d.stages.map((s) => s.id));
  const ok = (c: Cell | undefined) => !!c && ids.has(c.stage) && (LANES as readonly string[]).includes(c.lane);
  return (d.links ?? []).filter((l) => ok(l.from) && ok(l.to));
}

/** Removes a stage and every link that touches it. */
export function removeStage(d: BlueprintData, id: string): BlueprintData {
  return { ...d, stages: d.stages.filter((s) => s.id !== id), links: (d.links ?? []).filter((l) => l.from.stage !== id && l.to.stage !== id) };
}

export interface Box { x: number; y: number; w: number; h: number }

/**
 * The SVG path of a link between two step cards, in the cards' shared coordinates, and whether it ends in an arrow.
 * Same stage: a plain vertical line between the facing edges (the blueprint's lanes stacked under one moment).
 * Same lane: a horizontal arrow between the facing edges. Otherwise an elbow: out of the source's side,
 * across to the gutter just before the target's column, up or down, and into the target's side, with rounded corners.
 */
export function linkPath(a: Box, b: Box, gap: number, radius = 10): { d: string; arrow: boolean } {
  const cx = (r: Box) => r.x + r.w / 2, cy = (r: Box) => r.y + r.h / 2;
  const r = (n: number) => Math.round(n * 10) / 10;
  if (Math.abs(cx(a) - cx(b)) < 1) {
    const [top, bot] = a.y <= b.y ? [a, b] : [b, a];
    return { d: `M${r(cx(a))} ${r(top.y + top.h)}V${r(bot.y)}`, arrow: false };
  }
  const right = cx(b) > cx(a);
  const x1 = right ? a.x + a.w : a.x, x2 = right ? b.x : b.x + b.w;
  const y1 = cy(a), y2 = cy(b);
  if (Math.abs(y1 - y2) < 1) return { d: `M${r(x1)} ${r(y1)}H${r(x2)}`, arrow: true };
  const gx = right ? x2 - gap / 2 : x2 + gap / 2;
  const dx = right ? 1 : -1, dy = y2 > y1 ? 1 : -1;
  const k = Math.max(0, Math.min(radius, Math.abs(gx - x1), Math.abs(x2 - gx), Math.abs(y2 - y1) / 2));
  return {
    d: `M${r(x1)} ${r(y1)}H${r(gx - dx * k)}Q${r(gx)} ${r(y1)} ${r(gx)} ${r(y1 + dy * k)}V${r(y2 - dy * k)}Q${r(gx)} ${r(y2)} ${r(gx + dx * k)} ${r(y2)}H${r(x2)}`,
    arrow: true,
  };
}

/** A link in words for exports: "Stage · Lane → Stage · Lane". `T` translates; unnamed stages are "Etapa n". */
export function linkLabel(d: BlueprintData, l: BLink, T: (s: string) => string): string {
  const end = (c: Cell) => {
    const i = d.stages.findIndex((s) => s.id === c.stage);
    return `${d.stages[i]?.name.trim() || `${T("Etapa")} ${i + 1}`} · ${T(LANE_LABEL[c.lane])}`;
  };
  return `${end(l.from)} → ${end(l.to)}`;
}
