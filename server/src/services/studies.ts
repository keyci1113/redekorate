/**
 * Studies: the draft (blocks and settings), launching and closing, publishing a live study's changes, earlier
 * versions, copies, results and recordings. Report links for one study stay in routes/studies.ts (web app only).
 */
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { one, query } from "../lib/db.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { translate } from "../lib/i18n.js";
import { ORG_COLS, projectIn, projectRole, type ProjectRole } from "../lib/access.js";
import { checkStudy, refuse } from "../lib/contentCheck.js";
import { beforeReplace, filled, listVersions, restoreVersion } from "../lib/versions.js";
import { unpackInner } from "../lib/recordings.js";
import type { Actor } from "./actor.js";

const requireProject = projectIn("research");
export const slugId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 10);

const Block = z.object({ id: z.string().min(1), type: z.string().min(1) }).passthrough();
const Base = z.iso.datetime({ offset: true });

export const StudyCreate = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  method: z.string().min(1).max(60),
  blocks: z.array(Block).default([]),
  settings: z.record(z.string(), z.unknown()).default({}),
  ticket_number: z.number().int().positive().optional(),   // the study is created from this ticket of the project and linked to it
});
export const StudyPatch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  blocks: z.array(Block).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  base_updated_at: Base.optional(),   // the updated_at the caller read: a newer edit is not overwritten (409)
});
export const StudyStatus = z.object({ status: z.enum(["draft", "live", "closed"]) });

/** Whether the draft differs from what participants see (only meaningful on live studies). */
const DIRTY_SQL = "(status = 'live' and (published_blocks is distinct from blocks or published_settings is distinct from settings)) as has_unpublished";
const withDirty = (id: string) => one(`select *, ${DIRTY_SQL} from studies where id = $1`, [id]);
/** Copies the draft to the published version. */
const snapshot = (id: string) => one(
  `update studies set published_blocks = blocks, published_settings = settings, published_version = published_version + 1, updated_at = now()
   where id = $1 returning *, false as has_unpublished`, [id]);

/** Notes that the person opened the study (builder or results); it feeds "Pick up where you left off". */
const noteOpen = (studyId: string, userId: string, where: "edit" | "results") => query(
  `insert into study_opens(user_id, study_id, where_) values ($1,$2,$3)
   on conflict (user_id, study_id) do update set opened_at = now(), where_ = excluded.where_`, [userId, studyId, where]);

/** Tickets linked to a study (the ones it was created from, or linked by hand), for the study's own screens. */
const linkedTickets = (studyId: string) => query(
  `select t.number, t.title, t.status, t.type from ticket_links k join tickets t on t.id = k.ticket_id
   where k.target_type = 'study' and k.target_id = $1 order by t.number`, [studyId]);

/** A study in a project the person reaches with at least `min` and the research section open. */
export async function studyFor(actor: Actor, studyId: string, min: ProjectRole = "viewer") {
  const s = await one("select * from studies where id = $1", [studyId]);
  if (!s) throw notFound("Estudio");
  await requireProject(s.project_id, actor.id, min);
  return s as Record<string, any> & { id: string; project_id: string };
}

