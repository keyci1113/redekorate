// Lógica pura de la Home: sin React ni textos, para poder probarla.
import type { Severity } from "./types";

/** Debajo de este completado un estudio se marca como "Bajo". */
export const COMPLETION_THRESHOLD = 0.88;

/** Completado = terminaron / iniciaron. null si nadie ha iniciado. */
export function completion(done: number, started: number): number | null {
  if (!started || started <= 0) return null;
  return Math.min(1, Math.max(0, done / started));
}

/** true si el completado está por debajo del umbral (sin datos nunca es "bajo"). */
export const isLowCompletion = (rate: number | null, threshold = COMPLETION_THRESHOLD) => rate !== null && rate < threshold;

/** Completado agregado: suma de terminados entre suma de iniciados. */
export function aggregateCompletion(studies: { responses: number; started: number }[]) {
  const done = studies.reduce((n, s) => n + s.responses, 0);
  const started = studies.reduce((n, s) => n + s.started, 0);
  return { done, started, rate: completion(done, started) };
}

// ── Insights ────────────────────────────────────────────────────────
export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

/** Más graves primero; dentro de la misma severidad, los más recientes primero. No muta la entrada. */
export function sortInsights<T extends { severity: Severity; created_at: string }>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ── Actividad ───────────────────────────────────────────────────────
export interface ActivityRow { at: string; study_id: string; study_title: string; method: string }
export interface ActivityGroup { study_id: string; study_title: string; method: string; count: number; latest: string }

/** Agrupa respuestas por estudio: cuántas llegaron y la más reciente. Ordena por la más reciente. */
export function groupActivity(rows: ActivityRow[], limit = 6): ActivityGroup[] {
  const map = new Map<string, ActivityGroup>();
  for (const r of rows) {
    const g = map.get(r.study_id);
    if (!g) map.set(r.study_id, { study_id: r.study_id, study_title: r.study_title, method: r.method, count: 1, latest: r.at });
    else {
      g.count++;
      if (new Date(r.at) > new Date(g.latest)) g.latest = r.at;
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.latest).getTime() - new Date(a.latest).getTime()).slice(0, limit);
}

// ── Tendencia ───────────────────────────────────────────────────────
export interface Day { day: string; n: number }

/** Divide 14 días en semana pasada (7 primeros) y esta semana (7 últimos). */
export function splitWeeks(days: Day[]) {
  const last = days.slice(-7), prev = days.slice(-14, -7);
  const sum = (d: Day[]) => d.reduce((n, x) => n + x.n, 0);
  return { thisWeek: sum(last), lastWeek: sum(prev), thisDays: last, lastDays: prev };
}

/** Día con más respuestas (el más reciente si hay empate). null si no hubo ninguna. */
export function peakDay(days: Day[]): Day | null {
  let best: Day | null = null;
  for (const d of days) if (d.n > 0 && (!best || d.n >= best.n)) best = d;
  return best;
}

// ── Estudios activos ────────────────────────────────────────────────
export interface LiveLike { id: string; responses: number; started: number; last_response_at: string | null }
export type LiveSort = "recent" | "lowest";

/** "recent": última respuesta primero. "lowest": menor completado primero (sin datos al final). */
export function sortLive<T extends LiveLike>(list: T[], by: LiveSort): T[] {
  const time = (s: T) => (s.last_response_at ? new Date(s.last_response_at).getTime() : -Infinity);
  return [...list].sort((a, b) => {
    if (by === "recent") return time(b) - time(a);
    const ra = completion(a.responses, a.started), rb = completion(b.responses, b.started);
    if (ra === null && rb === null) return time(b) - time(a);
    if (ra === null) return 1;
    if (rb === null) return -1;
    return ra - rb || time(b) - time(a);
  });
}

// ── Preferencia de vista del detalle ────────────────────────────────
export type HomeView = "snapshot" | "funnel" | "inline";
export const HOME_VIEWS: HomeView[] = ["snapshot", "funnel", "inline"];
export const DEFAULT_VIEW: HomeView = "snapshot";
const VIEW_KEY = (userId: string) => `rk_home_view:${userId}`;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const browserStorage = (): StorageLike | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

/** Lee la vista guardada para el usuario. Si no hay storage o el valor no es válido, vuelve a Snapshot. */
export function loadView(userId: string, storage: StorageLike | null = browserStorage()): HomeView {
  try {
    const v = storage?.getItem(VIEW_KEY(userId));
    return HOME_VIEWS.includes(v as HomeView) ? (v as HomeView) : DEFAULT_VIEW;
  } catch { return DEFAULT_VIEW; }
}

/** Guarda la vista; si el storage falla (modo privado, bloqueado) no rompe nada. */
export function saveView(userId: string, view: HomeView, storage: StorageLike | null = browserStorage()) {
  try { storage?.setItem(VIEW_KEY(userId), view); return true; } catch { return false; }
}
