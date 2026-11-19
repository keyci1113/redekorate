import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { documentAccess, documentForTeam, projectIn, SHARE_ROLES, type ProjectRole } from "../lib/access.js";
import { sendMail } from "../lib/mail.js";
import { checkDocument, fromAssistant, refuse } from "../lib/contentCheck.js";
import { beforeReplace, filled, listVersions, restoreVersion } from "../lib/versions.js";

const requireProject = projectIn("research"), ownProject = requireProject;

export const documents = Router();
documents.use(requireAuth);
const tokenId = customAlphabet("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 24);
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

const Lang = z.enum(["es", "en"]);
const Data = z.record(z.string(), z.unknown());
const Email = z.string().trim().toLowerCase().email().max(254);
const ShareRole = z.enum(SHARE_ROLES as [string, ...string[]]);

/** Reading and editing go by the person's role on the document: their project role or a share, whichever is higher. */
const ownDoc = async (id: string, userId: string, min: ProjectRole = "viewer") => (await documentAccess(id, userId, min)).doc as Record<string, any> & { id: string; project_id: string };

documents.get("/", async (req, res) => {
  const { project_id } = parse(z.object({ project_id: z.string().uuid() }), req.query);
  await ownProject(project_id, req.user!.id);
  const rows = await query(
    "select id, kind, title, language, share_token, created_at, updated_at from documents where project_id = $1 order by updated_at desc",
    [project_id]);
  res.json({ documents: rows });
});

/** Documents other people shared with me by email, with my role on each. Only the project's name travels, never the rest of it. */
documents.get("/shared", async (req, res) => {
  const rows = await query(
    `select d.id, d.kind, d.title, d.language, d.updated_at, s.role, s.created_at as shared_at,
            p.name as project_name, p.color as project_color, u.name as shared_by
     from document_shares s join documents d on d.id = s.document_id join projects p on p.id = d.project_id
     left join users u on u.id = s.added_by
     where s.user_id = $1 order by s.created_at desc`, [req.user!.id]);
  res.json({ documents: rows });
});

documents.post("/", async (req, res) => {
  const b = parse(z.object({ project_id: z.string().uuid(), kind: z.string().min(1).max(60), title: z.string().trim().min(1).max(200), language: Lang, data: Data.default({}) }), req.body);
  if (fromAssistant(req)) refuse(checkDocument(b.kind, b.data));
  await ownProject(b.project_id, req.user!.id, "editor");
  const d = await one(
    "insert into documents(project_id, owner_id, kind, title, language, data) values ($1,$2,$3,$4,$5,$6) returning *",
    [b.project_id, req.user!.id, b.kind, b.title, b.language, JSON.stringify(b.data)]);
  await query("update projects set updated_at = now() where id = $1", [b.project_id]);
  res.status(201).json({ document: d });
});

documents.get("/:id", async (req, res) => {
  const a = await documentAccess(req.params.id, req.user!.id);
  const project = await one("select id, name, color from projects where id = $1", [a.doc.project_id]);
  // `role` is what the person can do on this document; `project_role` is null when they only have it through a share.
  res.json({ document: a.doc, project: { ...project, role: a.role, project_role: a.projectRole } });
});

documents.patch("/:id", async (req, res) => {
  const cur = await ownDoc(req.params.id, req.user!.id, "editor");
  const b = parse(z.object({
    title: z.string().trim().min(1).max(200).optional(), language: Lang.optional(), data: Data.optional(),
    base_updated_at: z.iso.datetime({ offset: true }).optional(),   // the updated_at the caller read: a newer edit is not overwritten (409)
  }), req.body);
  // AI apps: content the kind can't use is refused, emptying is refused, and what they replace is saved as a version.
  const ai = fromAssistant(req);
  if (ai) refuse(checkDocument(cur.kind, b.data));
  await beforeReplace("document", cur, req.user!.id, b, {
    replaces: b.data !== undefined, saveVersion: ai,
    emptied: ai && b.data !== undefined && !filled(b.data) && filled(cur.data) ? "data" : null,
  });
  const d = await one(
    `update documents set title = coalesce($2, title), language = coalesce($3, language), data = coalesce($4, data), updated_at = now()
     where id = $1 returning *`,
    [req.params.id, b.title ?? null, b.language ?? null, b.data ? JSON.stringify(b.data) : null]);
  res.json({ document: d });
});

/** Earlier versions of the content that AI apps replaced, newest first. */
documents.get("/:id/versions", async (req, res) => {
  const d = await ownDoc(req.params.id, req.user!.id);
  res.json({ versions: await listVersions("document", d.id) });
});

documents.post("/:id/versions/:vid/restore", async (req, res) => {
  const d = await ownDoc(req.params.id, req.user!.id, "editor");
  res.json(await restoreVersion("document", d, req.params.vid, req.user!.id));
});

// Duplicar o "Guardar como": copia el documento (opcionalmente con otro nombre y en otro proyecto propio)
documents.post("/:id/duplicate", async (req, res) => {
  const { doc: d } = await documentForTeam(req.params.id, req.user!.id);
  const b = parse(z.object({ project_id: z.string().uuid().optional(), title: z.string().trim().min(1).max(200).optional() }), req.body ?? {});
  const projectId = b.project_id ?? d.project_id;
  if (b.project_id) await ownProject(b.project_id, req.user!.id, "editor");
  const title = b.title ?? `${d.title} (${d.language === "en" ? "copy" : "copia"})`;
  const copy = await one(
    "insert into documents(project_id, owner_id, kind, title, language, data) values ($1,$2,$3,$4,$5,$6) returning *",
    [projectId, req.user!.id, d.kind, title, d.language, JSON.stringify(d.data)]);
  await query("update projects set updated_at = now() where id = $1", [projectId]);
  res.status(201).json({ document: copy });
});

documents.delete("/:id", async (req, res) => {
  await documentForTeam(req.params.id, req.user!.id);
  await query("delete from documents where id = $1", [req.params.id]);
  res.json({ ok: true });
});

documents.post("/:id/share", async (req, res) => {
  const { doc: d } = await documentForTeam(req.params.id, req.user!.id);
  const token = (d.share_token as string | null) ?? tokenId();
  await query("update documents set share_token = $2 where id = $1", [d.id, token]);
  res.json({ token });
});

documents.delete("/:id/share", async (req, res) => {
  await documentForTeam(req.params.id, req.user!.id);
  await query("update documents set share_token = null where id = $1", [req.params.id]);
  res.json({ ok: true });
});

// ── People: the document shared by email ────────────────────────
// Project editors and owners add people as viewer, commenter or editor of this document only.
// Someone with an account gets it at once (and an email); someone without one gets a 7-day invitation
// that creates the account and the share together.

const PEOPLE_SQL = `select s.user_id, s.role, s.created_at, u.name, u.email, u.avatar
  from document_shares s join users u on u.id = s.user_id where s.document_id = $1 order by s.created_at`;
const DOC_INVITES_SQL = `select id, email, doc_role as role, created_at, expires_at from invites
  where document_id = $1 and accepted_at is null and expires_at > now() order by created_at desc`;
const people = async (docId: string) => {
  const [list, invites] = await Promise.all([query(PEOPLE_SQL, [docId]), query(DOC_INVITES_SQL, [docId])]);
  return { people: list, invites };
};
const appUrl = (req: { protocol: string; get(h: string): string | undefined }) => process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`;
const ROLE_WORDS: Record<string, [string, string]> = { viewer: ["ver", "view"], commenter: ["comentar", "comment on"], editor: ["editar", "edit"] };

documents.get("/:id/people", async (req, res) => {
  await documentForTeam(req.params.id, req.user!.id);
  res.json(await people(req.params.id));
});

documents.post("/:id/people", async (req, res) => {
  const { doc } = await documentForTeam(req.params.id, req.user!.id);
  const b = parse(z.object({ email: Email, role: ShareRole }), req.body);
  const en = doc.language === "en";
  const [verbEs, verbEn] = ROLE_WORDS[b.role];
  const user = await one<{ id: string; disabled_at: string | null }>("select id, disabled_at from users where email = $1", [b.email]);
  if (user?.disabled_at) throw new HttpError(400, "Esa cuenta está desactivada");
  if (user?.id === req.user!.id) throw new HttpError(400, "Ya tienes acceso a este documento");
  const base = appUrl(req);
  if (user) {
    await query(
      `insert into document_shares(document_id, user_id, role, added_by) values ($1,$2,$3,$4)
       on conflict (document_id, user_id) do update set role = excluded.role`, [doc.id, user.id, b.role, req.user!.id]);
    const link = `${base}/docs/${doc.id}`;
    await sendMail(b.email, en ? `${req.user!.name} shared "${doc.title}" with you` : `${req.user!.name} compartió «${doc.title}» contigo`,
      en ? `Hi,\n\n${req.user!.name} shared the document "${doc.title}" with you on Redekorate. You can ${verbEn} it here:\n${link}\n\nYou'll also find it under Shared with me.`
        : `Hola,\n\n${req.user!.name} compartió contigo el documento «${doc.title}» en Redekorate. Puedes ${verbEs}lo aquí:\n${link}\n\nTambién lo encuentras en Compartidos conmigo.`);
    return res.status(201).json({ ...(await people(doc.id)), added: "user", mailed: !!process.env.SMTP_HOST });
  }
  // No account yet: a fresh invitation for this document replaces any earlier one for the same email.
  await query("update invites set expires_at = now() where email = $1 and document_id = $2 and accepted_at is null and expires_at > now()", [b.email, doc.id]);
  const token = crypto.randomBytes(32).toString("base64url");
  await query(
    `insert into invites(email, role, token_hash, invited_by, expires_at, document_id, doc_role) values ($1,'member',$2,$3, now() + interval '7 days', $4, $5)`,
    [b.email, sha256(token), req.user!.id, doc.id, b.role]);
  const link = `${base}/invite?token=${token}`;
  await sendMail(b.email, en ? `${req.user!.name} invited you to "${doc.title}"` : `${req.user!.name} te invitó a «${doc.title}»`,
    en ? `Hi,\n\n${req.user!.name} invited you to ${verbEn} the document "${doc.title}" on Redekorate. Create your account with this link (valid for 7 days):\n${link}\n\nIf you weren't expecting this, ignore this email.`
      : `Hola,\n\n${req.user!.name} te invitó a ${verbEs} el documento «${doc.title}» en Redekorate. Crea tu cuenta con este enlace (válido por 7 días):\n${link}\n\nSi no esperabas esta invitación, ignora este correo.`);
  res.status(201).json({ ...(await people(doc.id)), added: "invite", link, mailed: !!process.env.SMTP_HOST });
});