export async function createStudy(actor: Actor, input: unknown) {
  const b = parse(StudyCreate, input);
  if (actor.outside) refuse(checkStudy(b.blocks, b.settings));
  await requireProject(b.project_id, actor.id, "editor");
  // Checked before anything is created: a study must not be left behind when its ticket does not exist.
  const ticket = b.ticket_number ? await one<{ id: string }>("select id from tickets where project_id = $1 and number = $2", [b.project_id, b.ticket_number]) : null;
  if (b.ticket_number && !ticket) throw new HttpError(400, "Ese ticket no pertenece a este proyecto");
  const study = await one(
    `insert into studies(project_id, owner_id, title, method, blocks, settings, public_slug)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [b.project_id, actor.id, b.title, b.method, JSON.stringify(b.blocks), JSON.stringify(b.settings), slugId()],
  );
  if (ticket) {
    await query("insert into ticket_links(ticket_id, target_type, target_id, relation) values ($1,'study',$2,'study')", [ticket.id, study!.id]);
    await query("insert into ticket_activity(ticket_id, actor_id, action, to_value) values ($1,$2,'study_created',$3)", [ticket.id, actor.id, b.title]);
    await query("update tickets set updated_at = now() where id = $1", [ticket.id]);
  }
  await query("update projects set updated_at = now() where id = $1", [b.project_id]);
  return { study };
}

/** The draft with its project and linked tickets. `noteOpen` records the visit for the home page (the web app's builder). */
export async function getStudy(actor: Actor, studyId: string, opts: { noteOpen?: boolean } = {}) {
  const s = await studyFor(actor, studyId);
  const project = await one(`select p.id, p.name, p.color, p.organization_id, ${ORG_COLS} from projects p left join organizations o on o.id = p.organization_id where p.id = $1`, [s.project_id]);
  if (opts.noteOpen) await noteOpen(s.id, actor.id, "edit");
  return { study: await withDirty(s.id), project: { ...project, role: await projectRole(s.project_id, actor.id) }, tickets: await linkedTickets(s.id) };
}

/** Edits the draft. On a live study participants keep the published version until publishStudy. */
export async function updateStudy(actor: Actor, studyId: string, input: unknown) {
  const cur = await studyFor(actor, studyId, "editor");
  const b = parse(StudyPatch, input);
  if (actor.outside) refuse(checkStudy(b.blocks, b.settings));
  await beforeReplace("study", cur, actor.id, b, {
    replaces: b.blocks !== undefined || b.settings !== undefined, saveVersion: actor.outside,
    emptied: actor.outside && b.blocks?.length === 0 && filled(cur.blocks) ? "blocks" : null,
  });
  await query(
    `update studies set title = coalesce($2, title), blocks = coalesce($3, blocks),
       settings = coalesce($4, settings), updated_at = now() where id = $1`,
    [studyId, b.title ?? null, b.blocks ? JSON.stringify(b.blocks) : null, b.settings ? JSON.stringify(b.settings) : null],
  );
  return { study: await withDirty(studyId) };
}

/** live publishes the draft and opens the link; closed stops responses; draft takes the link offline. The status it already has changes nothing. */
export async function setStudyStatus(actor: Actor, studyId: string, input: unknown) {
  const cur = await studyFor(actor, studyId, "editor");
  const { status } = parse(StudyStatus, input);
  // Launching a live study again must not publish its draft.
  if (status === cur.status) return { study: await withDirty(studyId) };
  if (status === "closed" && !cur.published_at) throw new HttpError(400, "Este estudio nunca se lanzó: no hay nada que cerrar");
  if (status === "live" && (cur.blocks as unknown[]).length === 0) throw new HttpError(400, "Agrega al menos un bloque antes de publicar");
  await query(
    `update studies set status = $2, updated_at = now(),
       published_at = case when $2 = 'live' and published_at is null then now() else published_at end
     where id = $1`,
    [studyId, status],
  );
  // Launching (or reopening) makes the draft the version participants see.
  if (status === "live") await snapshot(studyId);
  return { study: await withDirty(studyId) };
}

/** Publishes a live study's draft. People halfway through finish with their version. Without changes nothing happens. */
export async function publishStudy(actor: Actor, studyId: string) {
  const cur = await studyFor(actor, studyId, "editor");
  if (cur.status !== "live") throw new HttpError(400, "Solo se publican cambios en un estudio que está recibiendo respuestas");
  if ((cur.blocks as unknown[]).length === 0) throw new HttpError(400, "Agrega al menos un bloque antes de publicar");
  const now = await withDirty(studyId);
  if (!now?.has_unpublished) return { study: now };
  return { study: await snapshot(studyId) };
}

export async function listStudyVersions(actor: Actor, studyId: string) {
  const s = await studyFor(actor, studyId);
  return { versions: await listVersions("study", s.id) };
}

export async function restoreStudyVersion(actor: Actor, studyId: string, versionId: string) {
  const s = await studyFor(actor, studyId, "editor");
  return restoreVersion("study", s, versionId, actor.id);
}

export async function duplicateStudy(actor: Actor, studyId: string) {
  const s = await studyFor(actor, studyId, "editor");
  const study = await one(
    `insert into studies(project_id, owner_id, title, method, blocks, settings, public_slug)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [s.project_id, actor.id, `${s.title} (${translate("copia", actor.lang)})`, s.method, JSON.stringify(s.blocks), JSON.stringify(s.settings), slugId()],
  );
  return { study };
}

/** Linked tickets keep working, just without the link. */
export async function deleteStudy(actor: Actor, studyId: string) {
  await studyFor(actor, studyId, "editor");
  await query("delete from ticket_links where target_type = 'study' and target_id = $1", [studyId]);
  await query("delete from studies where id = $1", [studyId]);
  return { ok: true };
}

/** Sessions (with the participant record), answers, insights and which sessions were recorded. */
export async function studyResults(actor: Actor, studyId: string, opts: { noteOpen?: boolean } = {}) {
  const s = await studyFor(actor, studyId);
  const [sessions, answers, insights, recordings] = await Promise.all([
    query("select id, participant, device, started_at, completed_at from sessions where study_id = $1 order by started_at desc", [s.id]),
    query("select session_id, block_id, value, duration_ms from answers where study_id = $1", [s.id]),
    query("select * from insights where study_id = $1 order by created_at desc", [s.id]),
    // Which sessions have a screen recording, and how long it is.
    query("select session_id, events, bytes, greatest(coalesce(last_ts - first_ts, 0), 0)::int as duration_ms from session_recordings where study_id = $1 and events > 0", [s.id]),
  ]);
  if (opts.noteOpen) await noteOpen(s.id, actor.id, "results");
  return { study: s, sessions, answers, insights, recordings, role: await projectRole(s.project_id, actor.id), tickets: await linkedTickets(s.id) };
}

export async function deleteSession(actor: Actor, studyId: string, sessionId: string) {
  await studyFor(actor, studyId, "editor");
  await query("delete from sessions where id = $1 and study_id = $2", [sessionId, studyId]);
  return { ok: true };
}

const UUID = /^[0-9a-f-]{36}$/i;
/** One session's recording as a JSON text `{"events":[…]}`: the stored chunks are already JSON, so they are joined, not parsed. */
export async function recordingJson(actor: Actor, studyId: string, sessionId: string) {
  const s = await studyFor(actor, studyId);
  if (!UUID.test(sessionId)) throw notFound("Grabación");
  const chunks = await query<{ data: Buffer }>(
    "select c.data from session_recording_chunks c join session_recordings r on r.session_id = c.session_id where r.session_id = $1 and r.study_id = $2 order by c.seq", [sessionId, s.id]);
  if (!chunks.length) throw notFound("Grabación");
  return `{"events":[${chunks.map((c) => unpackInner(c.data)).filter(Boolean).join(",")}]}`;
}

export async function deleteRecording(actor: Actor, studyId: string, sessionId: string) {
  const s = await studyFor(actor, studyId, "editor");
  if (!UUID.test(sessionId)) throw notFound("Grabación");
  await query("delete from session_recordings where session_id = $1 and study_id = $2", [sessionId, s.id]);
  return { ok: true };
}
