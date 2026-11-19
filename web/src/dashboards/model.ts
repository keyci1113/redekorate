// Dashboards: response types and the pure rules the pages use (filters in the URL, deltas, due texts, chart scales).
import type { Severity } from "../lib/types";
import type { TicketPriority, TicketStatus, TicketType } from "../tickets/model";

export const PERIODS = ["30", "7", "90", "quarter"] as const;
export type Period = (typeof PERIODS)[number];
export interface DashFilters { project: string | null; period: Period }
export interface ProjectOption { id: string; name: string }
interface Base { projects: ProjectOption[]; period: Period; days: number }

export interface StudiesDash extends Base {
  bucket: "day" | "week"; low_completion: number; min_started: number;
  totals: { responses_week: number; responses_prev_week: number; responses_period: number; live: number; studies: number; started: number; finished: number;
    insights: number; insights_critical: number; insights_high: number; participants: number; participants_prev: number };
  series: { day: string; n: number }[];
  methods: { method: string; n: number }[];
  live: LiveStudy[];
  severity: Record<Severity, number> & { with_tickets: number };
}
export interface LiveStudy { id: string; title: string; method: string; published_at: string | null; project_name: string; started: number; finished: number; last_response_at: string | null }

export interface TicketsDash extends Base {
  totals: { open: number; todo: number; in_progress: number; in_review: number; overdue: number; overdue_last_week: number; oldest_days_late: number | null;
    created_week: number; created_prev_week: number; created_week_widget: number; closed_week: number; closed_period: number;
    median_days: number | null; median_days_prev: number | null; source_manual: number; source_insight: number; source_widget: number };
  weeks: { week: string; created: number; closed: number }[];
  people: { id: string | null; name: string | null; avatar: string | null; open: number; overdue: number }[];
  types: { type: TicketType; n: number }[];
  due: { number: number; title: string; status: TicketStatus; priority: TicketPriority; due_date: string; project_id: string; project_name: string; assignees: string | null }[];
  widget: { top: { key: string; n: number }[]; other: number; total: number; host: string | null };
}

export type Health = "at_risk" | "needs_attention" | "on_track" | "quiet";
export type MilestoneState = "done" | "planned" | "behind" | "at_risk" | "on_track";
export interface MilestoneRow { id: string; name: string; project_id: string; project_name: string; total: number; done: number; overdue_open: number; unassigned_open: number; end_date: string | null; state: MilestoneState; progress: number }
export interface ProjectRow { id: string; name: string; description: string; color: string; live_studies: number; responses_7d: number; low_completion: number; open_tickets: number; overdue: number; health: Health; next_milestone: MilestoneRow | null }
export interface ActivityItem { kind: "responses" | "ticket_status" | "insight" | "widget"; at: string; project_id: string; project_name: string; ref: string | null; title: string; n: number; extra: string | null }
export interface ProjectsDash extends Base { rows: ProjectRow[]; milestones: MilestoneRow[]; activity: ActivityItem[]; low_completion: number }

// ── Filters in the URL ──────────────────────────────────────────
export function readFilters(p: URLSearchParams): DashFilters {
  const period = p.get("period");
  return { project: p.get("project") || null, period: (PERIODS as readonly string[]).includes(period ?? "") ? (period as Period) : "30" };
}
/** Query string for the API and for links between dashboards; defaults are left out. */
export function filterQuery(f: DashFilters): string {
  const p = new URLSearchParams();
  if (f.project) p.set("project", f.project);
  if (f.period !== "30") p.set("period", f.period);
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ── Figures ─────────────────────────────────────────────────────
export interface Delta { diff: number; dir: "up" | "down" | "same" }
export const delta = (now: number, before: number): Delta => ({ diff: Math.abs(now - before), dir: now > before ? "up" : now < before ? "down" : "same" });
/** Share as a whole percentage; 0 when there is nothing to divide by. */
export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
export const completion = (s: Pick<LiveStudy, "started" | "finished">) => (s.started > 0 ? s.finished / s.started : 0);

/** Why a live study needs a look: low completion (once enough people started) or no responses for 48 hours. */
export function attention(s: LiveStudy, now: number, low: number, minStarted: number): "low_completion" | "silent" | null {
  if (s.started >= minStarted && completion(s) < low) return "low_completion";
  const last = s.last_response_at ?? s.published_at;
  if (last && now - new Date(last).getTime() > 48 * 3600e3) return "silent";
  return null;
}
export const daysSince = (iso: string, now: number) => Math.floor((now - new Date(iso).getTime()) / 864e5);

export type DueText = { kind: "late"; days: number } | { kind: "today" } | { kind: "tomorrow" } | { kind: "date" };
const dayNumber = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
/** How a due date reads next to today (both YYYY-MM-DD). */
export function dueText(due: string, today: string): DueText {
  const diff = dayNumber(due) - dayNumber(today);
  if (diff < 0) return { kind: "late", days: -diff };
  return diff === 0 ? { kind: "today" } : diff === 1 ? { kind: "tomorrow" } : { kind: "date" };
}

// ── Charts ──────────────────────────────────────────────────────
/** Bar length as a share (0–100) of the largest value; a non-zero value never rounds down to nothing. */
export function shares(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max === 0 || v <= 0 ? 0 : Math.max(2, Math.round((v / max) * 100))));
}
/** Positions that get an axis label so at most `max` are shown, always including the first and the last. */
export function labelTicks(count: number, max: number): Set<number> {
  if (count <= max) return new Set(Array.from({ length: count }, (_, i) => i));
  const step = (count - 1) / (max - 1);
  return new Set(Array.from({ length: max }, (_, i) => Math.round(i * step)));
}
export function peak<T extends { n: number }>(series: T[]): T | null {
  return series.reduce<T | null>((best, x) => (x.n > (best?.n ?? 0) ? x : best), null);
}
/** In how many of the last `last` weeks more tickets came in than were closed. */
export const weeksBehind = (weeks: { created: number; closed: number }[], last = 4) => weeks.slice(-last).filter((w) => w.created > w.closed).length;
