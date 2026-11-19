// Tickets: types and the pure logic behind the board and the list (filtering, sorting, URL state,
// selection, mentions). No React and no texts here, so everything can be tested.
import type { ProjectRole, Severity } from "../lib/types";

export const STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
export const TYPES = ["task", "bug", "research_request", "design_change"] as const;
export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type TicketStatus = (typeof STATUSES)[number];
export type TicketType = (typeof TYPES)[number];
export type TicketPriority = (typeof PRIORITIES)[number];
export type TicketSource = "manual" | "insight" | "widget";

export interface PersonRef { id: string; name: string; avatar: string | null }
export interface Person extends PersonRef { email: string; role: ProjectRole }
export interface Milestone { id: string; name: string }

/** A column of the project's board. Built-in columns use their status as id and have no name of their own. */
export interface Column { id: string; name: string | null; status: TicketStatus; custom: boolean }
export const BUILT_IN_COLUMNS: Column[] = STATUSES.map((s) => ({ id: s, name: null, status: s, custom: false }));
export const MAX_COLUMNS = 12;

/** The severity an insight converted from a ticket starts with (same rule as the server's severityFromPriority). */
export const severityFromPriority = (p: TicketPriority): Severity => ({ urgent: "critical", high: "high", medium: "medium", low: "low" } as const)[p] ?? "medium";
// The names the server gives the built-in columns when a board is first customized (server/src/lib/board.ts).
// A column still named like that is the stock column, so it is shown in the reader's language.
const STOCK_NAMES: Record<TicketStatus, string[]> = {
  todo: ["por hacer", "to do"], in_progress: ["en progreso", "in progress"], in_review: ["en revisión", "in review"], done: ["hecho", "done"],
};
/** True when `name` is the stock name (Spanish or English) of the status the column counts as. */
export const isStockColumnName = (name: string, status: TicketStatus) => STOCK_NAMES[status]?.includes(name.trim().toLowerCase()) ?? false;

export interface Ticket {
  id: string; number: number; title: string; type: TicketType; status: TicketStatus; priority: TicketPriority;
  column?: string;                    // id of its board column (its status on a built-in board)
  due_date: string | null;            // YYYY-MM-DD
  milestone_id: string | null; milestone: string | null;
  position: number; source: TicketSource; created_at: string; updated_at: string;
  assignees: PersonRef[]; labels: string[];
  from_insight: boolean; widget_ref: string | null;
  converted_insight_id?: string | null;   // the insight this ticket was converted into, if any
}

export type LinkTarget = "insight" | "study" | "document" | "ticket";
export interface TicketLink {
  id: string; target_type: LinkTarget; target_id: string; relation: string; incoming: boolean; title: string;
  number: number | null; severity: Severity | null; evidence_count: number | null; study_title: string | null;
}
export interface TicketActivity { id: string; action: string; from_value: string | null; to_value: string | null; created_at: string; actor_id: string | null; actor_name: string | null; actor_avatar: string | null }
export type CommentVisibility = "internal" | "email_to_reporter" | "reply_from_reporter";
export interface TicketComment { id: string; body: string; created_at: string; user_id: string | null; name: string | null; avatar: string | null; visibility: CommentVisibility }
export interface ReporterMeta {
  page_url?: string; page_title?: string; os?: string; browser?: string; window_size?: string; screen_resolution?: string;
  pixel_ratio?: number | string; color_depth?: string; language?: string; timezone?: string; approx_location?: string; sent_at?: string;
  kind?: "broken" | "idea" | "question"; console_errors?: string[];
}
export interface Reporter {
  id: string; ref: string | null; name: string | null; email: string | null; external_user_id: string | null; verified: boolean;
  first_seen: string | null; last_seen: string | null; reports_count: number;
  metadata: ReporterMeta; custom_data: Record<string, unknown>; attachments: { screenshot?: string; recording?: string; files?: { url: string; name: string }[] };
  erased_at: string | null; created_at: string;
}
export interface TicketDetail extends Ticket {
  description: string; created_by: string | null; created_by_name: string | null;
  watchers: PersonRef[]; links: TicketLink[]; activity: TicketActivity[]; comments: TicketComment[]; reporters: Reporter[];
  similar: { number: number; title: string } | null;
}
export interface TicketList { tickets: Ticket[]; columns?: Column[]; people: Person[]; milestones: Milestone[]; next_number: number; role: ProjectRole }

