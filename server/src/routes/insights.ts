import { Router } from "express";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { ownProject } from "./projects.js";

export const insights = Router();
insights.use(requireAuth);

const Fields = z.object({
  title: z.string().trim().min(1).max(300),
  body: z.string().max(20000).default(""),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  evidence: z.array(z.unknown()).default([]),
});

insights.post("/", async (req, res) => {
  const b = parse(Fields.extend({ project_id: z.string().uuid(), study_id: z.string().uuid().nullable().optional() }), req.body);
  await ownProject(b.project_id, req.user!.id);
  if (b.study_id) {
    const s = await one("select 1 from studies where id = $1 and project_id = $2", [b.study_id, b.project_id]);
    if (!s) throw new HttpError(400, "El estudio no pertenece a este proyecto");
  }
  const i = await one(
    `insert into insights(project_id, study_id, created_by, title, body, tags, severity, confidence, evidence)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [b.project_id, b.study_id ?? null, req.user!.id, b.title, b.body, b.tags, b.severity, b.confidence, JSON.stringify(b.evidence)],
  );
  res.status(201).json({ insight: i });
});

async function ownInsight(id: string, userId: string) {
  const i = await one("select i.* from insights i join projects p on p.id = i.project_id where i.id = $1 and p.owner_id = $2", [id, userId]);
  if (!i) throw notFound("Insight");
  return i;
}

insights.patch("/:id", async (req, res) => {
  await ownInsight(req.params.id, req.user!.id);
  const b = Fields.partial().parse(req.body);
  const i = await one(
    `update insights set title = coalesce($2,title), body = coalesce($3,body), tags = coalesce($4,tags),
       severity = coalesce($5,severity), confidence = coalesce($6,confidence), evidence = coalesce($7,evidence),
       updated_at = now() where id = $1 returning *`,
    [req.params.id, b.title ?? null, b.body ?? null, b.tags ?? null, b.severity ?? null, b.confidence ?? null,
     b.evidence ? JSON.stringify(b.evidence) : null],
  );
  res.json({ insight: i });
});

insights.delete("/:id", async (req, res) => {
  await ownInsight(req.params.id, req.user!.id);
  await query("delete from insights where id = $1", [req.params.id]);
  res.json({ ok: true });
});
