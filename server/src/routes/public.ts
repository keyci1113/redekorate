import { projectRole } from "../lib/access.js";
import { Router } from "express";
import { milestoneRows } from "../lib/milestones.js";
import { publicRoadmap } from "./roadmap.js";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { readUser } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { sessionCreateLimiter } from "../lib/security.js";
import { GRACE_MS, MAX_BYTES, MAX_CHUNKS, pack, recordingOn, span, validEvents } from "../lib/recordings.js";
import { pool } from "../lib/db.js";

const NO_ANSWER = new Set(["welcome", "context", "thank_you"]);
const device = (ua: string) => /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "mobile" : "desktop";

// Endpoints sin login: participantes y reportes compartidos.
export const publicApi = Router();

publicApi.get("/studies/:slug", async (req, res) => {
  const s = await one("select id, project_id, owner_id, title, method, status, blocks, settings, published_blocks, published_settings, published_version from studies where public_slug = $1", [req.params.slug]);
  if (!s) throw notFound("Estudio");
  const user = await readUser(req);
  const preview = req.query.preview === "1" && !!user && (await projectRole(s.project_id, user.id)) !== null;
  if (!preview && s.status !== "live")
    return res.json({ study: { title: s.title, status: s.status }, available: false });
  const { owner_id, project_id, published_blocks, published_settings, published_version, ...rest } = s;
  // La vista previa muestra el borrador; los participantes, la versión publicada.
  const study = preview ? rest : { ...rest, blocks: published_blocks ?? rest.blocks, settings: published_settings ?? rest.settings };
  res.json({ study, available: true, preview, version: published_version });
});

publicApi.post("/studies/:slug/sessions", sessionCreateLimiter, async (req, res) => {
  const s = await one("select id, status, published_version from studies where public_slug = $1", [req.params.slug]);
  if (!s || s.status !== "live") throw new HttpError(410, "Este estudio no está recibiendo respuestas");
  // Solo aceptamos parámetros cortos de la URL (p. ej. ?pid=123&source=email). Nunca guardamos IP.
  const { participant, elapsed_ms } = parse(z.object({
    participant: z.record(z.string().max(40), z.string().max(120)).refine((o) => Object.keys(o).length <= 10, "Demasiados parámetros").default({}),
    // The runner only creates the session when the participant leaves the first screen; this is how long that
    // screen was open, so started_at (and the study's median time) includes it. Capped at 3 hours.
    elapsed_ms: z.number().int().nonnegative().optional(),
  }), req.body ?? {});
  const session = await one(
    "insert into sessions(study_id, participant, device, study_version, started_at) values ($1,$2,$3,$4, now() - make_interval(secs => $5::double precision / 1000)) returning id",
    [s.id, JSON.stringify(participant), device(String(req.headers["user-agent"] ?? "")), s.published_version, Math.min(elapsed_ms ?? 0, 3 * 3600_000)],
  );
  res.status(201).json({ session_id: session!.id });
});

async function openSession(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Sesión");
  const se = await one(
    // Las respuestas se validan contra la versión publicada (la que el participante tiene cargada), no contra el borrador.
    "select se.id, se.study_id, se.completed_at, s.status, coalesce(s.published_blocks, s.blocks) as blocks from sessions se join studies s on s.id = se.study_id where se.id = $1",
    [id],
  );
  if (!se) throw notFound("Sesión");
  if (se.completed_at) throw new HttpError(409, "La sesión ya fue completada");
  if (se.status !== "live") throw new HttpError(410, "Este estudio ya no recibe respuestas");
  return se;
}

publicApi.put("/sessions/:id/answers/:blockId", async (req, res) => {
  const se = await openSession(req.params.id);
  const block = (se.blocks as { id: string; type: string }[]).find((x) => x.id === req.params.blockId);
  if (!block || NO_ANSWER.has(block.type)) throw new HttpError(400, "Bloque inválido");
  const b = parse(z.object({ value: z.unknown(), duration_ms: z.number().int().nonnegative().max(86_400_000).optional() }), req.body);
  if (JSON.stringify(b.value ?? null).length > 200_000) throw new HttpError(413, "Respuesta demasiado grande");
  await query(
    `insert into answers(session_id, study_id, block_id, value, duration_ms) values ($1,$2,$3,$4,$5)
     on conflict (session_id, block_id) do update set value = excluded.value, duration_ms = excluded.duration_ms`,
    [se.id, se.study_id, req.params.blockId, JSON.stringify(b.value ?? null), b.duration_ms ?? null],
  );
  res.json({ ok: true });
});

publicApi.post("/sessions/:id/complete", async (req, res) => {
  const se = await openSession(req.params.id);
  await query("update sessions set completed_at = now() where id = $1", [se.id]);
  res.json({ ok: true });
});

/**
 * A piece of the session's screen recording, sent every few seconds by the participant's browser.
 * Accepted only while the study records sessions and the session is still open (or just closed).
 * Sending the same piece twice changes nothing, so a retry is safe.
 */
