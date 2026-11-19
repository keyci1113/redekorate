// Dashboard drill-downs: what a click on a tile, a bar or a column opens, and the pure rules that pick the items
// behind a number. Items already loaded with the dashboard are filtered here; the rest come from
// GET /api/dashboards/{tickets|studies}/items (server/src/services/dashboards.ts).
import type { TicketPriority, TicketStatus, TicketType } from "../tickets/model";
import type { Severity } from "../lib/types";
import { attention, completion, filterQuery, type DashFilters, type Health, type LiveStudy, type MilestoneRow, type MilestoneState, type ProjectRow } from "./model";

export type TicketBy = "open" | "status" | "overdue" | "due" | "created_week" | "closed_week" | "closed_period" | "assignee" | "type" | "source" | "week" | "page";
export type StudyBy = "live" | "method" | "responses_week" | "responses_period" | "participants" | "day" | "insights" | "severity";

/** One row of a drill-down list that the page builds from data it already has. */
/** `severity` shows a severity badge at the end instead of `end` (insights on Home). */
export interface DrillRow { key: string; to: string; title: string; sub?: string; end?: string; tone?: "bad" | "warn"; severity?: Severity }

/** What a click opens. `total` (rows) is how many items exist when the page only loaded some of them. `project` overrides the dashboard's project filter (a row of the projects table). */
export type Drill =
  | { kind: "tickets"; title: string; by: TicketBy; value?: string; project?: string }
  | { kind: "studies"; title: string; by: StudyBy; value?: string; bucket?: "day" | "week"; project?: string }
  | { kind: "rows"; title: string; note?: string; rows: DrillRow[]; empty: string; total?: number };

export interface TicketItem { number: number; title: string; status: TicketStatus; priority: TicketPriority; type: TicketType; due_date: string | null; created_at: string; closed_at: string | null; project_id: string; project_name: string; assignees: string | null }
export interface StudyItem { id: string; title: string; method: string; status: "draft" | "live" | "closed"; project_id: string; project_name: string; n: number | null; started: number; finished: number }
export interface InsightItem { id: string; title: string; severity: Severity; created_at: string; reviewed_at: string | null; project_id: string; project_name: string; study_id: string | null; study_title: string | null }
export type DrillAnswer =
  | { kind: "tickets"; total: number; items: TicketItem[] }
  | { kind: "studies"; total: number; items: StudyItem[] }
  | { kind: "insights"; total: number; items: InsightItem[] };

/** The API path of a remote drill-down, keeping the dashboard's filters (period, project) unless the drill names a project. */
export function drillPath(d: Exclude<Drill, { kind: "rows" }>, filters: DashFilters): string {
  const p = new URLSearchParams(filterQuery({ ...filters, project: d.project ?? filters.project }).slice(1));
  p.set("by", d.by);
  if (d.value !== undefined) p.set("value", d.value);
  if (d.kind === "studies" && d.bucket) p.set("bucket", d.bucket);
  return `/dashboards/${d.kind}/items?${p}`;
}

// ── Links ───────────────────────────────────────────────────────
export const ticketLink = (t: Pick<TicketItem, "project_id" | "number">) => `/projects/${t.project_id}/tickets/${t.number}`;
export const studyLink = (s: { id: string; status?: string }) => (s.status === "draft" ? `/studies/${s.id}/edit` : `/studies/${s.id}/results`);
export const insightLink = (i: Pick<InsightItem, "project_id">) => `/projects/${i.project_id}?tab=insights`;

// ── Filters over data the page already has ──────────────────────
export type LiveWhich = "all" | "attention" | "by_completion";
/**
 * Live studies behind a tile: all of them (those that need attention first), only those that need attention,
 * or the ones with enough sessions to judge, lowest completion first.
 */
export function liveStudiesFor(live: LiveStudy[], which: LiveWhich, now: number, low: number, minStarted: number): LiveStudy[] {
  const flagged = (s: LiveStudy) => attention(s, now, low, minStarted) !== null;
  if (which === "attention") return live.filter(flagged);
  if (which === "by_completion") return live.filter((s) => s.started >= minStarted).sort((a, b) => completion(a) - completion(b) || a.title.localeCompare(b.title));
  return [...live].sort((a, b) => Number(flagged(b)) - Number(flagged(a)) || a.title.localeCompare(b.title));
}

export type ProjectWhich = "all" | "risky" | "with_live" | "with_open" | "with_overdue";
const HEALTH_ORDER: Health[] = ["at_risk", "needs_attention", "on_track", "quiet"];
/** Projects behind a tile, worst health first. */
export function projectsFor(rows: ProjectRow[], which: ProjectWhich): ProjectRow[] {
  const keep = {
    all: () => true,
    risky: (r: ProjectRow) => r.health === "at_risk" || r.health === "needs_attention",
    with_live: (r: ProjectRow) => r.live_studies > 0,
    with_open: (r: ProjectRow) => r.open_tickets > 0,
    with_overdue: (r: ProjectRow) => r.overdue > 0,
  }[which];
  return rows.filter(keep).sort((a, b) => HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health) || a.name.localeCompare(b.name));
}

/** "in_progress" groups the milestones the tile counts as in progress: on track or planned. */
export type MilestoneWhich = "all" | "open" | "in_progress" | Exclude<MilestoneState, "on_track" | "planned">;
const MILESTONE_ORDER: MilestoneState[] = ["behind", "at_risk", "on_track", "planned", "done"];
/** Milestones behind a figure, optionally of one project; the ones that need help first, then by date. */
export function milestonesFor(ms: MilestoneRow[], which: MilestoneWhich, projectId?: string): MilestoneRow[] {
  const keep = (m: MilestoneRow) =>
    which === "all" ? true : which === "open" ? m.state !== "done" : which === "in_progress" ? m.state === "on_track" || m.state === "planned" : m.state === which;
  return ms.filter((m) => (!projectId || m.project_id === projectId) && keep(m))
    .sort((a, b) => MILESTONE_ORDER.indexOf(a.state) - MILESTONE_ORDER.indexOf(b.state) || (a.end_date ?? "9999").localeCompare(b.end_date ?? "9999") || a.name.localeCompare(b.name));
}

// ── Home ────────────────────────────────────────────────────────
/** Responses per study from the home page's per-study trend, counting days from `fromDay` to `toDay` (YYYY-MM-DD, both included), most first. */
export function responsesByStudy(trend: { study_id: string; day: string; n: number }[], fromDay: string, toDay = "9999-12-31"): { study_id: string; n: number }[] {
  const n = new Map<string, number>();
  for (const r of trend) if (r.day >= fromDay && r.day <= toDay) n.set(r.study_id, (n.get(r.study_id) ?? 0) + r.n);
  return [...n].filter(([, v]) => v > 0).map(([study_id, v]) => ({ study_id, n: v })).sort((a, b) => b.n - a.n || a.study_id.localeCompare(b.study_id));
}