documents.patch("/:id/people/:userId", async (req, res) => {
  await documentForTeam(req.params.id, req.user!.id);
  const b = parse(z.object({ role: ShareRole }), req.body);
  const r = await one("update document_shares set role = $3 where document_id = $1 and user_id = $2 returning user_id", [req.params.id, req.params.userId, b.role]);
  if (!r) throw notFound("Persona");
  res.json(await people(req.params.id));
});

/** Project editors remove anyone; a person can also take themselves off a document shared with them. */
documents.delete("/:id/people/:userId", async (req, res) => {
  if (req.params.userId !== req.user!.id) await documentForTeam(req.params.id, req.user!.id);
  await query("delete from document_shares where document_id = $1 and user_id = $2", [req.params.id, req.params.userId]);
  res.json(req.params.userId === req.user!.id ? { ok: true } : await people(req.params.id));
});

documents.patch("/:id/invites/:inviteId", async (req, res) => {
  await documentForTeam(req.params.id, req.user!.id);
  const b = parse(z.object({ role: ShareRole }), req.body);
  await query("update invites set doc_role = $3 where id = $1 and document_id = $2 and accepted_at is null", [req.params.inviteId, req.params.id, b.role]);
  res.json(await people(req.params.id));
});

documents.delete("/:id/invites/:inviteId", async (req, res) => {
  await documentForTeam(req.params.id, req.user!.id);
  await query("update invites set expires_at = now() where id = $1 and document_id = $2 and accepted_at is null", [req.params.inviteId, req.params.id]);
  res.json(await people(req.params.id));
});
