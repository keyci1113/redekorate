/**
 * Earlier versions of what outside callers (the REST API and AI apps through MCP) overwrite: a study's blocks and
 * settings, a document's content and a ticket's description. Each overwrite saves what was there first, so a bad write can be put back. The web app saves as people
 * type, so its own edits don't save versions.
 */
import { one, query } from "./db.js";
import { HttpError } from "./http.js";

export type Target = "study" | "document" | "ticket";
export const KEEP_VERSIONS = 30;
const COLUMN: Record<Target, string> = { study: "study_id", document: "document_id", ticket: "ticket_id" };

const contentOf = (target: Target, row: Record<string, any>) =>
  target === "study" ? { title: row.title, blocks: row.blocks, settings: row.settings }
  : target === "ticket" ? { title: row.title, description: row.description }
  : { title: row.title, language: row.language, data: row.data };
const summaryOf = (target: Target, c: Record<string, any>) =>
  target === "study" ? `${c.title} · ${(c.blocks ?? []).length} blocks`
  : target === "ticket" ? `${c.title} · ${String(c.description ?? "").length} characters of description`
  : `${c.title} · ${Object.keys(c.data ?? {}).length} sections filled`;

/** True when there is something in it: a non-empty list, text, or an object with something inside. */
export const filled = (v: unknown): boolean => Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : !!v && typeof v === "object" && Object.values(v).some(filled);

/** Saves what `row` holds now as a version, and keeps only the newest KEEP_VERSIONS. */
export async function saveVersion(target: Target, row: Record<string, any>, userId: string, reason: "overwrite" | "restore" = "overwrite") {
  const col = COLUMN[target];
  await query(`insert into content_versions(${col}, content, saved_by, reason) values ($1,$2,$3,$4)`, [row.id, JSON.stringify(contentOf(target, row)), userId, reason]);
  await query(
    `delete from content_versions where ${col} = $1 and id not in
       (select id from content_versions where ${col} = $1 order by created_at desc, id desc limit ${KEEP_VERSIONS})`, [row.id]);
}

/**
 * Before an edit that replaces content: refuses it when the item changed since the caller read it (409), or
 * when it would empty what is there; otherwise saves what is there as a version.
 */
export async function beforeReplace(target: Target, row: Record<string, any>, userId: string,
  b: { base_updated_at?: string }, opts: { replaces: boolean; emptied: string | null; saveVersion: boolean }) {
  if (b.base_updated_at && new Date(b.base_updated_at).getTime() !== new Date(row.updated_at).getTime())
    throw new HttpError(409, "Cambió desde que lo leíste. Léelo otra vez y vuelve a hacer tu cambio sobre la versión actual.", { updated_at: row.updated_at });
  if (opts.emptied) throw new HttpError(400, "Eso borraría el contenido que hay. Envía el contenido completo; para vaciarlo a propósito, hazlo en la app.", { field: opts.emptied });
  if (opts.replaces && opts.saveVersion) await saveVersion(target, row, userId);
}

/** An item's saved versions, newest first, with a short summary of each (not the content). */
export async function listVersions(target: Target, rowId: string) {
  const rows = await query(
    `select v.id, v.created_at, v.reason, u.name as saved_by, v.content from content_versions v left join users u on u.id = v.saved_by
     where v.${COLUMN[target]} = $1 order by v.created_at desc, v.id desc`, [rowId]);
  return rows.map(({ content: c, ...v }) => ({
    ...v,
    summary: summaryOf(target, c),
  }));
}

/** Puts a version back. What is there now is saved as a version first, so a restore can be undone too. */
export async function restoreVersion(target: Target, row: Record<string, any>, versionId: string, userId: string) {
  const v = await one<{ content: Record<string, any> }>(`select content from content_versions where id = $1 and ${COLUMN[target]} = $2`, [versionId, row.id]);
  if (!v) throw new HttpError(404, "Esa versión no existe");
  await saveVersion(target, row, userId, "restore");
  const c = v.content;
  if (target === "study") await query("update studies set title = $2, blocks = $3, settings = $4, updated_at = now() where id = $1", [row.id, c.title, JSON.stringify(c.blocks ?? []), JSON.stringify(c.settings ?? {})]);
  else if (target === "ticket") await query("update tickets set description = $2, updated_at = now() where id = $1", [row.id, c.description ?? ""]);   // the title stays: only descriptions are versioned
  else await query("update documents set title = $2, language = $3, data = $4, updated_at = now() where id = $1", [row.id, c.title, c.language, JSON.stringify(c.data ?? {})]);
  return { restored: versionId };
}
