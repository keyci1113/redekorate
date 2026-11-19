// Milestones, roadmap and My work: types and the pure rules behind the screens (states, notes, timeline geometry, grouping).
import type { ProjectRole } from "../lib/types";
import type { TicketPriority, TicketSource, TicketStatus, TicketType } from "../tickets/model";

export type MilestoneState = "done" | "planned" | "behind" | "at_risk" | "on_track";
export interface Milestone {
  id: string; name: string; project_id: string; project_name: string;
  start_date: string | null; due_date: string | null; begin_date: string | null; end_date: string | null;
  total: number; todo: number; in_progress: number; in_review: number; done: number;
  overdue_open: number; unassigned_open: number; closed_at: string | null; state: MilestoneState; progress: number;
}
export interface RoadmapStudy { id: string; title: string; status: "live" | "closed"; project_id?: string; project_name?: string; begin_date: string; end_date: string; responses?: number }
export interface RoadmapData { project: { id: string; name: string; organization_id: string | null }; milestones: Milestone[]; studies: RoadmapStudy[]; share_token: string | null; role: ProjectRole }

/** The four states the milestone and roadmap screens show: a milestone that is behind reads as "at risk" there. */
export type ShownState = "done" | "planned" | "at_risk" | "on_track";
export const shownState = (s: MilestoneState): ShownState => (s === "behind" ? "at_risk" : s);

// ── Days ────────────────────────────────────────────────────────
const dayNumber = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);
/** A stretch of days as the unit a person would say: days up to eight weeks, then whole months. */
export function span(days: number): { n: number; unit: "day" | "month" } {
  const d = Math.abs(days);
  return d < 56 ? { n: d, unit: "day" } : { n: Math.round(d / 30), unit: "month" };
}

export type MilestoneNote =
  | { kind: "closed"; date: string } | { kind: "starts"; days: number } | { kind: "overdue"; n: number } | { kind: "late"; days: number }
  | { kind: "due_open"; days: number; open: number } | { kind: "due"; days: number } | null;
/**
 * The one line under a milestone: why it is at risk, when it starts or is due, or when it was closed.
 * The state comes from the server (milestoneState): at risk means it ends soon with tickets still open.
 */
export function milestoneNote(m: Pick<Milestone, "state" | "closed_at" | "begin_date" | "end_date" | "overdue_open" | "total" | "done">, today: string): MilestoneNote {
  if (m.state === "done") return m.closed_at ? { kind: "closed", date: m.closed_at } : null;
  if (m.state === "planned" && m.begin_date) return { kind: "starts", days: daysBetween(today, m.begin_date) };
  if (m.overdue_open > 0) return { kind: "overdue", n: m.overdue_open };
  if (m.end_date && m.end_date < today) return { kind: "late", days: daysBetween(m.end_date, today) };
  if (!m.end_date) return null;
  const days = daysBetween(today, m.end_date);
  return m.state === "at_risk" ? { kind: "due_open", days, open: m.total - m.done } : { kind: "due", days };
}

