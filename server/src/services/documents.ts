/**
 * Documents (research documents, diagrams, sitemaps, mood boards): listing, creating, reading, editing, earlier
 * versions, copies and deleting. Reading and editing go by the person's role on the document (their project role or
 * a share, whichever is higher). Sharing it (the public link and people by email) stays in routes/documents.ts.
 */
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { parse } from "../lib/http.js";
import { documentAccess, documentForTeam, projectIn, type ProjectRole } from "../lib/access.js";
import { checkDocument, refuse } from "../lib/contentCheck.js";
import { beforeReplace, filled, listVersions, restoreVersion } from "../lib/versions.js";
import type { Actor } from "./actor.js";

const requireProject = projectIn("research");
const Lang = z.enum(["es", "en"]);
const Data = z.record(z.string(), z.unknown());

export const DocumentCreate = z.object({ project_id: z.string().uuid(), kind: z.string().min(1).max(60), title: z.string().trim().min(1).max(200), language: Lang, data: Data.default({}) });
export const DocumentPatch = z.object({
  title: z.string().trim().min(1).max(200).optional(), language: Lang.optional(), data: Data.optional(),
  base_updated_at: z.iso.datetime({ offset: true }).optional(),   // the updated_at the caller read: a newer edit is not overwritten (409)
});
export const DocumentCopy = z.object({ project_id: z.string().uuid().optional(), title: z.string().trim().min(1).max(200).optional() });

type DocRow = Record<string, any> & { id: string; project_id: string };
export const documentFor = async (actor: Actor, id: string, min: ProjectRole = "viewer") => (await documentAccess(id, actor.id, min)).doc as DocRow;

export async function listDocuments(actor: Actor, projectId: string) {
  await requireProject(projectId, actor.id);
  const documents = await query(
    "select id, kind, title, language, share_token, created_at, updated_at from documents where project_id = $1 order by updated_at desc", [projectId]);
  return { documents };
}

/** Documents other people shared with me by email, with my role on each. Only the project's name travels, never the rest of it. */
export async function sharedWithMe(actor: Actor) {
  const documents = await query(
    `select d.id, d.kind, d.title, d.language, d.updated_at, s.role, s.created_at as shared_at,
            p.name as project_name, p.color as project_color, u.name as shared_by
     from document_shares s join documents d on d.id = s.document_id join projects p on p.id = d.project_id
     left join users u on u.id = s.added_by
     where s.user_id = $1 order by s.created_at desc`, [actor.id]);
  return { documents };
}

export async function createDocument(actor: Actor, input: unknown) {
  const b = parse(DocumentCreate, input);
  if (actor.outside) refuse(checkDocument(b.kind, b.data));
  await requireProject(b.project_id, actor.id, "editor");
  const document = await one(
    "insert into documents(project_id, owner_id, kind, title, language, data) values ($1,$2,$3,$4,$5,$6) returning *",
    [b.project_id, actor.id, b.kind, b.title, b.language, JSON.stringify(b.data)]);
  await query("update projects set updated_at = now() where id = $1", [b.project_id]);
  return { document };
}

/** `role` is what the person can do on this document; `project_role` is null when they only have it through a share. */
export async function getDocument(actor: Actor, documentId: string) {
  const a = await documentAccess(documentId, actor.id);
  const project = await one("select id, name, color from projects where id = $1", [a.doc.project_id]);
  return { document: a.doc, project: { ...project, role: a.role, project_role: a.projectRole } };
}

export async function updateDocument(actor: Actor, documentId: string, input: unknown) {
  const cur = await documentFor(actor, documentId, "editor");
  const b = parse(DocumentPatch, input);
  if (actor.outside) refuse(checkDocument(cur.kind, b.data));
  await beforeReplace("document", cur, actor.id, b, {
    replaces: b.data !== undefined, saveVersion: actor.outside,
    emptied: actor.outside && b.data !== undefined && !filled(b.data) && filled(cur.data) ? "data" : null,
  });
  const document = await one(
    `update documents set title = coalesce($2, title), language = coalesce($3, language), data = coalesce($4, data), updated_at = now()
     where id = $1 returning *`,
    [documentId, b.title ?? null, b.language ?? null, b.data ? JSON.stringify(b.data) : null]);
  return { document };
}

export async function listDocumentVersions(actor: Actor, documentId: string) {
  const d = await documentFor(actor, documentId);
  return { versions: await listVersions("document", d.id) };
}

export async function restoreDocumentVersion(actor: Actor, documentId: string, versionId: string) {
  const d = await documentFor(actor, documentId, "editor");
  return restoreVersion("document", d, versionId, actor.id);
}

/** Duplicate or "Save as…": a copy, optionally under another name and in another project the person edits. Project editors only. */
export async function duplicateDocument(actor: Actor, documentId: string, input: unknown = {}) {
  const { doc: d } = await documentForTeam(documentId, actor.id);
  const b = parse(DocumentCopy, input ?? {});
  const projectId = b.project_id ?? d.project_id;
  if (b.project_id) await requireProject(b.project_id, actor.id, "editor");
  const title = b.title ?? `${d.title} (${d.language === "en" ? "copy" : "copia"})`;
  const document = await one(
    "insert into documents(project_id, owner_id, kind, title, language, data) values ($1,$2,$3,$4,$5,$6) returning *",
    [projectId, actor.id, d.kind, title, d.language, JSON.stringify(d.data)]);
  await query("update projects set updated_at = now() where id = $1", [projectId]);
  return { document };
}

export async function deleteDocument(actor: Actor, documentId: string) {
  await documentForTeam(documentId, actor.id);
  await query("delete from documents where id = $1", [documentId]);
  return { ok: true };
}