// ── Filters ─────────────────────────────────────────────────────
export const DUE_FILTERS = ["overdue", "week", "month", "none"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];
/** "none" in assignee and milestone means "unassigned" / "no milestone". */
export const NONE = "none";
export interface Filters { q: string; assignee: string[]; type: TicketType[]; priority: TicketPriority[]; label: string[]; due: DueFilter | null; milestone: string | null }
export const NO_FILTERS: Filters = { q: "", assignee: [], type: [], priority: [], label: [], due: null, milestone: null };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** YYYY-MM-DD of a local date. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); return isoDay(new Date(y, m - 1, d + n)); };

export function matchesDue(due: string | null, f: DueFilter, today: string): boolean {
  if (f === "none") return due === null;
  if (due === null) return false;
  if (f === "overdue") return due < today;
  return due >= today && due <= addDays(today, f === "week" ? 7 : 30);
}

export function matchesFilters(t: Ticket, f: Filters, today: string): boolean {
  if (f.q.trim()) {
    const q = fold(f.q.trim().replace(/^#/, ""));
    const hay = fold(`${t.number} ${t.title} ${t.labels.join(" ")} ${t.assignees.map((a) => a.name).join(" ")} ${t.widget_ref ?? ""}`);
    if (!hay.includes(q)) return false;
  }
  if (f.assignee.length && !(t.assignees.some((a) => f.assignee.includes(a.id)) || (f.assignee.includes(NONE) && !t.assignees.length))) return false;
  if (f.type.length && !f.type.includes(t.type)) return false;
  if (f.priority.length && !f.priority.includes(t.priority)) return false;
  if (f.label.length && !t.labels.some((l) => f.label.includes(l))) return false;
  if (f.due && !matchesDue(t.due_date, f.due, today)) return false;
  if (f.milestone && (f.milestone === NONE ? t.milestone_id !== null : t.milestone_id !== f.milestone)) return false;
  return true;
}
export const filterTickets = (ts: Ticket[], f: Filters, today: string) => ts.filter((t) => matchesFilters(t, f, today));
/** Number of filters in use (the search box counts as one). */
export const filterCount = (f: Filters) => (f.q.trim() ? 1 : 0) + f.assignee.length + f.type.length + f.priority.length + f.label.length + (f.due ? 1 : 0) + (f.milestone ? 1 : 0);

// ── Sorting ─────────────────────────────────────────────────────
export const SORT_KEYS = ["number", "title", "status", "priority", "assignee", "due", "milestone", "labels"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";
export interface Sort { key: SortKey; dir: SortDir }
export const DEFAULT_SORT: Sort = { key: "due", dir: "asc" };

const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
/** Compares two values where an empty one always goes last, whatever the direction. */
function withEmptyLast<T>(a: T | null, b: T | null, dir: SortDir, cmp: (x: T, y: T) => number): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return dir === "asc" ? cmp(a, b) : cmp(b, a);
}
const empty = (s: string | undefined | null) => (s ? s : null);

export function compareTickets(a: Ticket, b: Ticket, { key, dir }: Sort, cols: Column[] = BUILT_IN_COLUMNS): number {
  const sign = dir === "asc" ? 1 : -1;
  let r = 0;
  switch (key) {
    case "number": r = sign * (a.number - b.number); break;
    case "title": r = sign * text(a.title, b.title); break;
    case "status": r = sign * (cols.indexOf(columnOf(a, cols)) - cols.indexOf(columnOf(b, cols))); break;
    case "priority": r = sign * (PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority)); break;   // ascending = most urgent first
    case "assignee": r = withEmptyLast(empty(a.assignees[0]?.name), empty(b.assignees[0]?.name), dir, text); break;
    case "due": r = withEmptyLast(a.due_date, b.due_date, dir, (x, y) => (x < y ? -1 : x > y ? 1 : 0)); break;
    case "milestone": r = withEmptyLast(a.milestone, b.milestone, dir, text); break;
    case "labels": r = withEmptyLast(empty(a.labels[0]), empty(b.labels[0]), dir, text); break;
  }
  return r || a.number - b.number;
}
export const sortTickets = (ts: Ticket[], sort: Sort, cols: Column[] = BUILT_IN_COLUMNS) => [...ts].sort((a, b) => compareTickets(a, b, sort, cols));
/** Clicking a column header: same column flips the direction, another column starts ascending. */
export const toggleSort = (cur: Sort, key: SortKey): Sort => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

// ── Board ───────────────────────────────────────────────────────
/** The column a ticket sits in: its own, else the first that counts as its status, else the first of the board. */
export function columnOf(t: Pick<Ticket, "column" | "status">, cols: Column[] = BUILT_IN_COLUMNS): Column {
  return cols.find((c) => c.id === (t.column ?? t.status)) ?? cols.find((c) => c.status === t.status) ?? cols[0];
}

/** Tickets of each column (by column id) in board order. */
export function boardColumns(ts: Ticket[], cols: Column[] = BUILT_IN_COLUMNS): Record<string, Ticket[]> {
  const out: Record<string, Ticket[]> = Object.fromEntries(cols.map((c) => [c.id, []]));
  for (const t of [...ts].sort((a, b) => a.position - b.position || a.number - b.number)) out[columnOf(t, cols).id].push(t);
  return out;
}

/** Where a ticket sits now, as a move would put it back there: its column and the ticket right below it (null = last). */
export function placeOf(ts: Ticket[], number: number, cols: Column[] = BUILT_IN_COLUMNS): { column: string; before: number | null } | null {
  const ticket = ts.find((t) => t.number === number);
  if (!ticket) return null;
  const column = columnOf(ticket, cols).id;
  const list = boardColumns(ts, cols)[column];
  const next = list[list.findIndex((t) => t.number === number) + 1];
  return { column, before: next ? next.number : null };
}

/**
 * The list as it will look once a card is dropped: `number` moves to the column `to`, right above `before` (null = end of the column).
 * Used to show the move at once; the server answers with the definitive order.
 */
export function moveTicket(ts: Ticket[], number: number, to: string, before: number | null, cols: Column[] = BUILT_IN_COLUMNS): Ticket[] {
  const moved = ts.find((t) => t.number === number), target = cols.find((c) => c.id === to);
  if (!moved || !target) return ts;
  const column = boardColumns(ts.filter((t) => t.number !== number), cols)[to];
  const at = before === null ? -1 : column.findIndex((t) => t.number === before);
  const next = at === -1 ? [...column, moved] : [...column.slice(0, at), moved, ...column.slice(at)];
  const position = new Map(next.map((t, i) => [t.number, (i + 1) * 1024]));
  return ts.map((t) => (position.has(t.number) ? { ...t, ...(t.number === number ? { status: target.status, column: target.id } : {}), position: position.get(t.number)! } : t));
}

// ── Editing the board's columns ─────────────────────────────────
export interface ColumnDraft { key: string; id?: string; name: string; status: TicketStatus }
/** Why a draft of the board cannot be saved, or null when it can. Mirrors the server's rules. */
export function columnsProblem(cols: Pick<ColumnDraft, "name" | "status">[]): "count" | "name" | "duplicate" | "todo" | "done" | "done_last" | null {
  if (cols.length < 2 || cols.length > MAX_COLUMNS) return "count";
  if (cols.some((c) => !c.name.trim() || c.name.trim().length > 40)) return "name";
  const names = cols.map((c) => c.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "duplicate";
  if (!cols.some((c) => c.status === "todo")) return "todo";
  if (!cols.some((c) => c.status === "done")) return "done";
  // Done is what dashboards and progress count as finished, so done columns are the last ones on the board.
  const firstDone = cols.findIndex((c) => c.status === "done");
  if (cols.slice(firstDone).some((c) => c.status !== "done")) return "done_last";
  return null;
}
/** Words that suggest a column is still being checked (QA, testing, review, staging), in Spanish and English. */
const REVIEW_WORDS = /\b(qa|test|prueba|revis|review|verif|stag)/;
/** True when a column named like a review or testing step is set to count as done: worth a warning, not a block. */
export const looksLikeReviewAsDone = (c: Pick<ColumnDraft, "name" | "status">) => c.status === "done" && REVIEW_WORDS.test(fold(c.name));
export const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list]; const [x] = next.splice(from, 1); next.splice(to, 0, x); return next;
};

