import type { PrototypeTaskBlock } from "./types";
// Prototipos hechos con pantallas subidas (exportadas desde Figma, Sketch, XD…)
// y zonas clicables (hotspots) que conectan una pantalla con otra.

export interface Hotspot { id: string; x: number; y: number; w: number; h: number; target: string } // target: id de pantalla o "back"
export interface Screen { id: string; name: string; image: string; width?: number; height?: number; hotspots: Hotspot[]; route?: string; trail?: string[] }   // HTML: route = #hash al detectarla; trail = clics que llevaron a ella
export interface Prototype {
  id: string; name: string; device: "mobile" | "desktop"; showHints: boolean; screens: Screen[];
  // "html": un archivo HTML interactivo (p. ej. descargado de Claude). Sus pantallas se detectan
  // mientras se navega y no tienen imagen ni zonas; el id de cada una es htmlScreenId(nombre).
  kind?: "screens" | "html" | "link"; html?: { url: string; file: string };
  // "link": un prototipo publicado en otro sitio (Figma Make, un sitio desplegado…) que se muestra tal cual
  // en un iframe. Ahí no corre nada nuestro, así que solo se registran el tiempo y lo que el participante reporta.
  link?: { url: string; host: string };
  // Flujo esperado definido en el prototipo (HTML): dónde empieza, dónde termina, por qué pantallas pasa
  // y qué se le pide al participante. Las tareas lo toman como valores iniciales.
  flow?: ProtoFlow;
}
/** Una interacción requerida: tocar un elemento con ese texto, opcionalmente en una pantalla concreta. */
export interface FlowStep { screen?: string; label: string }
/** Un paso del flujo: una pantalla detectada o un toque sobre un elemento. */
export type FlowItem = { id: string; kind: "screen"; screen: string } | { id: string; kind: "tap"; label: string; screen?: string };
/** Flujo del prototipo: pasos en orden; el inicio y la meta son cualquiera de ellos (pantalla o toque). */
export interface ProtoFlow { items: FlowItem[]; startId?: string; goalId?: string; instructions?: string }

