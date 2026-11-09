// Acceso por proyecto: el dueño (projects.owner_id) y los colaboradores (project_members) con rol
// editor o viewer. Todas las rutas de proyecto, estudio, documento, insight y participante pasan por aquí.
import { one } from "./db.js";
import { HttpError, notFound } from "./http.js";

export type ProjectRole = "owner" | "editor" | "viewer";
const RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, owner: 3 };

export const atLeast = (role: ProjectRole | null | undefined, min: ProjectRole) => !!role && RANK[role] >= RANK[min];

const ROLE_SQL = `case when p.owner_id = $2 then 'owner' else m.role end as role`;
const JOIN_SQL = `from projects p left join project_members m on m.project_id = p.id and m.user_id = $2
                  where p.id = $1 and (p.owner_id = $2 or m.user_id is not null)`;

/** Rol del usuario en el proyecto, o null si no tiene acceso. */
export async function projectRole(projectId: string, userId: string): Promise<ProjectRole | null> {
  const r = await one<{ role: ProjectRole }>(`select ${ROLE_SQL} ${JOIN_SQL}`, [projectId, userId]);
  return r?.role ?? null;
}

/** El proyecto con el rol del usuario. 404 si no tiene acceso (no revela que existe), 403 si el rol no alcanza. */
export async function requireProject(projectId: string, userId: string, min: ProjectRole = "viewer") {
  const row = await one<Record<string, unknown> & { id: string; role: ProjectRole }>(`select p.*, ${ROLE_SQL} ${JOIN_SQL}`, [projectId, userId]);
  if (!row) throw notFound("Proyecto");
  if (!atLeast(row.role, min)) throw new HttpError(403, min === "owner" ? "Solo quien es dueño del proyecto puede hacer esto" : "Tu rol en este proyecto es de solo lectura");
  return row;
}