// ── URL state ───────────────────────────────────────────────────
export type View = "board" | "list";
export interface ViewState { view: View; filters: Filters; sort: Sort; ticket: number | null }

const listOf = <T extends string>(v: string | null, allowed?: readonly T[]): T[] =>
  (v ? v.split(",").filter(Boolean) : []).filter((x): x is T => !allowed || (allowed as readonly string[]).includes(x));

export function readView(p: URLSearchParams): ViewState {
  const sortKey = p.get("sort"), n = Number(p.get("ticket"));
  return {
    view: p.get("view") === "list" ? "list" : "board",
    filters: {
      q: p.get("q") ?? "",
      assignee: listOf(p.get("assignee")), type: listOf(p.get("type"), TYPES), priority: listOf(p.get("priority"), PRIORITIES), label: listOf(p.get("label")),
      due: (DUE_FILTERS as readonly string[]).includes(p.get("due") ?? "") ? (p.get("due") as DueFilter) : null,
      milestone: p.get("milestone") || null,
    },
    sort: (SORT_KEYS as readonly string[]).includes(sortKey ?? "") ? { key: sortKey as SortKey, dir: p.get("dir") === "desc" ? "desc" : "asc" } : DEFAULT_SORT,
    ticket: Number.isInteger(n) && n > 0 ? n : null,
  };
}

