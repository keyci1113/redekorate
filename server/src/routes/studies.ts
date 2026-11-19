import { translate } from "../lib/i18n.js";
import { Router } from "express";
import { unpackInner } from "../lib/recordings.js";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { ownProject } from "./projects.js";
import { ORG_COLS, projectRole, requireProject, type ProjectRole } from "../lib/access.js";
import { checkStudy, fromAssistant, refuse } from "../lib/contentCheck.js";
import { beforeReplace, filled, listVersions, restoreVersion } from "../lib/versions.js";

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
  base_updated_at: z.iso.datetime({ offset: true }).optional(),   // the updated_at the caller read: a newer edit is not overwritten (409)
});

/** Marca si el borrador difiere de lo publicado (solo tiene sentido en estudios live). */
const DIRTY_SQL = "(status = 'live' and (published_blocks is distinct from blocks or published_settings is distinct from settings)) as has_unpublished";
const withDirty = (id: string) => one(`select *, ${DIRTY_SQL} from studies where id = $1`, [id]);
/** Copia el borrador a la versión publicada. */
const snapshot = (id: string) => one(
  `update studies set published_blocks = blocks, published_settings = settings, published_version = published_version + 1, updated_at = now()
   where id = $1 returning *, false as has_unpublished`, [id]);

/** Registra que la persona abrió el estudio (builder o resultados); alimenta "Retoma donde lo dejaste". */
const noteOpen = (studyId: string, userId: string, where: "edit" | "results") => query(
  `insert into study_opens(user_id, study_id, where_) values ($1,$2,$3)
   on conflict (user_id, study_id) do update set opened_at = now(), where_ = excluded.where_`, [userId, studyId, where]);

/** Estudio de un proyecto al que el usuario tiene acceso con al menos `min`. */
async function ownStudy(id: string, userId: string, min: ProjectRole = "viewer") {
  const s = await one("select * from studies where id = $1", [id]);
  if (!s) throw notFound("Estudio");
  await requireProject(s.project_id, userId, min);
  return s;
}

studies.post("/", async (req, res) => {
  const b = parse(StudyCreate, req.body);
  if (fromAssistant(req)) refuse(checkStudy(b.blocks, b.settings));
  await ownProject(b.project_id, req.user!.id, "editor");
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
  const project = await one(`select p.id, p.name, p.color, p.organization_id, ${ORG_COLS} from projects p left join organizations o on o.id = p.organization_id where p.id = $1`, [s.project_id]);
  await noteOpen(s.id, req.user!.id, "edit");
  res.json({ study: await withDirty(s.id), project: { ...project, role: await projectRole(s.project_id, req.user!.id) } });
});

studies.patch("/:id", async (req, res) => {
  const cur = await ownStudy(req.params.id, req.user!.id, "editor");
  const b = parse(StudyUpdate, req.body);
  // AI apps: content the app can't use is refused, emptying is refused, and what they replace is saved as a version.
  const ai = fromAssistant(req);
  if (ai) refuse(checkStudy(b.blocks, b.settings));
  await beforeReplace("study", cur, req.user!.id, b, {
    replaces: b.blocks !== undefined || b.settings !== undefined, saveVersion: ai,
    emptied: ai && b.blocks?.length === 0 && filled(cur.blocks) ? "blocks" : null,
  });
  await query(
    `update studies set title = coalesce($2, title), blocks = coalesce($3, blocks),
       settings = coalesce($4, settings), updated_at = now() where id = $1`,
    [req.params.id, b.title ?? null, b.blocks ? JSON.stringify(b.blocks) : null, b.settings ? JSON.stringify(b.settings) : null],
  );
  // En un estudio live esto es el borrador: los participantes siguen viendo la versión publicada.
  res.json({ study: await withDirty(req.params.id) });
});

studies.post("/:id/status", async (req, res) => {
  const cur = await ownStudy(req.params.id, req.user!.id, "editor");
  const { status } = parse(z.object({ status: z.enum(["draft", "live", "closed"]) }), req.body);
  // Asking for the status it already has changes nothing: launching a live study again must not publish its draft.
  if (status === cur.status) return void res.json({ study: await withDirty(req.params.id) });
  if (status === "closed" && !cur.published_at) throw new HttpError(400, "Este estudio nunca se lanzó: no hay nada que cerrar");
  if (status === "live" && (cur.blocks as unknown[]).length === 0)
    throw new HttpError(400, "Agrega al menos un bloque antes de publicar");
  await query(
    `update studies set status = $2, updated_at = now(),
       published_at = case when $2 = 'live' and published_at is null then now() else published_at end
     where id = $1`,
    [req.params.id, status],
  );
  // Al publicar (o reabrir), lo que hay en el borrador pasa a ser la versión que ven los participantes.
  if (status === "live") await snapshot(req.params.id);
  res.json({ study: await withDirty(req.params.id) });
});

