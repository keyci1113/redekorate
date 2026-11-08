// Prototipos hechos con pantallas subidas (exportadas desde Figma, Sketch, XD…)
// y zonas clicables (hotspots) que conectan una pantalla con otra.

export interface Hotspot { id: string; x: number; y: number; w: number; h: number; target: string } // target: id de pantalla o "back"
export interface Screen { id: string; name: string; image: string; width?: number; height?: number; hotspots: Hotspot[] }
export interface Prototype {
  id: string; name: string; device: "mobile" | "desktop"; showHints: boolean; screens: Screen[];
  // "html": un archivo HTML interactivo (p. ej. descargado de Claude). Sus pantallas se detectan
  // mientras se navega y no tienen imagen ni zonas; el id de cada una es htmlScreenId(nombre).
  kind?: "screens" | "html"; html?: { url: string; file: string };
}

export interface ProtoClick { s: string; x: number; y: number; t: number; h: string | null; l?: string }   // h = hotspot tocado (null = misclick); l = texto del elemento (HTML)
export interface ProtoStep { s: string; t: number }                                          // pantalla visitada y ms desde el inicio
export interface PrototypeTaskValue { outcome: "success" | "gave_up"; path: ProtoStep[]; clicks: ProtoClick[]; ms: number }

export const findProto = (protos: Prototype[] | undefined, id: string) => protos?.find((p) => p.id === id);
export const isHtml = (p: Prototype | undefined) => p?.kind === "html";
export const htmlScreenId = (name: string) => `h:${name}`;
export const screenName = (p: Prototype | undefined, id: string) =>
  p?.screens.find((s) => s.id === id)?.name ?? (id.startsWith("h:") ? id.slice(2) : "(pantalla eliminada)");

/** Mensajes que envía el script de seguimiento inyectado en los prototipos HTML. */
export type TrackerMsg =
  | { rk: 1; type: "ready" }
  | { rk: 1; type: "screen"; name: string }
  | { rk: 1; type: "click"; screen: string | null; x: number; y: number; hit: boolean; label: string };
export const asTrackerMsg = (d: unknown): TrackerMsg | null =>
  d && typeof d === "object" && (d as { rk?: unknown }).rk === 1 && typeof (d as { type?: unknown }).type === "string" ? (d as TrackerMsg) : null;

/** Sandbox del iframe: scripts sí, mismo origen no (el HTML no puede tocar la sesión ni la API). */
export const HTML_SANDBOX = "allow-scripts allow-forms allow-modals allow-popups";

/** "Directo" = llegó siguiendo exactamente la ruta esperada (o sin desvíos si no hay ruta definida). */
export function isDirect(v: PrototypeTaskValue, expected: string[]) {
  if (v.outcome !== "success") return false;
  const ids = v.path.map((p) => p.s);
  if (expected.length >= 2) return ids.length === expected.length && ids.every((s, i) => s === expected[i]);
  return new Set(ids).size === ids.length; // sin volver a pantallas ya vistas
}

/** Orden natural por nombre de archivo: "02 Login" antes de "10 Home" */
export const naturalSort = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
