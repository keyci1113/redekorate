// Daily brief: the data it receives and the small rules around it (greeting, dates, grouping, the remembered
// open state). No React here, so all of it can be tested.

export type DueBucket = "overdue" | "today" | "week";
export const DUE_BUCKETS: DueBucket[] = ["overdue", "today", "week"];

export interface BriefTicket { id: string; number: number; title: string; priority: string; due_date: string; project_id: string; project_name: string; bucket: DueBucket }
export interface BriefNotice { number: number; title: string; project_id: string; project_name: string; actor_name: string | null; excerpt: string | null; created_at: string }
interface Counted<T> { items: T[]; total: number }
export interface Brief {
  today: string; week_end: string; since: string; time_zone: string;
  my_day: { tickets: BriefTicket[]; total: number; counts: Record<DueBucket, number> };
  news: {
    responses: { study_id: string; title: string; project_id: string; project_name: string; count: number }[];
    insights: Counted<{ id: string; title: string; project_id: string; project_name: string }>;
    widget: Counted<{ id: string; number: number; title: string; project_id: string; project_name: string }>;
    assigned: Counted<BriefNotice>;
    mentions: Counted<BriefNotice>;
  };
  has_new: boolean;
  live_studies: { id: string; title: string; project_id: string; project_name: string; responses: number; today: number }[];
  milestones: { id: string; name: string; project_id: string; project_name: string; due_date: string; progress: number; total: number; done: number; state: string }[];
}

/** The Spanish key of the greeting for an hour of the day (0–23); the caller translates it with the name. */
export function greeting(hour: number) {
  if (hour < 12) return "Buenos días, {a}";
  if (hour < 19) return "Buenas tardes, {a}";
  return "Buenas noches, {a}";
}

export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** "jueves, 19 de noviembre" / "Thursday, November 19". */
export const longDate = (d: Date, loc: string) => new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long" }).format(d);

/** The tickets of "My day" in their groups, in order, leaving out empty groups. */
export function groupMyDay<T extends { bucket: DueBucket }>(tickets: T[]): { bucket: DueBucket; items: T[] }[] {
  return DUE_BUCKETS.map((bucket) => ({ bucket, items: tickets.filter((x) => x.bucket === bucket) })).filter((g) => g.items.length > 0);
}

/** Whole days from `today` to `due` (both YYYY-MM-DD); negative when it is past. */
export function daysUntil(due: string, today: string) {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Nothing at all to show: no tickets, no news, no live studies, no milestones. */
export function briefIsEmpty(b: Brief) {
  const n = b.news;
  return b.my_day.total === 0 && n.responses.length === 0 && n.insights.total + n.widget.total + n.assigned.total + n.mentions.total === 0
    && b.live_studies.length === 0 && b.milestones.length === 0;
}

/** The viewer's time zone name, sent so "today" is their day. */
export function localTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

// ── Open or closed, per browser ───────────────────────────────
const KEY = "rk_brief_open";
export function readBriefOpen(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function writeBriefOpen(open: boolean) {
  try { localStorage.setItem(KEY, open ? "1" : "0"); } catch { /* storage blocked: it simply is not remembered */ }
}
