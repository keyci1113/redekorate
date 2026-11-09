import { projectRole } from "../lib/access.js";
import { Router } from "express";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { readUser } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { sessionCreateLimiter } from "../lib/security.js";

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
  const { participant } = parse(z.object({
    participant: z.record(z.string().max(40), z.string().max(120)).refine((o) => Object.keys(o).length <= 10, "Demasiados parámetros").default({}),
  }), req.body ?? {});
  const session = await one(
    "insert into sessions(study_id, participant, device, study_version) values ($1,$2,$3,$4) returning id",
    [s.id, JSON.stringify(participant), device(String(req.headers["user-agent"] ?? "")), s.published_version],
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

publicApi.get("/reports/:token", async (req, res) => {
  const share = await one("select study_id from report_shares where token = $1 and revoked_at is null", [req.params.token]);
  if (!share) throw notFound("Reporte");
  const study = await one(
    `select s.id, s.title, s.method, s.status, s.blocks, s.settings, s.published_at, p.name as project_name, p.color as project_color
     from studies s join projects p on p.id = s.project_id where s.id = $1`,
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
  const share = await one(
    "select project_id, study_ids from report_shares where token = $1 and revoked_at is null and project_id is not null",
    [req.params.token],
  );
  if (!share) throw notFound("Reporte");
  const project = await one("select name, color from projects where id = $1", [share.project_id]);
  const studies = await query(
    `select id, title, method, status, blocks, settings, published_at from studies where id = any($1) order by array_position($1, id)`,
    [share.study_ids],
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
  res.json({ project, reports });
});

publicApi.get("/docs/:token", async (req, res) => {
  if (!/^[A-Za-z0-9]{24}$/.test(req.params.token)) throw notFound("Documento");
  const d = await one(
    `select d.title, d.kind, d.language, d.data, d.updated_at, p.name as project_name, p.color as project_color
     from documents d join projects p on p.id = d.project_id where d.share_token = $1`, [req.params.token]);
  if (!d) throw notFound("Documento");
  res.json({ document: d });
});