// ── Timeline ────────────────────────────────────────────────────
export type Zoom = "month" | "quarter";
export interface TimeWindow { start: string; end: string; days: number; columns: { key: string; year: number; month: number; quarter: number; share: number }[] }
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => { const x = new Date(Date.UTC(y, m, d)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };

/**
 * The stretch of time on screen. Month zoom shows six months starting the month before today; quarter zoom shows
 * four quarters starting the quarter before this one. `shift` moves the window by whole steps (a month or a quarter).
 * Columns carry their share of the width, so a 31-day month is a little wider than a 28-day one and dates land exactly.
 */
export function timeWindow(zoom: Zoom, today: string, shift = 0): TimeWindow {
  const [y, m] = today.split("-").map(Number);
  const first = zoom === "month" ? m - 1 - 1 + shift : Math.floor((m - 1) / 3) * 3 - 3 + shift * 3;
  const count = zoom === "month" ? 6 : 4;
  const step = zoom === "month" ? 1 : 3;
  const start = iso(y, first, 1), endExclusive = iso(y, first + count * step, 1);
  const days = daysBetween(start, endExclusive);
  const columns = Array.from({ length: count }, (_, i) => {
    const a = iso(y, first + i * step, 1), b = iso(y, first + (i + 1) * step, 1);
    const [cy, cm] = a.split("-").map(Number);
    return { key: a, year: cy, month: cm, quarter: Math.floor((cm - 1) / 3) + 1, share: (daysBetween(a, b) / days) * 100 };
  });
  return { start, end: iso(y, first + count * step, 0), days, columns };
}

/** Where an item sits in the window, as percentages, and whether it continues past either edge. null when it is entirely outside. */
export function barSpan(begin: string, end: string, w: TimeWindow): { left: number; width: number; cutStart: boolean; cutEnd: boolean } | null {
  if (end < begin || end < w.start || begin > w.end) return null;
  const from = Math.max(0, daysBetween(w.start, begin)), to = Math.min(w.days, daysBetween(w.start, end) + 1);
  return { left: (from / w.days) * 100, width: Math.max(((to - from) / w.days) * 100, 0.6), cutStart: begin < w.start, cutEnd: end > w.end };
}
/** The narrowest the timeline's track gets, in px: the timeline's 820px minimum less its 240px name column. */
export const TRACK_MIN_PX = 580;
/** A generous width for a bar's label: 12px bold text plus the bar's padding. */
export const labelPx = (text: string) => text.length * 7 + 16;
/**
 * Where a bar's label goes: inside when it fits even on the narrowest track, otherwise next to the bar, after it,
 * or before it when the bar sits near the end of the window. A short bar never shows a clipped "At ri…".
 */
export function labelPlacement(pos: { left: number; width: number }, text: string, track = TRACK_MIN_PX): "inside" | "after" | "before" {
  const need = labelPx(text);
  if ((pos.width / 100) * track >= need) return "inside";
  return pos.left + pos.width + (need / track) * 100 <= 100 ? "after" : "before";
}
/** Position of a single day (today) in the window, or null when it is off screen. */
export function dayMark(day: string, w: TimeWindow): number | null {
  if (day < w.start || day > w.end) return null;
  return ((daysBetween(w.start, day) + 0.5) / w.days) * 100;
}

// ── My work ─────────────────────────────────────────────────────
export type WorkShow = "assigned" | "created" | "done";
export interface WorkTicket {
  id: string; number: number; title: string; type: TicketType; status: TicketStatus; priority: TicketPriority; due_date: string | null;
  project_id: string; project_name: string; source: TicketSource; updated_at: string; from_insight: boolean;
}
export interface WorkData { show: WorkShow; tickets: WorkTicket[]; counts: { open: number; overdue: number; projects: number } }
export type WorkGroup = "overdue" | "week" | "later" | "undated";
export const WORK_GROUPS: WorkGroup[] = ["overdue", "week", "later", "undated"];

/** Days from `today` (YYYY-MM-DD) to the Sunday that ends its calendar week; weeks start on Monday. */
export function daysToSunday(today: string) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return (7 - weekday) % 7;
}
/** Which section a ticket belongs to: overdue, due this calendar week (today through Sunday), later, or no due date. */
export function workGroup(due: string | null, today: string): WorkGroup {
  if (!due) return "undated";
  const d = daysBetween(today, due);
  return d < 0 ? "overdue" : d <= daysToSunday(today) ? "week" : "later";
}
export function groupWork<T extends { due_date: string | null }>(tickets: T[], today: string): Record<WorkGroup, T[]> {
  const out: Record<WorkGroup, T[]> = { overdue: [], week: [], later: [], undated: [] };
  for (const t of tickets) out[workGroup(t.due_date, today)].push(t);
  return out;
}
export interface WorkFilters { project: string | null; type: TicketType | null }
export const filterWork = <T extends { project_id: string; type: TicketType }>(tickets: T[], f: WorkFilters) =>
  tickets.filter((t) => (!f.project || t.project_id === f.project) && (!f.type || t.type === f.type));
/** The projects present in a list, once each, by name. */
export function workProjects(tickets: { project_id: string; project_name: string }[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const t of tickets) seen.set(t.project_id, t.project_name);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
