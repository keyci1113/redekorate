import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { documentForTeam, SHARE_ROLES } from "../lib/access.js";
import { sendMail } from "../lib/mail.js";
import * as svc from "../services/documents.js";
import { actorOf } from "../services/actor.js";

export const documents = Router();
documents.use(requireAuth);
const tokenId = customAlphabet("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 24);
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

const Email = z.string().trim().toLowerCase().email().max(254);
const ShareRole = z.enum(SHARE_ROLES as [string, ...string[]]);

// The document itself: services/documents.ts.
documents.get("/", async (req, res) => {
  const { project_id } = parse(z.object({ project_id: z.string().uuid() }), req.query);
  res.json(await svc.listDocuments(actorOf(req), project_id));
});
documents.get("/shared", async (req, res) => { res.json(await svc.sharedWithMe(actorOf(req))); });
documents.post("/", async (req, res) => { res.status(201).json(await svc.createDocument(actorOf(req), req.body)); });
documents.get("/:id", async (req, res) => { res.json(await svc.getDocument(actorOf(req), req.params.id)); });
documents.patch("/:id", async (req, res) => { res.json(await svc.updateDocument(actorOf(req), req.params.id, req.body)); });
documents.get("/:id/versions", async (req, res) => { res.json(await svc.listDocumentVersions(actorOf(req), req.params.id)); });
documents.post("/:id/versions/:vid/restore", async (req, res) => { res.json(await svc.restoreDocumentVersion(actorOf(req), req.params.id, req.params.vid)); });
documents.post("/:id/duplicate", async (req, res) => { res.status(201).json(await svc.duplicateDocument(actorOf(req), req.params.id, req.body)); });
documents.delete("/:id", async (req, res) => { res.json(await svc.deleteDocument(actorOf(req), req.params.id)); });

// Sharing: the read-only public link, and people by email (web app only).
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
