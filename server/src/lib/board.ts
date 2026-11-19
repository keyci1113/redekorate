// Board columns of a project's tickets. A project either uses the four built-in columns (one per status)
// or its own list; each of its columns counts as one status, which is what reports and milestones read.
import { TICKET_STATUSES, type TicketStatus } from "./tickets.js";

/** `id` is the status itself for a built-in column and a uuid for a project's own column. */
export interface Column { id: string; name: string | null; status: TicketStatus; custom: boolean }
export interface ColumnInput { id?: string; name: string; status: TicketStatus }

export const MAX_COLUMNS = 12;
export const builtInColumns = (): Column[] => TICKET_STATUSES.map((s) => ({ id: s, name: null, status: s, custom: false }));
const BUILT_IN_NAMES: Record<"es" | "en", Record<TicketStatus, string>> = {
  es: { todo: "Por hacer", in_progress: "En progreso", in_review: "En revisión", done: "Hecho" },
  en: { todo: "To do", in_progress: "In progress", in_review: "In review", done: "Done" },
};
export const builtInName = (status: TicketStatus, lang: "es" | "en") => BUILT_IN_NAMES[lang][status];

/** What the history and notifications call a column: its name, or the status key of a built-in one (translated when shown). */
export const columnLabel = (c: Column) => c.name ?? c.status;

/** The column a write points to: by id when given, otherwise the first one that counts as `status`. Null when there is none. */
export function findColumn(cols: Column[], key: string | undefined, status?: TicketStatus): Column | null {
  if (key !== undefined) return cols.find((c) => c.id === key) ?? cols.find((c) => c.status === key) ?? null;
  return (status !== undefined ? cols.find((c) => c.status === status) : cols[0]) ?? null;
}

/** Why a list of columns cannot be saved, or null when it can. */
export function columnsProblem(cols: ColumnInput[]): "count" | "name" | "duplicate" | "todo" | "done" | "done_last" | null {
  if (cols.length < 2 || cols.length > MAX_COLUMNS) return "count";
  if (cols.some((c) => !c.name.trim() || c.name.trim().length > 40)) return "name";
  const names = cols.map((c) => c.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "duplicate";
  // New tickets (and feedback from the widget) need somewhere to land, and milestones need to know what finished means.
  if (!cols.some((c) => c.status === "todo")) return "todo";
  if (!cols.some((c) => c.status === "done")) return "done";
  // Done is what dashboards and progress count as finished, so done columns are the last ones on the board:
  // a QA or testing column in front of Done cannot count as Done by mistake.
  // Only checked on save: boards saved before this rule keep loading as they are.
  const firstDone = cols.findIndex((c) => c.status === "done");
  if (cols.slice(firstDone).some((c) => c.status !== "done")) return "done_last";
  return null;
}

/** Where the tickets of a removed column go: the chosen column, else the first kept one with the same status, else the first kept one. */
export function fallbackColumn<T extends { id: string; status: TicketStatus }>(removed: { status: TicketStatus }, kept: T[], chosen?: string): T {
  return kept.find((c) => c.id === chosen) ?? kept.find((c) => c.status === removed.status) ?? kept[0];
}
