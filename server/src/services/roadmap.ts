/**
 * Milestones and the roadmap of a project, the read-only public roadmap, the organization roadmap, and "My work".
 * All of it belongs to a project's "tickets" section.
 */
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { one, query } from "../lib/db.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { accessJoins, accessWhere, projectIn } from "../lib/access.js";
import { milestoneRows } from "../lib/milestones.js";
import { isoDay } from "../lib/schemas.js";
import type { Actor } from "./actor.js";

const requireProject = projectIn("tickets");
const token = customAlphabet("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 24);
const Day = isoDay.nullable();
const datesInOrder = (v: { start_date?: string | null; due_date?: string | null }) => !v.start_date || !v.due_date || v.start_date <= v.due_date;
const ORDER = "La fecha de inicio debe ser anterior a la de fin";
export const MilestoneFields = z.object({ name: z.string().trim().min(1).max(120), start_date: Day.optional(), due_date: Day.optional() });
export const MilestoneCreate = MilestoneFields.refine(datesInOrder, ORDER);
/** An edit: only the fields sent change, and null clears a date. */
export const MilestonePatch = MilestoneFields.partial();

const projectMilestones = (projectId: string) => milestoneRows("m.project_id = $1", [projectId]);
const sameName = (e: unknown) => ((e as { code?: string }).code === "23505" ? new HttpError(400, "Ya existe un milestone con ese nombre en este proyecto") : e);

export async function listMilestones(actor: Actor, projectId: string) {
  const p = await requireProject(projectId, actor.id);
  return { milestones: await projectMilestones(p.id), role: p.role };
}

export async function createMilestone(actor: Actor, projectId: string, input: unknown) {
  const p = await requireProject(projectId, actor.id, "editor");
  const b = parse(MilestoneCreate, input);
  try { await query("insert into milestones(project_id, name, start_date, due_date) values ($1,$2,$3,$4)", [p.id, b.name, b.start_date ?? null, b.due_date ?? null]); }
  catch (e) { throw sameName(e); }
  return { milestones: await projectMilestones(p.id) };
}

export async function updateMilestone(actor: Actor, projectId: string, milestoneId: string, input: unknown) {
  const p = await requireProject(projectId, actor.id, "editor");
  const b = parse(MilestonePatch, input);
  const cur = await one<{ name: string; start_date: string | null; due_date: string | null }>(
    "select name, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(due_date, 'YYYY-MM-DD') as due_date from milestones where id = $1 and project_id = $2", [milestoneId, p.id]);
  if (!cur) throw notFound("Milestone");
  const next = { name: b.name ?? cur.name, start_date: b.start_date !== undefined ? b.start_date : cur.start_date, due_date: b.due_date !== undefined ? b.due_date : cur.due_date };
  if (!datesInOrder(next)) throw new HttpError(400, ORDER);
  try { await query("update milestones set name = $3, start_date = $4, due_date = $5 where id = $1 and project_id = $2", [milestoneId, p.id, next.name, next.start_date, next.due_date]); }
  catch (e) { throw sameName(e); }
  return { milestones: await projectMilestones(p.id) };
}

/** Deleting a milestone keeps its tickets; they simply stop belonging to one. Owners only. */
export async function deleteMilestone(actor: Actor, projectId: string, milestoneId: string) {
  const p = await requireProject(projectId, actor.id, "owner");
  const rows = await query("delete from milestones where id = $1 and project_id = $2 returning id", [milestoneId, p.id]);
  if (!rows.length) throw notFound("Milestone");
  return { milestones: await projectMilestones(p.id) };
}

// ── Roadmap ─────────────────────────────────────────────────────
/** Studies as roadmap items: live ones run from publication to today, closed ones to their last response. Drafts have no dates yet. */
const studyItems = (where: string, params: unknown[], withCounts: boolean) => query(
  `select s.id, s.title, s.status, s.project_id, p.name as project_name, to_char(s.published_at, 'YYYY-MM-DD') as begin_date,
     to_char(case when s.status = 'live' then current_date
                  else coalesce((select max(x.completed_at) from sessions x where x.study_id = s.id), s.updated_at)::date end, 'YYYY-MM-DD') as end_date
     ${withCounts ? ", (select count(*)::int from sessions x where x.study_id = s.id and x.completed_at is not null) as responses" : ""}
   from studies s join projects p on p.id = s.project_id
   where ${where} and s.status in ('live','closed') and s.published_at is not null order by s.published_at`, params);

export async function getRoadmap(actor: Actor, projectId: string) {
  const p = await requireProject(projectId, actor.id);
  const [ms, studies] = await Promise.all([projectMilestones(p.id), studyItems("s.project_id = $1", [p.id], true)]);
  return { project: { id: p.id, name: p.name, organization_id: p.organization_id }, milestones: ms, studies, share_token: (p as { roadmap_token?: string | null }).roadmap_token ?? null, role: p.role };
}

/** Turns the read-only link on (keeping the current one if it is already on). Editors. */
export async function shareRoadmap(actor: Actor, projectId: string) {
  const p = await requireProject(projectId, actor.id, "editor");
  const r = await one<{ roadmap_token: string }>("update projects set roadmap_token = coalesce(roadmap_token, $2) where id = $1 returning roadmap_token", [p.id, token()]);
  return { share_token: r!.roadmap_token };
}

/** Revoking makes the old link stop working for good; sharing again creates a new one. */
export async function unshareRoadmap(actor: Actor, projectId: string) {
  const p = await requireProject(projectId, actor.id, "editor");
  await query("update projects set roadmap_token = null where id = $1", [p.id]);
  return { share_token: null };
}

/** The public roadmap: milestones with their progress and studies with their dates. No tickets, comments, people or response counts. */
export async function publicRoadmap(shareToken: string) {
  const p = await one<{ id: string; name: string; color: string }>("select id, name, color from projects where roadmap_token = $1 and not archived", [shareToken]);
  if (!p) throw notFound("Roadmap");
  const [ms, studies] = await Promise.all([milestoneRows("m.project_id = $1", [p.id]), studyItems("s.project_id = $1", [p.id], false)]);
  return {
    project: { name: p.name, color: p.color },
    milestones: ms.map(({ id, name, begin_date, end_date, total, done, state, progress }) => ({ id, name, begin_date, end_date, total, done, state, progress })),
    studies: studies.map(({ id, title, status, begin_date, end_date }) => ({ id, title, status, begin_date, end_date })),
  };
}

/** Milestones of every project of an organization the person can open, for the organization roadmap. */
export async function orgRoadmap(orgId: string, userId: string) {
  return milestoneRows(`m.project_id in (select p.id ${accessJoins("$1")} where ${accessWhere("$1", "tickets")} and not p.archived and p.organization_id = $2)`, [userId, orgId]);
}

// ── My work ─────────────────────────────────────────────────────
export const Show = z.enum(["assigned", "created", "done"]).default("assigned");
const SHOW_SQL: Record<z.infer<typeof Show>, string> = {
  assigned: "t.status <> 'done' and exists(select 1 from ticket_assignees a where a.ticket_id = t.id and a.user_id = $1)",
  created: "t.status <> 'done' and t.created_by = $1",
  // Done in the last 14 days, among the tickets the person was assigned to or created.
  done: "t.status = 'done' and t.updated_at > now() - interval '14 days' and (t.created_by = $1 or exists(select 1 from ticket_assignees a where a.ticket_id = t.id and a.user_id = $1))",
};

/** My open tickets across projects (assigned to me, created by me) or the ones done lately. */
export async function myWork(actor: Actor, show_: unknown) {
  const show = parse(Show, show_);
  const uid = actor.id;
  const [tickets, counts] = await Promise.all([
    query(
      `with acc as (select p.id, p.name ${accessJoins("$1")} where ${accessWhere("$1", "tickets")} and not p.archived)
       select t.id, t.number, t.title, t.type, t.status, t.priority, to_char(t.due_date, 'YYYY-MM-DD') as due_date, t.project_id, acc.name as project_name,
         t.source, t.updated_at,
         exists(select 1 from ticket_links k where k.ticket_id = t.id and k.target_type = 'insight' and k.relation <> 'converted') as from_insight
       from tickets t join acc on acc.id = t.project_id
       where ${SHOW_SQL[show]}
       order by ${show === "done" ? "t.updated_at desc" : "t.due_date nulls last, array_position(array['urgent','high','medium','low'], t.priority), t.number"} limit 200`, [uid]),
    one<{ open: number; overdue: number; projects: number }>(
      `with acc as (select p.id ${accessJoins("$1")} where ${accessWhere("$1", "tickets")} and not p.archived),
         mine as (select t.* from tickets t join acc on acc.id = t.project_id
                  where t.status <> 'done' and exists(select 1 from ticket_assignees a where a.ticket_id = t.id and a.user_id = $1))
       select count(*)::int as open, count(*) filter (where due_date < current_date)::int as overdue, count(distinct project_id)::int as projects from mine`, [uid]),
  ]);
  return { show, tickets, counts };
}
