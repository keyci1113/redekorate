import { Router } from "express";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";

export const projects = Router();
projects.use(requireAuth);

const tokenId = customAlphabet("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 24);

const ProjectInput = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(4000).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  archived: z.boolean().optional(),
});

export async function ownProject(id: string, userId: string) {
  const p = await one("select * from projects where id = $1 and owner_id = $2", [id, userId]);
  if (!p) throw notFound("Proyecto");
  return p;
}

projects.get("/", async (req, res) => {
  const rows = await query(
    `select p.*,
       (select count(*)::int from studies s where s.project_id = p.id) as study_count,
       (select count(*)::int from studies s where s.project_id = p.id and s.status = 'live') as live_count,
       (select count(*)::int from sessions se join studies s on s.id = se.study_id
          where s.project_id = p.id and se.completed_at is not null) as response_count,
       (select count(*)::int from insights i where i.project_id = p.id) as insight_count,
       (select count(*)::int from documents d where d.project_id = p.id) as document_count
     from projects p where p.owner_id = $1 order by p.updated_at desc`,
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
  await ownProject(req.params.id, req.user!.id);
  const b = parse(ProjectInput.partial(), req.body);
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
  await ownProject(req.params.id, req.user!.id);
  await query("delete from projects where id = $1", [req.params.id]);
  res.json({ ok: true });
});

projects.get("/:id/studies", async (req, res) => {
  await ownProject(req.params.id, req.user!.id);
  const rows = await query(
    `select s.id, s.title, s.method, s.status, s.public_slug, s.created_at, s.updated_at, s.published_at,
       jsonb_array_length(s.blocks) as block_count,
       (select count(*)::int from sessions se where se.study_id = s.id and se.completed_at is not null) as response_count
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
  await ownProject(req.params.id, req.user!.id);
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
  await ownProject(req.params.id, req.user!.id);
  await query("update report_shares set revoked_at = now() where id = $1 and project_id = $2", [req.params.shareId, req.params.id]);
  res.json({ ok: true });
});
