// Milestones and the roadmap of a project (/api/projects/:id/milestones, /api/projects/:id/roadmap),
// the read-only public roadmap, and "My work" (/api/my-work).
import { Router, type Request } from "express";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { accessJoins, accessWhere, projectIn } from "../lib/access.js";
import { milestoneRows } from "../lib/milestones.js";
import { isoDay } from "../lib/schemas.js";

const requireProject = projectIn("tickets");
const token = customAlphabet("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 24);
const pid = (req: Request) => (req.params as { id: string }).id;
const Day = isoDay.nullable();
const MilestoneInput = z.object({ name: z.string().trim().min(1).max(120), start_date: Day.optional(), due_date: Day.optional() })
  .refine((v) => !v.start_date || !v.due_date || v.start_date <= v.due_date, "La fecha de inicio debe ser anterior a la de fin");

// ── Milestones ──────────────────────────────────────────────────
export const milestones = Router({ mergeParams: true });
milestones.use(requireAuth);

milestones.get("/", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id);
  res.json({ milestones: await milestoneRows("m.project_id = $1", [p.id]), role: p.role });
});

const sameName = (e: unknown) => ((e as { code?: string }).code === "23505" ? new HttpError(400, "Ya existe un milestone con ese nombre en este proyecto") : e);

milestones.post("/", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const b = parse(MilestoneInput, req.body);
  try { await query("insert into milestones(project_id, name, start_date, due_date) values ($1,$2,$3,$4)", [p.id, b.name, b.start_date ?? null, b.due_date ?? null]); }
  catch (e) { throw sameName(e); }
  res.status(201).json({ milestones: await milestoneRows("m.project_id = $1", [p.id]) });
});

milestones.patch("/:milestoneId", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const b = parse(MilestoneInput, req.body);
  let rows;
  try { rows = await query("update milestones set name = $3, start_date = $4, due_date = $5 where id = $1 and project_id = $2 returning id", [req.params.milestoneId, p.id, b.name, b.start_date ?? null, b.due_date ?? null]); }
  catch (e) { throw sameName(e); }
  if (!rows.length) throw notFound("Milestone");
  res.json({ milestones: await milestoneRows("m.project_id = $1", [p.id]) });
});

/** Deleting a milestone keeps its tickets; they simply stop belonging to one. Owners only. */
milestones.delete("/:milestoneId", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "owner");
  const rows = await query("delete from milestones where id = $1 and project_id = $2 returning id", [req.params.milestoneId, p.id]);
  if (!rows.length) throw notFound("Milestone");
  res.json({ milestones: await milestoneRows("m.project_id = $1", [p.id]) });
});

// ── Roadmap ─────────────────────────────────────────────────────
/** Studies as roadmap items: live ones run from publication to today, closed ones to their last response. Drafts have no dates yet. */
const studyItems = (where: string, params: unknown[], withCounts: boolean) => query(
  `select s.id, s.title, s.status, s.project_id, p.name as project_name, to_char(s.published_at, 'YYYY-MM-DD') as begin_date,
     to_char(case when s.status = 'live' then current_date
                  else coalesce((select max(x.completed_at) from sessions x where x.study_id = s.id), s.updated_at)::date end, 'YYYY-MM-DD') as end_date
     ${withCounts ? ", (select count(*)::int from sessions x where x.study_id = s.id and x.completed_at is not null) as responses" : ""}
   from studies s join projects p on p.id = s.project_id
   where ${where} and s.status in ('live','closed') and s.published_at is not null order by s.published_at`, params);

export const roadmap = Router({ mergeParams: true });
roadmap.use(requireAuth);

roadmap.get("/", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id);
  const [ms, studies] = await Promise.all([milestoneRows("m.project_id = $1", [p.id]), studyItems("s.project_id = $1", [p.id], true)]);
  res.json({ project: { id: p.id, name: p.name, organization_id: p.organization_id }, milestones: ms, studies, share_token: (p as { roadmap_token?: string | null }).roadmap_token ?? null, role: p.role });
});

/** Turns the read-only link on (keeping the current one if it is already on). Editors. */
roadmap.post("/share", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const r = await one<{ roadmap_token: string }>("update projects set roadmap_token = coalesce(roadmap_token, $2) where id = $1 returning roadmap_token", [p.id, token()]);
  res.status(201).json({ share_token: r!.roadmap_token });
});

/** Revoking makes the old link stop working for good; sharing again creates a new one. */
roadmap.delete("/share", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  await query("update projects set roadmap_token = null where id = $1", [p.id]);
  res.json({ share_token: null });
});

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
export const myWork = Router();
myWork.use(requireAuth);

const Show = z.enum(["assigned", "created", "done"]).default("assigned");
const SHOW_SQL: Record<z.infer<typeof Show>, string> = {
  assigned: "t.status <> 'done' and exists(select 1 from ticket_assignees a where a.ticket_id = t.id and a.user_id = $1)",
  created: "t.status <> 'done' and t.created_by = $1",
  // Done in the last 14 days, among the tickets the person was assigned to or created.
  done: "t.status = 'done' and t.updated_at > now() - interval '14 days' and (t.created_by = $1 or exists(select 1 from ticket_assignees a where a.ticket_id = t.id and a.user_id = $1))",
};

myWork.get("/", async (req, res) => {
  const show = parse(Show, req.query.show);
  const uid = req.user!.id;
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
  res.json({ show, tickets, counts });
});
