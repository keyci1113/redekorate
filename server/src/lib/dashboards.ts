// Pure rules behind the dashboards: what a period means, when a project needs attention. Milestone state lives in milestones.ts.

export const PERIODS = ["7", "30", "90", "quarter"] as const;
export type Period = (typeof PERIODS)[number];
/** Completion below this share marks a live study as low. */
export const LOW_COMPLETION = 0.88;
/** A live study needs this many started sessions before its completion is judged. */
export const MIN_STARTED = 5;

/** Start of the period and of the period right before it (same length), for "vs. previous" figures. */
export function periodRange(period: Period, now: Date): { since: Date; before: Date; days: number } {
  const since = period === "quarter"
    ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    : new Date(now.getTime() - Number(period) * 864e5);
  const length = now.getTime() - since.getTime();
  return { since, before: new Date(since.getTime() - length), days: Math.max(1, Math.round(length / 864e5)) };
}

export type Health = "at_risk" | "needs_attention" | "on_track" | "quiet";
export interface HealthSignals { overdue: number; low_completion: number; milestones_behind: number; responses_7d: number; ticket_changes_7d: number }
/**
 * Health of a project from three signals: overdue tickets, live studies under 88% completion and milestones behind schedule.
 * A milestone behind, or three or more signals, is "at risk"; any signal is "needs attention";
 * no signal and nothing happening for a week is "quiet"; otherwise "on track".
 */
export function projectHealth(s: HealthSignals): Health {
  const signals = s.overdue + s.low_completion + s.milestones_behind;
  if (s.milestones_behind > 0 || signals >= 3) return "at_risk";
  if (signals > 0) return "needs_attention";
  if (s.responses_7d === 0 && s.ticket_changes_7d === 0) return "quiet";
  return "on_track";
}

/** Path of a page URL ("/caja/cierre"), without query or hash; null when it is not a URL. */
export function pagePath(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).pathname.replace(/\/+$/, "") || "/"; } catch { return null; }
}

/** The most frequent values with their counts, the rest folded into `other`. */
export function topCounts(values: string[], max: number): { top: { key: string; n: number }[]; other: number } {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const sorted = [...counts].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  return { top: sorted.slice(0, max), other: sorted.slice(max).reduce((sum, x) => sum + x.n, 0) };
}

/**
 * Turns `{name}` placeholders into numbered ones after `base`, adding a parameter only for the names the SQL
 * uses (pg refuses parameters a statement does not reference). A name used twice gets one number.
 */
export function bindNamed(sql: string, base: unknown[], values: Record<string, unknown>): { sql: string; params: unknown[] } {
  const params = [...base];
  const numbers = new Map<string, number>();
  const out = sql.replace(/\{(\w+)\}/g, (whole, name: string) => {
    if (!(name in values)) return whole;
    if (!numbers.has(name)) numbers.set(name, params.push(values[name]));
    return `$${numbers.get(name)}`;
  });
  return { sql: out, params };
}