/** Publica los cambios del borrador en un estudio que ya está live. Quien está a medio flujo termina con su versión. */
studies.post("/:id/publish", async (req, res) => {
  const cur = await ownStudy(req.params.id, req.user!.id, "editor");
  if (cur.status !== "live") throw new HttpError(400, "Solo se publican cambios en un estudio que está recibiendo respuestas");
  if ((cur.blocks as unknown[]).length === 0) throw new HttpError(400, "Agrega al menos un bloque antes de publicar");
  // Nothing new in the draft: no new version (participants would see the same study under another number).
  const now = await withDirty(req.params.id);
  if (!now?.has_unpublished) return void res.json({ study: now });
  res.json({ study: await snapshot(req.params.id) });
});

/** Earlier versions of the draft that AI apps replaced, newest first. */
studies.get("/:id/versions", async (req, res) => {
  const s = await ownStudy(req.params.id, req.user!.id);
  res.json({ versions: await listVersions("study", s.id) });
});

studies.post("/:id/versions/:vid/restore", async (req, res) => {
  const s = await ownStudy(req.params.id, req.user!.id, "editor");
  res.json(await restoreVersion("study", s, req.params.vid, req.user!.id));
});

studies.post("/:id/duplicate", async (req, res) => {
  const s = await ownStudy(req.params.id, req.user!.id, "editor");
  const copy = await one(
    `insert into studies(project_id, owner_id, title, method, blocks, settings, public_slug)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [s.project_id, req.user!.id, `${s.title} (${translate("copia", req.get("x-lang"))})`, s.method, JSON.stringify(s.blocks), JSON.stringify(s.settings), slugId()],
  );
  res.status(201).json({ study: copy });
});

studies.delete("/:id", async (req, res) => {
  await ownStudy(req.params.id, req.user!.id, "editor");
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
  // Which sessions have a screen recording, and how long it is.
  const recordings = await query("select session_id, events, bytes, greatest(coalesce(last_ts - first_ts, 0), 0)::int as duration_ms from session_recordings where study_id = $1 and events > 0", [s.id]);
  await noteOpen(s.id, req.user!.id, "results");
  res.json({ study: s, sessions, answers, insights, recordings, role: await projectRole(s.project_id, req.user!.id) });
});

studies.delete("/:id/sessions/:sid", async (req, res) => {
  await ownStudy(req.params.id, req.user!.id, "editor");
  await query("delete from sessions where id = $1 and study_id = $2", [req.params.sid, req.params.id]);
  res.json({ ok: true });
});

// ── Session recordings ──────────────────────────────────────────
const UUID = /^[0-9a-f-]{36}$/i;
studies.get("/:id/recordings/:sid", async (req, res) => {
  const s = await ownStudy(req.params.id, req.user!.id);
  if (!UUID.test(req.params.sid)) throw notFound("Grabación");
  const chunks = await query<{ data: Buffer }>(
    "select c.data from session_recording_chunks c join session_recordings r on r.session_id = c.session_id where r.session_id = $1 and r.study_id = $2 order by c.seq", [req.params.sid, s.id]);
  if (!chunks.length) throw notFound("Grabación");
  // Chunks are already JSON: they are joined as text instead of being parsed and written again.
  res.type("application/json").send(`{"events":[${chunks.map((c) => unpackInner(c.data)).filter(Boolean).join(",")}]}`);
});

studies.delete("/:id/recordings/:sid", async (req, res) => {
  const s = await ownStudy(req.params.id, req.user!.id, "editor");
  if (!UUID.test(req.params.sid)) throw notFound("Grabación");
  await query("delete from session_recordings where session_id = $1 and study_id = $2", [req.params.sid, s.id]);
  res.json({ ok: true });
});

studies.get("/:id/shares", async (req, res) => {
  await ownStudy(req.params.id, req.user!.id);
  res.json({ shares: await query("select * from report_shares where study_id = $1 and revoked_at is null order by created_at desc", [req.params.id]) });
});

studies.post("/:id/shares", async (req, res) => {
  await ownStudy(req.params.id, req.user!.id, "editor");
  const share = await one("insert into report_shares(study_id, token) values ($1,$2) returning *", [req.params.id, tokenId()]);
  res.status(201).json({ share });
});

studies.delete("/:id/shares/:shareId", async (req, res) => {
  await ownStudy(req.params.id, req.user!.id, "editor");
  await query("update report_shares set revoked_at = now() where id = $1 and study_id = $2", [req.params.shareId, req.params.id]);
  res.json({ ok: true });
});
