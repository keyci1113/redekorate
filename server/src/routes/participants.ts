import { Router } from "express";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { ownProject } from "./projects.js";

export const participants = Router();
participants.use(requireAuth);

const Fields = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(60).default(""),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  notes: z.string().max(20000).default(""),
  consent: z.boolean().default(false),
});

async function ownParticipant(id: string, userId: string) {
  const p = await one("select * from participants where id = $1 and owner_id = $2", [id, userId]);
  if (!p) throw notFound("Participante");
  return p;
}

async function withStudies(rows: Record<string, unknown>[]) {
  if (!rows.length) return rows;
  const links = await query(
    `select ps.participant_id, ps.study_id, ps.status, ps.note, s.title as study_title
     from participant_studies ps join studies s on s.id = ps.study_id
     where ps.participant_id = any($1) order by ps.created_at desc`,
    [rows.map((r) => r.id)],
  );
  return rows.map((p) => ({ ...p, studies: links.filter((l) => l.participant_id === p.id) }));
}

participants.get("/", async (req, res) => {
  const { project_id } = parse(z.object({ project_id: z.string().uuid() }), req.query);
  await ownProject(project_id, req.user!.id);
  const rows = await query("select * from participants where project_id = $1 order by created_at desc", [project_id]);
  res.json({ participants: await withStudies(rows) });
});

participants.post("/", async (req, res) => {
  const b = parse(Fields.extend({ project_id: z.string().uuid() }), req.body);
  await ownProject(b.project_id, req.user!.id);
  const p = await one(
    `insert into participants(project_id, owner_id, name, email, phone, tags, notes, consent, consent_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [b.project_id, req.user!.id, b.name, b.email, b.phone, b.tags, b.notes, b.consent, b.consent ? new Date() : null],
  );
  res.status(201).json({ participant: { ...p, studies: [] } });
});

participants.patch("/:id", async (req, res) => {
  const before = await ownParticipant(req.params.id, req.user!.id);
  const b = Fields.partial().parse(req.body);
  const touchConsentAt = b.consent !== undefined;
  const consentAt = b.consent ? (before.consent ? before.consent_at : new Date()) : null;
  const p = await one(
    `update participants set name = coalesce($2,name), email = coalesce($3,email), phone = coalesce($4,phone),
       tags = coalesce($5,tags), notes = coalesce($6,notes), consent = coalesce($7,consent),
       consent_at = case when $9 then $8 else consent_at end, updated_at = now()
     where id = $1 returning *`,
    [req.params.id, b.name ?? null, b.email ?? null, b.phone ?? null, b.tags ?? null, b.notes ?? null,
     b.consent ?? null, consentAt, touchConsentAt],
  );
  res.json({ participant: (await withStudies([p!]))[0] });
});

participants.delete("/:id", async (req, res) => {
  await ownParticipant(req.params.id, req.user!.id);
  await query("delete from participants where id = $1", [req.params.id]);
  res.json({ ok: true });
});

const Link = z.object({ study_id: z.string().uuid(), status: z.enum(["invited", "completed", "no_show", "declined"]).default("invited"), note: z.string().max(2000).default("") });

participants.post("/:id/studies", async (req, res) => {
  const p = await ownParticipant(req.params.id, req.user!.id);
  const b = parse(Link, req.body);
  const s = await one("select 1 from studies where id = $1 and project_id = $2", [b.study_id, p.project_id]);
  if (!s) throw new HttpError(400, "El estudio no pertenece a este proyecto");
  await query(
    `insert into participant_studies(participant_id, study_id, status, note) values ($1,$2,$3,$4)
     on conflict (participant_id, study_id) do update set status = excluded.status, note = excluded.note`,
    [req.params.id, b.study_id, b.status, b.note],
  );
  res.status(201).json({ participant: (await withStudies([p]))[0] });
});

participants.delete("/:id/studies/:studyId", async (req, res) => {
  const p = await ownParticipant(req.params.id, req.user!.id);
  await query("delete from participant_studies where participant_id = $1 and study_id = $2", [req.params.id, req.params.studyId]);
  res.json({ participant: (await withStudies([p]))[0] });
});
