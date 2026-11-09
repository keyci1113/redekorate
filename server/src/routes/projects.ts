import { Router } from "express";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { requireProject, type ProjectRole } from "../lib/access.js";

export const projects = Router();
projects.use(requireAuth);

const tokenId = customAlphabet("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 24);

const ProjectInput = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(4000).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  archived: z.boolean().optional(),
});

/** Proyecto accesible con al menos `min` (viewer < editor < owner). Lanza 404/403. */
export const ownProject = (id: string, userId: string, min: ProjectRole = "viewer") => requireProject(id, userId, min);

projects.get("/", async (req, res) => {
  const rows = await query(
    `select p.*, case when p.owner_id = $1 then 'owner' else m.role end as role, u.name as owner_name,
       (select count(*)::int from studies s where s.project_id = p.id) as study_count,
       (select count(*)::int from studies s where s.project_id = p.id and s.status = 'live') as live_count,
       (select count(*)::int from sessions se join studies s on s.id = se.study_id
          where s.project_id = p.id and se.completed_at is not null) as response_count,
       (select count(*)::int from sessions se join studies s on s.id = se.study_id where s.project_id = p.id) as started_count,
       (select count(*)::int from participants pa where pa.project_id = p.id) as participant_count,
       (select count(*)::int from report_shares rs where rs.project_id = p.id and rs.revoked_at is null) as share_count,
       (select count(*)::int from insights i where i.project_id = p.id) as insight_count,
       (select count(*)::int from documents d where d.project_id = p.id) as document_count
     from projects p
       left join project_members m on m.project_id = p.id and m.user_id = $1
       join users u on u.id = p.owner_id
     where p.owner_id = $1 or m.user_id is not null order by p.updated_at desc`,
    [req.user!.id],
  );
  res.json({ projects: rows });
});

projects.post("/", async (req, res) => {
  const b = parse(ProjectInput, req.body);
  const p = await one(
    "insert into projects(owner_id, name, description, color) values ($1,$2,$3,coalesce($4,'#5B5BD6')) returning *",
    [req.user!.id, b.name, b.description ?? "", b.color ?? null],
  );
  res.status(201).json({ project: p });
});

projects.get("/:id", async (req, res) => {
  res.json({ project: await ownProject(req.params.id, req.user!.id) });
});

projects.patch("/:id", async (req, res) => {
  const b = parse(ProjectInput.partial(), req.body);
  // Editar nombre, descripción y color: editor. Archivar o desarchivar: solo el dueño.
  await ownProject(req.params.id, req.user!.id, b.archived === undefined ? "editor" : "owner");
  const p = await one(
    `update projects set
       name = coalesce($2, name), description = coalesce($3, description),
       color = coalesce($4, color), archived = coalesce($5, archived), updated_at = now()
     where id = $1 returning *`,
    [req.params.id, b.name ?? null, b.description ?? null, b.color ?? null, b.archived ?? null],
  );
  res.json({ project: p });
});

projects.delete("/:id", async (req, res) => {
  await ownProject(req.params.id, req.user!.id, "owner");
  await query("delete from projects where id = $1", [req.params.id]);
  res.json({ ok: true });
});

projects.get("/:id/studies", async (req, res) => {
  await ownProject(req.params.id, req.user!.id);
  const rows = await query(
    `select s.id, s.title, s.method, s.status, s.public_slug, s.created_at, s.updated_at, s.published_at,
       jsonb_array_length(s.blocks) as block_count,
       (select count(*)::int from sessions se where se.study_id = s.id and se.completed_at is not null) as response_count,
       (select count(*)::int from sessions se where se.study_id = s.id) as started_count
     from studies s where s.project_id = $1 order by s.updated_at desc`,
    [req.params.id],
  );
  res.json({ studies: rows });
});

projects.get("/:id/insights", async (req, res) => {
  await ownProject(req.params.id, req.user!.id);
  const rows = await query(
    `select i.*, s.title as study_title from insights i left join studies s on s.id = i.study_id
     where i.project_id = $1 order by i.created_at desc`,
    [req.params.id],
  );
  res.json({ insights: rows });
});