type LegacyFlow = { start?: string; goal?: string; goalClick?: FlowStep; path?: string[]; steps?: FlowStep[]; instructions?: string };
/** Acepta el flujo tal cual se guardó; convierte la forma anterior (start/goal/path/steps) a la lista de pasos. */
export function normalizeFlow(f: ProtoFlow | LegacyFlow | undefined): ProtoFlow {
  if (!f) return { items: [] };
  if ("items" in f) return f;
  const items: FlowItem[] = []; let startId: string | undefined, goalId: string | undefined;
  const nextId = () => `legacy-${items.length}`;
  const screen = (id: string) => { const item: FlowItem = { id: nextId(), kind: "screen", screen: id }; items.push(item); return item.id; };
  const tap = (st: FlowStep) => { const item: FlowItem = { id: nextId(), kind: "tap", label: st.label, ...(st.screen ? { screen: st.screen } : {}) }; items.push(item); return item.id; };
  if (f.start) startId = screen(f.start);
  for (const id of f.path ?? []) screen(id);
  for (const st of f.steps ?? []) tap(st);
  if (f.goalClick) goalId = tap(f.goalClick);
  else if (f.goal) goalId = screen(f.goal);
  return { items, startId, goalId, instructions: f.instructions };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/**
 * ¿Este clic cumple el paso? Se compara el texto del elemento (parcial en cualquier sentido: "Order Checklist" vale para
 * "Order Checklist (3)"). La pantalla del paso es informativa: los nombres detectados por <h1> cambian con los datos
 * (p. ej. el título de cada oportunidad), así que exigirla rompería flujos válidos.
 */
export function matchStep(step: FlowStep, _screen: string | null | undefined, label: string | null | undefined): boolean {
  const want = norm(step.label), got = norm(label ?? "");
  return !!want && !!got && (got === want || got.includes(want) || want.includes(got));
}
/** ¿El participante completó todas las interacciones requeridas, en orden? */
export const stepsComplete = (v: PrototypeTaskValue, steps: FlowStep[] | undefined) => !steps?.length || (v.steps?.length ?? 0) >= steps.length;

/** Convierte el flujo en campos de tarea: meta (pantalla o toque), ruta esperada (pantallas en orden), toques requeridos y descripción. */
export function flowToTask(p: Prototype | undefined): { startScreen: string; goalScreens: string[]; expectedPath: string[]; steps: FlowStep[]; goalClick?: FlowStep; description?: string } | null {
  const f = normalizeFlow(p?.flow);
  if (!f.items.length) return null;
  const goal = f.items.find((i) => i.id === f.goalId);
  const start = f.items.find((i) => i.id === f.startId);
  const screens = f.items.flatMap((i) => (i.kind === "screen" ? [i.screen] : [])).filter((x, i, a) => a.indexOf(x) === i);
  const steps = f.items.flatMap((i) => (i.kind === "tap" && i.id !== f.goalId ? [{ label: i.label, ...(i.screen ? { screen: i.screen } : {}) }] : []));
  return {
    startScreen: start?.kind === "screen" ? start.screen : "",
    goalScreens: goal?.kind === "screen" ? [goal.screen] : [],
    expectedPath: screens.length >= 2 ? screens : [],
    steps,
    goalClick: goal?.kind === "tap" ? { label: goal.label, ...(goal.screen ? { screen: goal.screen } : {}) } : undefined,
    description: f.instructions?.trim() || undefined,
  };
}

export interface ProtoClick { s: string; x: number; y: number; t: number; h: string | null; l?: string }   // h = hotspot tocado (null = misclick); l = texto del elemento (HTML)
export interface ProtoStep { s: string; t: number }                                          // pantalla visitada y ms desde el inicio
export interface PrototypeTaskValue { outcome: "success" | "gave_up"; path: ProtoStep[]; clicks: ProtoClick[]; ms: number; steps?: { i: number; t: number }[]; claimed?: boolean }   // steps = interacciones cumplidas; claimed = dijo "Terminé" sin llegar a la meta

export const findProto = (protos: Prototype[] | undefined, id: string) => protos?.find((p) => p.id === id);
export const isHtml = (p: Prototype | undefined) => p?.kind === "html";
export const isLink = (p: Prototype | undefined) => p?.kind === "link";
/** HTML o link: se muestra en un iframe, sin pantallas con imagen ni zonas. */
export const isEmbedded = (p: Prototype | undefined) => isHtml(p) || isLink(p);
export const htmlScreenId = (name: string) => `h:${name}`;
export const screenName = (p: Prototype | undefined, id: string) =>
  p?.screens.find((s) => s.id === id)?.name ?? (id.startsWith("h:") ? id.slice(2) : "(pantalla eliminada)");

/** Mensajes que envía el script de seguimiento inyectado en los prototipos HTML. */
export type TrackerMsg =
  | { rk: 1; type: "ready" }
  | { rk: 1; type: "screen"; name: string; route?: string | null; trail?: string[] }
  | { rk: 1; type: "click"; screen: string | null; x: number; y: number; hit: boolean; label: string };
export const asTrackerMsg = (d: unknown): TrackerMsg | null =>
  d && typeof d === "object" && (d as { rk?: unknown }).rk === 1 && typeof (d as { type?: unknown }).type === "string" ? (d as TrackerMsg) : null;

/** Sandbox del iframe: scripts sí, mismo origen no (el HTML no puede tocar la sesión ni la API). */
/** Pide al prototipo HTML que muestre una pantalla (al empezar una tarea). Mejor esfuerzo: por ruta o tocando el elemento con ese nombre. */
/** Pantalla de inicio del flujo del prototipo (si es una pantalla y no un toque). */
export function flowStartScreen(p: Prototype | undefined): string | undefined {
  const f = normalizeFlow(p?.flow); const s = f.items.find((i) => i.id === f.startId);
  return s?.kind === "screen" ? s.screen : undefined;
}

export function gotoScreen(frame: HTMLIFrameElement | null, proto: Prototype, screenId: string) {
  const s = proto.screens.find((x) => x.id === screenId);
  if (!s || !frame?.contentWindow) return;
  frame.contentWindow.postMessage({ rk: 1, type: "goto", name: s.name, route: s.route ?? null, trail: s.trail ?? [] }, "*");
}

export const HTML_SANDBOX = "allow-scripts allow-forms allow-modals allow-popups";

/** "Directo" = llegó siguiendo exactamente la ruta esperada (o sin desvíos si no hay ruta definida). */
export function isDirect(v: PrototypeTaskValue, expected: string[]) {
  if (v.outcome !== "success" || v.claimed) return false;   // un éxito autodeclarado nunca cuenta como directo
  const ids = v.path.map((p) => p.s);
  if (expected.length >= 2) return ids.length === expected.length && ids.every((s, i) => s === expected[i]);
  return new Set(ids).size === ids.length; // sin volver a pantallas ya vistas
}

/** Orden natural por nombre de archivo: "02 Login" antes de "10 Home" */
export const naturalSort = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

/** ¿La tarea definió meta, ruta, inicio o interacciones propias? Si no, sigue el flujo del prototipo. */
export const hasOwnFlow = (b: PrototypeTaskBlock) => !!(b.goalScreens.length || b.goalClick || b.steps?.length || b.expectedPath.length || b.startScreen);

/** La tarea tal como se ejecuta: sus propios valores o, si no tiene, los del flujo del prototipo (solo HTML). */
export function resolveTask(block: PrototypeTaskBlock, proto: Prototype | undefined): PrototypeTaskBlock {
  if (!isHtml(proto) || hasOwnFlow(block)) return block;
  const f = flowToTask(proto);
  if (!f) return block;
  return { ...block, startScreen: f.startScreen, goalScreens: f.goalScreens, expectedPath: f.expectedPath, steps: f.steps, goalClick: f.goalClick, description: block.description || f.description || "" };
}
