// Milestones as every screen reads them: their tickets counted by status, their dates and the state derived from both.
import type { PoolClient } from "pg";
import { pool } from "./db.js";

export type MilestoneState = "done" | "planned" | "behind" | "at_risk" | "on_track";
export interface MilestoneCounts { total: number; done: number; overdue_open: number; unassigned_open: number; start_date?: string | null; end_date?: string | null }
/** A milestone with open tickets is "at risk" once its end date is this many days away or closer. */
export const AT_RISK_DAYS = 14;
const dayNumber = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
/**
 * Done when every ticket is; planned while its start date is still ahead; behind when an open ticket is overdue
 * or its own end date has passed; at risk when it still has open tickets and ends within AT_RISK_DAYS;
 * otherwise on track. Unassigned tickets alone never make a milestone at risk: a milestone months away
 * with work nobody has picked up yet is normal planning, not a risk. `today` and the dates are YYYY-MM-DD.
 */
export function milestoneState(m: MilestoneCounts, today?: string): MilestoneState {
  if (m.total > 0 && m.done === m.total) return "done";
  if (today && m.start_date && m.start_date > today) return "planned";
  if (m.overdue_open > 0 || (today && m.end_date && m.end_date < today)) return "behind";
  if (today && m.end_date && m.total > m.done && dayNumber(m.end_date) - dayNumber(today) <= AT_RISK_DAYS) return "at_risk";
  return "on_track";
}
export const milestoneProgress = (m: Pick<MilestoneCounts, "total" | "done">) => (m.total ? Math.round((m.done / m.total) * 100) : 0);

export interface MilestoneRow {
  id: string; name: string; project_id: string; project_name: string;
  start_date: string | null; due_date: string | null;   // as entered on the milestone
  begin_date: string | null; end_date: string | null;   // what the roadmap draws: the entered dates, or the span of its tickets
  total: number; todo: number; in_progress: number; in_review: number; done: number;
  overdue_open: number; unassigned_open: number; closed_at: string | null;
  state: MilestoneState; progress: number;
}

/** `where` filters milestones (alias m) and may use $1…; the caller supplies the parameters. */
const sql = (where: string) => `
  select m.id, m.name, m.project_id, p.name as project_name,
    to_char(m.start_date, 'YYYY-MM-DD') as start_date, to_char(m.due_date, 'YYYY-MM-DD') as due_date,
    to_char(coalesce(m.start_date, min(t.created_at)::date), 'YYYY-MM-DD') as begin_date,
    to_char(coalesce(m.due_date, max(t.due_date)), 'YYYY-MM-DD') as end_date,
    count(t.id)::int as total,
    count(t.id) filter (where t.status = 'todo')::int as todo,
    count(t.id) filter (where t.status = 'in_progress')::int as in_progress,
    count(t.id) filter (where t.status = 'in_review')::int as in_review,
    count(t.id) filter (where t.status = 'done')::int as done,
    count(t.id) filter (where t.status <> 'done' and t.due_date < current_date)::int as overdue_open,
    count(t.id) filter (where t.status <> 'done' and not exists(select 1 from ticket_assignees a where a.ticket_id = t.id))::int as unassigned_open,
    to_char((select max(a.created_at) from ticket_activity a join tickets x on x.id = a.ticket_id
             where x.milestone_id = m.id and a.action = 'status' and a.to_value = 'done'), 'YYYY-MM-DD') as closed_at,
    to_char(current_date, 'YYYY-MM-DD') as today
  from milestones m join projects p on p.id = m.project_id left join tickets t on t.milestone_id = m.id
  where ${where} group by m.id, p.name`;

const END = "9999";
/** Milestones matching `where`, with state and progress, ordered by when they end (undated last). */
export async function milestoneRows(where: string, params: unknown[], db: Pick<PoolClient, "query"> = pool): Promise<MilestoneRow[]> {
  const { rows } = await db.query(sql(where), params);
  return rows
    .map(({ today, ...m }) => ({ ...m, state: milestoneState(m, today), progress: milestoneProgress(m) }) as MilestoneRow)
    .sort((a, b) => (a.end_date ?? END).localeCompare(b.end_date ?? END) || a.name.localeCompare(b.name));
}
