/** Último estudio abierto por esta persona en este navegador: una comodidad para retomar desde el inicio. */
export interface RecentStudy { id: string; title: string; method: string; project_id: string; project_name?: string; where: "edit" | "results"; at: string }
const KEY = "recent-study";

export function rememberStudy(s: Omit<RecentStudy, "at">) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, at: new Date().toISOString() })); } catch { /* sin almacenamiento */ }
}
export function lastStudy(): RecentStudy | null {
  try { const raw = localStorage.getItem(KEY); const v = raw ? (JSON.parse(raw) as RecentStudy) : null; return v && v.id && v.title ? v : null; } catch { return null; }
}
export function forgetStudy(id: string) {
  if (lastStudy()?.id === id) { try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } }
}