/** Writes the view into the query string, leaving out defaults and keeping parameters that are not ours (e.g. `tab`). */
export function writeView(prev: URLSearchParams, s: ViewState): URLSearchParams {
  const p = new URLSearchParams(prev);
  const set = (k: string, v: string | null) => { if (v) p.set(k, v); else p.delete(k); };
  set("view", s.view === "list" ? "list" : null);
  set("q", s.filters.q.trim() || null);
  set("assignee", s.filters.assignee.join(",") || null);
  set("type", s.filters.type.join(",") || null);
  set("priority", s.filters.priority.join(",") || null);
  set("label", s.filters.label.join(",") || null);
  set("due", s.filters.due);
  set("milestone", s.filters.milestone);
  const defaultSort = s.sort.key === DEFAULT_SORT.key && s.sort.dir === DEFAULT_SORT.dir;
  set("sort", defaultSort ? null : s.sort.key);
  set("dir", defaultSort || s.sort.dir === "asc" ? null : "desc");
  set("ticket", s.ticket ? String(s.ticket) : null);
  return p;
}

// ── Selection (list) ────────────────────────────────────────────
export type SelectAll = "none" | "some" | "all";
/** State of the select-all checkbox for the rows on screen. */
export function selectAllState(visible: number[], selected: ReadonlySet<number>): SelectAll {
  const n = visible.filter((x) => selected.has(x)).length;
  return n === 0 ? "none" : n === visible.length ? "all" : "some";
}
/** Select-all click: everything visible when not all were selected, otherwise nothing visible. Hidden selections are kept. */
export function toggleAll(visible: number[], selected: ReadonlySet<number>): Set<number> {
  const next = new Set(selected);
  if (selectAllState(visible, selected) === "all") visible.forEach((n) => next.delete(n));
  else visible.forEach((n) => next.add(n));
  return next;
}

// ── Lookups and mentions ────────────────────────────────────────
export const allLabels = (ts: Ticket[]) => [...new Set(ts.flatMap((t) => t.labels))].sort(text);

/** Position (1-based) of a ticket among the ones on screen, and its neighbours, for "2 of 7" and previous/next. */
export function neighbours(order: number[], number: number): { index: number; total: number; prev: number | null; next: number | null } {
  const i = order.indexOf(number);
  return { index: i + 1, total: order.length, prev: i > 0 ? order[i - 1] : null, next: i !== -1 && i < order.length - 1 ? order[i + 1] : null };
}

/** The "@text" being typed right before the caret, or null when the caret is not in a mention. */
export function mentionQuery(body: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([^\s@]*(?: [^\s@]*)?)$/u.exec(body.slice(0, caret));
  return m ? { start: m.index + m[1].length, query: m[2] } : null;
}
/** People whose name matches what was typed after @. */
export const mentionOptions = (people: Person[], query: string) => people.filter((p) => fold(p.name).includes(fold(query.trim()))).slice(0, 6);
/** Replaces the "@text" being typed with the chosen person's full name. */
export function applyMention(body: string, caret: number, name: string): { body: string; caret: number } {
  const q = mentionQuery(body, caret);
  if (!q) return { body, caret };
  const head = `${body.slice(0, q.start)}@${name} `;
  return { body: head + body.slice(caret), caret: head.length };
}
/** Splits a comment into plain text and "@Full Name" mentions of known people, for highlighting. */
export function splitMentions(body: string, people: { name: string }[]): { text: string; mention: boolean }[] {
  const names = [...new Set(people.map((p) => p.name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!names.length) return [{ text: body, mention: false }];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@(?:${names.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const out: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    if (m.index > last) out.push({ text: body.slice(last, m.index), mention: false });
    out.push({ text: m[0], mention: true });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out;
}