// Reporte de proyecto: un link que combina los resultados de los estudios que elijas.
projects.get("/:id/shares", async (req, res) => {
  await ownProject(req.params.id, req.user!.id);
  const rows = await query(
    `select rs.*, coalesce(
       (select jsonb_agg(s.title order by s.updated_at desc) from studies s where s.id = any(rs.study_ids)), '[]'::jsonb
     ) as study_titles
     from report_shares rs where rs.project_id = $1 and rs.revoked_at is null order by rs.created_at desc`,
    [req.params.id],
  );
  res.json({ shares: rows });
});

projects.post("/:id/shares", async (req, res) => {
  await ownProject(req.params.id, req.user!.id, "editor");
  const b = parse(z.object({ study_ids: z.array(z.string().uuid()).min(1).max(50) }), req.body);
  const owned = await query("select id from studies where project_id = $1 and id = any($2)", [req.params.id, b.study_ids]);
  if (owned.length !== b.study_ids.length) throw new HttpError(400, "Alguno de los estudios no pertenece a este proyecto");
  const share = await one(
    "insert into report_shares(project_id, study_ids, token) values ($1,$2,$3) returning *",
    [req.params.id, b.study_ids, tokenId()],
  );
  res.status(201).json({ share });
});

projects.delete("/:id/shares/:shareId", async (req, res) => {
  await ownProject(req.params.id, req.user!.id, "editor");
  await query("update report_shares set revoked_at = now() where id = $1 and project_id = $2", [req.params.shareId, req.params.id]);
  res.json({ ok: true });
});

// ── Colaboradores ───────────────────────────────────────────────
const MemberRole = z.enum(["editor", "viewer"]);
const MEMBERS_SQL = `
  select x.* from (
    select u.id as user_id, u.name, u.email, u.avatar, 'owner'::text as role, p.created_at from projects p join users u on u.id = p.owner_id where p.id = $1
    union all
    select u.id, u.name, u.email, u.avatar, m.role, m.created_at from project_members m join users u on u.id = m.user_id where m.project_id = $1
  ) x order by (x.role = 'owner') desc, x.created_at`;

projects.get("/:id/members", async (req, res) => {
  await ownProject(req.params.id, req.user!.id);
  res.json({ members: await query(MEMBERS_SQL, [req.params.id]) });
});

/** Agrega (o cambia el rol de) una persona que ya tiene cuenta. Solo el dueño. */
projects.post("/:id/members", async (req, res) => {
  const p = await ownProject(req.params.id, req.user!.id, "owner");
  const b = parse(z.object({ email: z.string().trim().toLowerCase().email().max(254), role: MemberRole }), req.body);
  const u = await one<{ id: string }>("select id from users where email = $1 and disabled_at is null", [b.email]);
  if (!u) throw new HttpError(404, "No hay una cuenta activa con ese correo. Pídele que se registre o invítala desde Usuarios.");
  if (u.id === p.owner_id) throw new HttpError(400, "Esa persona ya es dueña del proyecto");
  await query(
    `insert into project_members(project_id, user_id, role, added_by) values ($1,$2,$3,$4)
     on conflict (project_id, user_id) do update set role = excluded.role`,
    [req.params.id, u.id, b.role, req.user!.id]);
  res.status(201).json({ members: await query(MEMBERS_SQL, [req.params.id]) });
});

projects.patch("/:id/members/:userId", async (req, res) => {
  await ownProject(req.params.id, req.user!.id, "owner");
  const b = parse(z.object({ role: MemberRole }), req.body);
  await query("update project_members set role = $3 where project_id = $1 and user_id = $2", [req.params.id, req.params.userId, b.role]);
  res.json({ members: await query(MEMBERS_SQL, [req.params.id]) });
});

/** El dueño quita a cualquiera; una colaboradora puede salirse del proyecto. */
projects.delete("/:id/members/:userId", async (req, res) => {
  const p = await ownProject(req.params.id, req.user!.id);
  if (req.params.userId !== req.user!.id && p.role !== "owner") throw new HttpError(403, "Solo quien es dueño del proyecto puede hacer esto");
  await query("delete from project_members where project_id = $1 and user_id = $2", [req.params.id, req.params.userId]);
  res.json({ members: await query(MEMBERS_SQL, [req.params.id]) });
});
