import { Router } from "express";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { ownProject } from "./projects.js";

export const studies = Router();
studies.use(requireAuth);

export const slugId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 10);
const tokenId = customAlphabet("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 24);

const Block = z.object({ id: z.string().min(1), type: z.string().min(1) }).passthrough();

const StudyCreate = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  method: z.string().min(1).max(60),
  blocks: z.array(Block).default([]),
  settings: z.record(z.string(), z.unknown()).default({}),
});

const StudyUpdate = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  blocks: z.array(Block).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

async function ownStudy(id: string, userId: string) {
  const s = await one("select * from studies where id = $1 and owner_id = $2", [id, userId]);
  if (!s) throw notFound("Estudio");
  return s;
}

studies.post("/", async (req, res) => {
  const b = parse(StudyCreate, req.body);
  await ownProject(b.project_id, req.user!.id);
  const s = await one(
    `insert into studies(project_id, owner_id, title, method, blocks, settings, public_slug)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [b.project_id, req.user!.id, b.title, b.method, JSON.stringify(b.blocks), JSON.stringify(b.settings), slugId()],
  );
  await query("update projects set updated_at = now() where id = $1", [b.project_id]);
  res.status(201).json({ study: s });
});

studies.get("/:id", async (req, res) => {
  const s = await ownStudy(req.params.id, req.user!.id);
  const project = await one("select id, name, color from projects where id = $1", [s.project_id]);
  res.json({ study: s, project });
});

studies.patch("/:id", async (req, res) => {
  await ownStudy(req.params.id, req.user!.id);
  const b = parse(StudyUpdate, req.body);
  const s = await one(
    `update studies set title = coalesce($2, title), blocks = coalesce($3, blocks),
       settings = coalesce($4, settings), updated_at = now() where id = $1 returning *`,
    [req.params.id, b.title ?? null, b.blocks ? JSON.stringify(b.blocks) : null, b.settings ? JSON.stringify(b.settings) : null],
  );
  res.json({ study: s });
});

studies.post("/:id/status", async (req, res) => {
  const cur = await ownStudy(req.params.id, req.user!.id);
  const { status } = parse(z.object({ status: z.enum(["draft", "live", "closed"]) }), req.body);
  if (status === "live" && (cur.blocks as unknown[]).length === 0)
    throw new HttpError(400, "Agrega al menos un bloque antes de publicar");
  const s = await one(
    `update studies set status = $2, updated_at = now(),
       published_at = case when $2 = 'live' and published_at is null then now() else published_at end
     where id = $1 returning *`,
    [req.params.id, status],
  );
  res.json({ study: s });
});

studies.post("/:id/duplicate", async (req, res) => {
  const s = await ownStudy(req.params.id, req.user!.id);
  const copy = await one(
    `insert into studies(project_id, owner_id, title, method, blocks, settings, public_slug)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [s.project_id, req.user!.id, `${s.title} (copia)`, s.method, JSON.stringify(s.blocks), JSON.stringify(s.settings), slugId()],
  );
  res.status(201).json({ study: copy });
});

studies.delete("/:id", async (req, res) => {
  await ownStudy(req.params.id, req.user!.id);
  await query("delete from studies where id = $1", [req.params.id]);
  res.json({ ok: true });
});

studies.get("/:id/results", async (req, res) => {
  const s = await ownStudy(req.params.id, req.user!.id);
  const sessions = await query(
    "select id, participant, device, started_at, completed_at from sessions where study_id = $1 order by started_at desc",
    [s.id],
  );
  const answers = await query(
    "select session_id, block_id, value, duration_ms from answers where study_id = $1",
    [s.id],
  );
  const insights = await query("select * from insights where study_id = $1 order by created_at desc", [s.id]);
  res.json({ study: s, sessions, answers, insights });
});

studies.delete("/:id/sessions/:sid", async (req, res) => {
  await ownStudy(req.params.id, req.user!.id);
  await query("delete from sessions where id = $1 and study_id = $2", [req.params.sid, req.params.id]);
  res.json({ ok: true });
});

studies.get("/:id/shares", async (req, res) => {
  await ownStudy(req.params.id, req.user!.id);
  res.json({ shares: await query("select * from report_shares where study_id = $1 and revoked_at is null order by created_at desc", [req.params.id]) });
});

studies.post("/:id/shares", async (req, res) => {
  await ownStudy(req.params.id, req.user!.id);
  const share = await one("insert into report_shares(study_id, token) values ($1,$2) returning *", [req.params.id, tokenId()]);
  res.status(201).json({ share });
});

studies.delete("/:id/shares/:shareId", async (req, res) => {
  await ownStudy(req.params.id, req.user!.id);
  await query("update report_shares set revoked_at = now() where id = $1 and study_id = $2", [req.params.shareId, req.params.id]);
  res.json({ ok: true });
});
