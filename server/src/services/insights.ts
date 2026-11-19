/** Insights: recording one, editing it or marking it reviewed, and deleting it. */
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { projectIn } from "../lib/access.js";
import { patchOf } from "../lib/schemas.js";
import type { Actor } from "./actor.js";

const requireProject = projectIn("research");

export const InsightFields = z.object({
  title: z.string().trim().min(1).max(300),
  body: z.string().max(20000).default(""),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  evidence: z.array(z.unknown()).default([]),
});
export const InsightCreate = InsightFields.extend({ project_id: z.string().uuid(), study_id: z.string().uuid().nullable().optional() });
/** patchOf, not .partial(): .partial() keeps the defaults, so { reviewed: true } would wipe body, tags and evidence. */
export const InsightPatch = patchOf(InsightFields).extend({ reviewed: z.boolean().optional() });

export async function createInsight(actor: Actor, input: unknown) {
  const b = parse(InsightCreate, input);
  await requireProject(b.project_id, actor.id, "editor");
  if (b.study_id && !(await one("select 1 from studies where id = $1 and project_id = $2", [b.study_id, b.project_id])))
    throw new HttpError(400, "El estudio no pertenece a este proyecto");
  const insight = await one(
    `insert into insights(project_id, study_id, created_by, title, body, tags, severity, confidence, evidence)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [b.project_id, b.study_id ?? null, actor.id, b.title, b.body, b.tags, b.severity, b.confidence, JSON.stringify(b.evidence)],
  );
  return { insight };
}

/** Editors of the insight's project. */
async function insightFor(actor: Actor, id: string) {
  const i = await one("select * from insights where id = $1", [id]);
  if (!i) throw notFound("Insight");
  await requireProject(i.project_id, actor.id, "editor");
  return i;
}

export async function updateInsight(actor: Actor, insightId: string, input: unknown) {
  await insightFor(actor, insightId);
  const b = parse(InsightPatch, input);
  if (b.reviewed === true) await query("update insights set reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, $2) where id = $1", [insightId, actor.id]);
  if (b.reviewed === false) await query("update insights set reviewed_at = null, reviewed_by = null where id = $1", [insightId]);
  const insight = await one(
    `update insights set title = coalesce($2,title), body = coalesce($3,body), tags = coalesce($4,tags),
       severity = coalesce($5,severity), confidence = coalesce($6,confidence), evidence = coalesce($7,evidence),
       updated_at = now() where id = $1 returning *`,
    [insightId, b.title ?? null, b.body ?? null, b.tags ?? null, b.severity ?? null, b.confidence ?? null, b.evidence ? JSON.stringify(b.evidence) : null],
  );
  return { insight };
}

/** Tickets linked to it keep working, just without the link. */
export async function deleteInsight(actor: Actor, insightId: string) {
  await insightFor(actor, insightId);
  await query("delete from ticket_links where target_type = 'insight' and target_id = $1", [insightId]);
  await query("delete from insights where id = $1", [insightId]);
  return { ok: true };
}
