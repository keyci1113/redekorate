// Home KPI drill-downs: what a click on a KPI card opens, built only from what the home page already loaded.
import type { Severity } from "../../lib/types";

/** One row of a drill-down list: a link with a title, an optional line under it and a figure or badge at the end. */
export interface DrillRow { key: string; to: string; title: string; sub?: string; end?: string; tone?: "bad" | "warn"; severity?: Severity }

/** What a click opens. `total` is how many items exist when the page only loaded some of them. */
export interface Drill { title: string; note?: string; rows: DrillRow[]; empty: string; total?: number }

/** Responses per study from the home page's per-study trend, counting days from `fromDay` to `toDay` (YYYY-MM-DD, both included), most first. */
export function responsesByStudy(trend: { study_id: string; day: string; n: number }[], fromDay: string, toDay = "9999-12-31"): { study_id: string; n: number }[] {
  const n = new Map<string, number>();
  for (const r of trend) if (r.day >= fromDay && r.day <= toDay) n.set(r.study_id, (n.get(r.study_id) ?? 0) + r.n);
  return [...n].filter(([, v]) => v > 0).map(([study_id, v]) => ({ study_id, n: v })).sort((a, b) => b.n - a.n || a.study_id.localeCompare(b.study_id));
}
