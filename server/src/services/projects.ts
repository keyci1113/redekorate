/**
 * Projects: listing, creating, reading, editing and deleting them, and the studies and insights they hold.
 * Sharing a project (members, report links) and its comments stay in routes/projects.ts: only the web app does them.
 */
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { HttpError, parse } from "../lib/http.js";
import { ORG_COLS, accessJoins, accessWhere, areasSql, requireProject, roleSql } from "../lib/access.js";
import { PROJECT_CATEGORIES } from "../lib/projectCategories.js";
import { removeStored } from "../routes/files.js";
import type { Actor } from "./actor.js";

export const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const ProjectFields = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(4000).optional(),
  color: Color.optional(),
  category: z.enum(PROJECT_CATEGORIES).optional(),
  archived: z.boolean().optional(),
  organization_id: z.string().uuid().nullable().optional(),   // null = personal project
});
/** An edit: every field optional (none has a default, so nothing left out changes). */
export const ProjectPatch = ProjectFields.partial();
export const ProjectListQuery = z.object({ category: z.enum(PROJECT_CATEGORIES).optional() });

/** The caller must belong to the organization a project is placed in. */
async function requireOrgMember(orgId: string | null | undefined, userId: string) {
  if (!orgId) return;
  if (!(await one("select 1 from organization_members where organization_id = $1 and user_id = $2", [orgId, userId]))) throw new HttpError(403, "No perteneces a esa organización");
}

/** Every project the person can open, with their role, sections and counts; `category` narrows the list. */
export async function listProjects(actor: Actor, input: unknown = {}) {
  const filter = parse(ProjectListQuery, input);
  const rows = await query(
    `select p.*, ${roleSql("$1")} as role, ${areasSql("$1")} as areas, u.name as owner_name, ${ORG_COLS},
       (select count(*)::int from studies s where s.project_id = p.id) as study_count,
       (select count(*)::int from studies s where s.project_id = p.id and s.status = 'live') as live_count,
       (select count(*)::int from sessions se join studies s on s.id = se.study_id
          where s.project_id = p.id and se.completed_at is not null) as response_count,
       (select count(*)::int from sessions se join studies s on s.id = se.study_id where s.project_id = p.id) as started_count,
       (select count(*)::int from participants pa where pa.project_id = p.id) as participant_count,
       (select count(*)::int from report_shares rs where rs.project_id = p.id and rs.revoked_at is null) as share_count,
       (select count(*)::int from insights i where i.project_id = p.id) as insight_count,
       (select count(*)::int from documents d where d.project_id = p.id) as document_count
     ${accessJoins("$1")}
       join users u on u.id = p.owner_id
     where ${accessWhere("$1")} and ($2::text is null or p.category = $2) order by p.updated_at desc`,
    [actor.id, filter.category ?? null],
  );
  return { projects: rows };
}

export async function createProject(actor: Actor, input: unknown) {
  const b = parse(ProjectFields, input);
  await requireOrgMember(b.organization_id, actor.id);
  const project = await one(
    "insert into projects(owner_id, name, description, color, organization_id, category) values ($1,$2,$3,coalesce($4,'#5B5BD6'),$5,coalesce($6,'ux_research')) returning *",
    [actor.id, b.name, b.description ?? "", b.color ?? null, b.organization_id ?? null, b.category ?? null],
  );
  return { project };
}

/** One project with the person's role and sections. */
export async function getProject(actor: Actor, projectId: string) {
  return { project: await requireProject(projectId, actor.id) };
}

/** Name, description, color and category: editors. Archiving, unarchiving or moving it to another space: the owner only. */
export async function updateProject(actor: Actor, projectId: string, input: unknown) {
  const b = parse(ProjectPatch, input);
  const moves = b.organization_id !== undefined;
  const cur = await requireProject(projectId, actor.id, b.archived === undefined && !moves ? "editor" : "owner");
  if (moves && cur.owner_id !== actor.id) throw new HttpError(403, "Solo quien es dueño del proyecto puede moverlo de espacio");
  if (moves) await requireOrgMember(b.organization_id, actor.id);
  const project = await one(
    `update projects set
       name = coalesce($2, name), description = coalesce($3, description),
       color = coalesce($4, color), archived = coalesce($5, archived),
       organization_id = case when $6::boolean then $7 else organization_id end,
       category = coalesce($8, category), updated_at = now()
     where id = $1 returning *`,
    [projectId, b.name ?? null, b.description ?? null, b.color ?? null, b.archived ?? null, moves, b.organization_id ?? null, b.category ?? null],
  );
  return { project };
}

/** Owners only. The project's files go with it, bytes included. */
export async function deleteProject(actor: Actor, projectId: string) {
  await requireProject(projectId, actor.id, "owner");
  const kept = await query<{ stored: string }>("select stored from project_files where project_id = $1", [projectId]);
  await query("delete from projects where id = $1", [projectId]);
  await removeStored(kept.map((f) => f.stored));
  return { ok: true };
}

export async function listProjectStudies(actor: Actor, projectId: string) {
  await requireProject(projectId, actor.id, "viewer", "research");
  const rows = await query(
    `select s.id, s.title, s.method, s.status, s.public_slug, s.created_at, s.updated_at, s.published_at,
       jsonb_array_length(s.blocks) as block_count,
       (select count(*)::int from sessions se where se.study_id = s.id and se.completed_at is not null) as response_count,
       (select count(*)::int from sessions se where se.study_id = s.id) as started_count
     from studies s where s.project_id = $1 order by s.updated_at desc`,
    [projectId],
  );
  return { studies: rows };
}

/** The project's insights, newest first, with the study each came from and the tickets linked to it. */
export async function listProjectInsights(actor: Actor, projectId: string) {
  await requireProject(projectId, actor.id, "viewer", "research");
  const rows = await query(
    `select i.*, s.title as study_title,
       coalesce((select array_agg(t.number order by t.number) from ticket_links k join tickets t on t.id = k.ticket_id
                 where k.target_type = 'insight' and k.target_id = i.id), '{}') as ticket_numbers
     from insights i left join studies s on s.id = i.study_id
     where i.project_id = $1 order by i.created_at desc`,
    [projectId],
  );
  return { insights: rows };
}