publicApi.post("/sessions/:id/recording", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw notFound("Sesión");
  const se = await one<{ id: string; study_id: string; completed_at: Date | null; status: string; settings: unknown }>(
    "select se.id, se.study_id, se.completed_at, s.status, coalesce(s.published_settings, s.settings) as settings from sessions se join studies s on s.id = se.study_id where se.id = $1", [req.params.id]);
  if (!se) throw notFound("Sesión");
  if (se.status !== "live" || !recordingOn(se.settings)) throw new HttpError(403, "Este estudio no graba sesiones");
  if (se.completed_at && Date.now() - new Date(se.completed_at).getTime() > GRACE_MS) throw new HttpError(409, "La sesión ya fue completada");
  const b = parse(z.object({ seq: z.number().int().min(0).max(MAX_CHUNKS - 1), events: z.array(z.unknown()) }), req.body);
  if (!validEvents(b.events)) throw new HttpError(400, "Grabación inválida");
  const data = pack(b.events), { first, last } = span(b.events);
  const db = await pool.connect();
  try {
    await db.query("begin");
    const { rows: [rec] } = await db.query(
      "insert into session_recordings(session_id, study_id) values ($1,$2) on conflict (session_id) do update set updated_at = now() returning bytes", [se.id, se.study_id]);
    if (rec.bytes + data.length > MAX_BYTES) { await db.query("rollback"); throw new HttpError(413, "Grabación demasiado grande"); }
    const added = await db.query("insert into session_recording_chunks(session_id, seq, data) values ($1,$2,$3) on conflict do nothing", [se.id, b.seq, data]);
    if (added.rowCount) await db.query(
      "update session_recordings set events = events + $2, bytes = bytes + $3, first_ts = least(coalesce(first_ts, $4), $4), last_ts = greatest(coalesce(last_ts, $5), $5) where session_id = $1",
      [se.id, b.events.length, data.length, Math.round(first), Math.round(last)]);
    await db.query("commit");
  } catch (e) { await db.query("rollback").catch(() => {}); throw e; } finally { db.release(); }
  res.json({ ok: true });
});

publicApi.get("/reports/:token", async (req, res) => {
  const share = await one("select study_id from report_shares where token = $1 and revoked_at is null", [req.params.token]);
  if (!share) throw notFound("Reporte");
  const study = await one(
    `select s.id, s.title, s.method, s.status, s.blocks, s.settings, s.published_at, p.name as project_name, p.color as project_color,
       o.name as org_name, o.logo as org_logo
     from studies s join projects p on p.id = s.project_id left join organizations o on o.id = p.organization_id where s.id = $1`,
    [share.study_id],
  );
  // Nunca exponemos los datos personales del participante en un reporte público.
  const sessions = await query("select id, started_at, completed_at from sessions where study_id = $1", [share.study_id]);
  const answers = await query("select session_id, block_id, value, duration_ms from answers where study_id = $1", [share.study_id]);
  const insights = await query(
    "select id, title, body, tags, severity, confidence, created_at from insights where study_id = $1 order by created_at desc",
    [share.study_id],
  );
  res.json({ study, sessions, answers, insights });
});

publicApi.get("/project-reports/:token", async (req, res) => {
  const share = await one<{ project_id: string; study_ids: string[]; document_ids: string[]; sections: string[] }>(
    "select project_id, study_ids, document_ids, sections from report_shares where token = $1 and revoked_at is null and project_id is not null",
    [req.params.token],
  );
  if (!share) throw notFound("Reporte");
  const has = (x: string) => share.sections.includes(x);
  const project = await one(
    "select p.name, p.color, p.description, o.name as org_name, o.logo as org_logo from projects p left join organizations o on o.id = p.organization_id where p.id = $1", [share.project_id]);
  // The description only travels when the report includes the overview.
  if (project && !has("overview")) project.description = null;
  const studies = await query(
    `select id, title, method, status, blocks, settings, published_at from studies where id = any($1) and project_id = $2 order by array_position($1, id)`,
    [share.study_ids, share.project_id],
  );
  const reports = await Promise.all(studies.map(async (s: { id: string; [k: string]: unknown }) => {
    const sessions = await query("select id, started_at, completed_at from sessions where study_id = $1", [s.id]);
    const answers = await query("select session_id, block_id, value, duration_ms from answers where study_id = $1", [s.id]);
    const insights = await query(
      "select id, title, body, tags, severity, confidence, created_at from insights where study_id = $1 order by created_at desc",
      [s.id],
    );
    return { study: s, sessions, answers, insights };
  }));
  // Documents and diagrams in the order they were picked; a document deleted since simply drops out.
  const documents = share.document_ids.length ? await query(
    `select id, kind, title, language, data, updated_at from documents where id = any($1) and project_id = $2 order by array_position($1, id)`,
    [share.document_ids, share.project_id]) : [];
  const insights = has("insights") ? await query(
    `select i.id, i.title, i.body, i.tags, i.severity, i.confidence, i.created_at, s.title as study_title
     from insights i left join studies s on s.id = i.study_id where i.project_id = $1 order by i.created_at desc`, [share.project_id]) : null;
  const milestones = has("milestones") ? (await milestoneRows("m.project_id = $1", [share.project_id])).map((m) => ({
    id: m.id, name: m.name, begin_date: m.begin_date, end_date: m.end_date, state: m.state, progress: m.progress, total: m.total, done: m.done,
  })) : null;
  res.json({ project, sections: share.sections, reports, documents, insights, milestones });
});

// Read-only roadmap of a project, for whoever has its link.
publicApi.get("/roadmap/:token", async (req, res) => {
  res.json(await publicRoadmap(req.params.token));
});

publicApi.get("/docs/:token", async (req, res) => {
  if (!/^[A-Za-z0-9]{24}$/.test(req.params.token)) throw notFound("Documento");
  const d = await one(
    `select d.title, d.kind, d.language, d.data, d.updated_at, p.name as project_name, p.color as project_color
     from documents d join projects p on p.id = d.project_id where d.share_token = $1`, [req.params.token]);
  if (!d) throw notFound("Documento");
  res.json({ document: d });
});
