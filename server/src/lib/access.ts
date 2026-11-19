// Project access. A person reaches a project as its owner (projects.owner_id), as a collaborator
// (project_members: editor, commenter or viewer) or through the project's organization
// (organization_members: owner and admin act as project owners; a member gets the role chosen for them,
// on every project or, with all_projects off, only on the projects they are a collaborator of).
// When several apply, the highest role wins and the sections add up.
// Sections ("areas") split a project in two: research (studies, documents, insights, participants, reports)
// and tickets (tickets, milestones, roadmap, feedback widget). Owners and organization admins have both.
// Every project, study, document, insight, participant and ticket route passes through here.
import { one } from "./db.js";
import { HttpError, notFound } from "./http.js";

export type ProjectRole = "owner" | "editor" | "commenter" | "viewer";
export type Area = "research" | "tickets";
export const AREAS: Area[] = ["research", "tickets"];
/** Lowest to highest. The index + 1 is the rank used in SQL. */
export const PROJECT_ROLES: ProjectRole[] = ["viewer", "commenter", "editor", "owner"];
const RANK: Record<ProjectRole, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

export const atLeast = (role: ProjectRole | null | undefined, min: ProjectRole) => !!role && RANK[role] >= RANK[min];

/** Rank (0 = no access) of the user in `$u` over the project aliased `p`, with the joins from `accessJoins`. */
const rankSql = (u: string) => `greatest(
  case when p.owner_id = ${u} then 4 else 0 end,
  case m.role when 'editor' then 3 when 'commenter' then 2 when 'viewer' then 1 else 0 end,
  case when om.role in ('owner','admin') then 4
       when om.role = 'member' and om.all_projects then (case om.project_role when 'editor' then 3 when 'commenter' then 2 else 1 end)
       else 0 end)`;
/** The sections the user in `$u` can open in the project aliased `p` (may repeat a value; empty without access). */
export const areasSql = (u: string) => `(case
  when p.owner_id = ${u} or om.role in ('owner','admin') then array['research','tickets']
  else coalesce(m.areas, '{}') || (case when om.role = 'member' and om.all_projects then om.areas else '{}' end) end)`;
/** SQL expression with the user's role name (null when there is no access). */
export const roleSql = (u: string) => `(array['viewer','commenter','editor','owner'])[${rankSql(u)}]`;
/** `from projects p` plus the user's project and organization memberships, ready for `roleSql` / `accessWhere`. */
export const accessJoins = (u: string) => `from projects p
  left join project_members m on m.project_id = p.id and m.user_id = ${u}
  left join organization_members om on om.organization_id = p.organization_id and om.user_id = ${u}
  left join organizations o on o.id = p.organization_id`;
/** The organization columns every project read carries (null for personal projects). */
export const ORG_COLS = "o.name as org_name, o.logo as org_logo, o.color as org_color";
/** Projects the user can open; with `area`, only those where that section is open to them. */
export const accessWhere = (u: string, area?: Area) => `${rankSql(u)} > 0${area ? ` and '${area}' = any(${areasSql(u)})` : ""}`;
/** CTE `acc` with the ids of every project the user in `$1` can open: `with ${accCte()} select … where project_id in (select id from acc)`. */
export const accCte = (area?: Area) => `acc as (select p.id ${accessJoins("$1")} where ${accessWhere("$1", area)})`;

/** The user's role in the project, or null without access. */
export async function projectRole(projectId: string, userId: string): Promise<ProjectRole | null> {
  const r = await one<{ role: ProjectRole }>(`select ${roleSql("$2")} as role ${accessJoins("$2")} where p.id = $1 and ${accessWhere("$2")}`, [projectId, userId]);
  return r?.role ?? null;
}

/** The project with the user's role. 404 without access (does not reveal it exists), 403 when the role is too low. */
export async function requireProject(projectId: string, userId: string, min: ProjectRole = "viewer", area?: Area) {
  const row = await one<Record<string, unknown> & { id: string; owner_id: string; organization_id: string | null; role: ProjectRole; areas: Area[] }>(
    `select p.*, ${roleSql("$2")} as role, ${areasSql("$2")} as areas, ${ORG_COLS} ${accessJoins("$2")} where p.id = $1 and ${accessWhere("$2")}`, [projectId, userId]);
  if (!row) throw notFound("Proyecto");
  row.areas = AREAS.filter((a) => row.areas.includes(a));
  if (area && !row.areas.includes(area)) throw new HttpError(403, "No tienes acceso a esta sección del proyecto");
  if (!atLeast(row.role, min)) {
    throw new HttpError(403, min === "owner" ? "Solo quien es dueño del proyecto puede hacer esto"
      : min === "editor" ? "Tu rol en este proyecto es de solo lectura"
      : "Tu rol en este proyecto no permite comentar");
  }
  return row;
}

/** `requireProject` for the routes of one section: the person also needs that section open in the project. */
export const projectIn = (area: Area) => (projectId: string, userId: string, min: ProjectRole = "viewer") => requireProject(projectId, userId, min, area);

/** The person's role and sections in a project, as the client receives them next to a study, document or ticket. */
export async function projectAccess(projectId: string, userId: string): Promise<{ role: ProjectRole; areas: Area[] } | null> {
  const r = await one<{ role: ProjectRole; areas: Area[] }>(`select ${roleSql("$2")} as role, ${areasSql("$2")} as areas ${accessJoins("$2")} where p.id = $1 and ${accessWhere("$2")}`, [projectId, userId]);
  return r ? { role: r.role, areas: AREAS.filter((a) => r.areas.includes(a)) } : null;
}
