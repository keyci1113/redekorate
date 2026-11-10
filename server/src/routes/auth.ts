import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { clearSession, readUser, requireAuth, signSession, type AuthUser, type Role } from "../lib/auth.js";
import { HttpError, parse } from "../lib/http.js";
import { authLimiter, passwordProblem, resetLimiter } from "../lib/security.js";
import { sendMail } from "../lib/mail.js";

export const auth = Router();

const COST = 12;
const MAX_FAILS = 8;          // intentos antes de bloquear temporalmente la cuenta
const LOCK_MINUTES = 15;
// Hash ficticio para que un correo inexistente tarde lo mismo que uno real (evita enumerar cuentas).
const DUMMY_HASH = bcrypt.hashSync("redekorate-dummy-password", COST);

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().max(200);
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function checkPassword(pw: string) {
  const p = passwordProblem(pw);
  if (p) throw new HttpError(400, p);
}

const inviteToken = z.string().min(20).max(200);
/** Invitación vigente para un token; la usan el registro con contraseña y el inicio con Google/Microsoft. */
export const pendingInvite = (token: string) => one<{ id: string; email: string; role: Role; invited_by: string | null; organization_id: string | null; org_role: "admin" | "member" | null; organization: string | null }>(
  `select i.id, i.email, i.role, u.name as invited_by, i.organization_id, i.org_role, o.name as organization
   from invites i left join users u on u.id = i.invited_by left join organizations o on o.id = i.organization_id
   where i.token_hash = $1 and i.accepted_at is null and i.expires_at > now()`, [sha256(token)]);

/** Datos públicos de una invitación, para prellenar el formulario. */
auth.get("/invite/:token", resetLimiter, async (req, res) => {
  const inv = await pendingInvite(parse(inviteToken, req.params.token));
  if (!inv) throw new HttpError(404, "La invitación no es válida o ya venció.");
  res.json({ invite: { email: inv.email, role: inv.role, invited_by: inv.invited_by, organization: inv.organization } });
});

auth.post("/register", authLimiter, async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(120), email, password, invite: inviteToken.optional() }), req.body);
  const anyUser = !!(await one("select 1 from users limit 1"));
  let role: Role = anyUser ? "member" : "admin";   // la primera cuenta administra la instancia
  let inviteId: string | null = null;
  let org: { id: string; role: "admin" | "member" } | null = null;   // an organization invite also joins the organization
  if (body.invite) {
    const inv = await pendingInvite(body.invite);
    if (!inv) throw new HttpError(400, "La invitación no es válida o ya venció.");
    if (inv.email !== body.email) throw new HttpError(400, "Usa el correo al que se envió la invitación.");
    role = inv.role; inviteId = inv.id;
    if (inv.organization_id) org = { id: inv.organization_id, role: inv.org_role ?? "member" };
  } else if (process.env.ALLOW_REGISTRATION === "false" && anyUser) {
    throw new HttpError(403, "El registro está cerrado. Pide acceso a la administradora.");
  }
  checkPassword(body.password);
  const exists = await one("select id from users where email = $1", [body.email]);
  if (exists) throw new HttpError(409, "Ya existe una cuenta con ese correo");
  const hash = await bcrypt.hash(body.password, COST);
  const user = await one<{ id: string; email: string; name: string; role: Role; avatar: string | null; onboarded_at: string | null }>(
    "insert into users(name, email, password_hash, role, last_login_at) values ($1,$2,$3,$4,now()) returning id, email, name, role, avatar, onboarded_at",
    [body.name, body.email, hash, role],
  );
  if (inviteId) await query("update invites set accepted_at = now() where id = $1", [inviteId]);
  if (org) await query("insert into organization_members(organization_id, user_id, role) values ($1,$2,$3) on conflict do nothing", [org.id, user!.id, org.role]);
  signSession(res, user!, 0);
  res.status(201).json({ user });
});

auth.post("/login", authLimiter, async (req, res) => {
  const body = parse(z.object({ email, password: password.min(1) }), req.body);
  const row = await one<{ id: string; email: string; name: string; role: Role; avatar: string | null; onboarded_at: string | null; password_hash: string | null; token_version: number; failed_logins: number; locked_until: string | null; disabled_at: string | null }>(
    "select id, email, name, role, avatar, onboarded_at, password_hash, token_version, failed_logins, locked_until, disabled_at from users where email = $1", [body.email]);
  // Una cuenta que solo entra con Google/Microsoft no tiene hash: se compara contra el ficticio y falla igual que un correo inexistente.
  const ok = (await bcrypt.compare(body.password, row?.password_hash ?? DUMMY_HASH)) && !!row?.password_hash;
  if (row?.locked_until && new Date(row.locked_until) > new Date())
    throw new HttpError(429, "Cuenta bloqueada temporalmente por varios intentos fallidos. Inténtalo en unos minutos.");
  if (!row || !ok) {
    if (row) {
      const fails = row.failed_logins + 1;
      const lock = fails >= MAX_FAILS;
      await query(
        `update users set failed_logins = $2, locked_until = case when $3 then now() + interval '${LOCK_MINUTES} minutes' else locked_until end where id = $1`,
        [row.id, lock ? 0 : fails, lock]);
    }
    throw new HttpError(401, "Correo o contraseña incorrectos");
  }
  if (row.disabled_at) throw new HttpError(403, "Esta cuenta está desactivada.");
  await query("update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1", [row.id]);
  const user = { id: row.id, email: row.email, name: row.name, role: row.role, avatar: row.avatar, onboarded_at: row.onboarded_at };
  signSession(res, user, row.token_version);
  res.json({ user });
});

auth.post("/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

auth.get("/me", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ user: await readUser(req) });
});

// ── Cuenta ──────────────────────────────────────────────────────
auth.patch("/me", requireAuth, async (req, res) => {
  // Nombre y/o foto. La foto debe ser un archivo subido a esta instancia (/uploads/…), nunca una URL externa.
  const b = parse(z.object({ name: z.string().trim().min(1).max(120).optional(), avatar: z.string().regex(/^\/uploads\/[a-z0-9]+\.(png|jpg|gif|webp)$/).nullable().optional() }), req.body);
  const user = await one(
    "update users set name = coalesce($2, name), avatar = case when $3::boolean then $4 else avatar end where id = $1 returning id, email, name, role, avatar, onboarded_at",
    [req.user!.id, b.name ?? null, b.avatar !== undefined, b.avatar ?? null]);
  const { token_version } = (await one<{ token_version: number }>("select token_version from users where id = $1", [req.user!.id]))!;
  signSession(res, user, token_version);
  res.json({ user });
});

/** The first-run wizard was finished or skipped: never show it again on any device. */
auth.post("/onboarded", requireAuth, async (req, res) => {
  const user = await one<AuthUser>("update users set onboarded_at = coalesce(onboarded_at, now()) where id = $1 returning id, email, name, role, avatar, onboarded_at", [req.user!.id]);
  const { token_version } = (await one<{ token_version: number }>("select token_version from users where id = $1", [req.user!.id]))!;
  signSession(res, user!, token_version);
  res.json({ user });
});

auth.post("/password", requireAuth, authLimiter, async (req, res) => {
  const b = parse(z.object({ current: password.optional(), next: password }), req.body);
  checkPassword(b.next);
  const row = (await one<{ password_hash: string | null }>("select password_hash from users where id = $1", [req.user!.id]))!;
  // Sin contraseña (cuenta creada con Google/Microsoft) se define la primera sin pedir la actual.
  if (row.password_hash && !(await bcrypt.compare(b.current ?? "", row.password_hash))) throw new HttpError(400, "La contraseña actual no es correcta");
  // Cambiar la contraseña cierra todas las demás sesiones.
  const u = await one<{ token_version: number }>(
    "update users set password_hash = $2, token_version = token_version + 1 where id = $1 returning token_version",
    [req.user!.id, await bcrypt.hash(b.next, COST)]);
  signSession(res, req.user!, u!.token_version);
  res.json({ ok: true });
});

auth.post("/logout-all", requireAuth, async (req, res) => {
  await query("update users set token_version = token_version + 1 where id = $1", [req.user!.id]);
  clearSession(res);
  res.json({ ok: true });
});

auth.delete("/me", requireAuth, authLimiter, async (req, res) => {
  const b = parse(z.object({ password: password.optional(), confirm: z.string().trim().toLowerCase().max(254).optional() }), req.body);
  const row = (await one<{ password_hash: string | null }>("select password_hash from users where id = $1", [req.user!.id]))!;
  if (row.password_hash) {
    if (!b.password || !(await bcrypt.compare(b.password, row.password_hash))) throw new HttpError(400, "Contraseña incorrecta");
  } else if (b.confirm !== req.user!.email) {
    // Sin contraseña, se confirma escribiendo el correo de la cuenta.
    throw new HttpError(400, "Escribe el correo de tu cuenta para confirmar");
  }
  await query("delete from users where id = $1", [req.user!.id]); // en cascada: proyectos, estudios, respuestas, archivos
  clearSession(res);
  res.json({ ok: true });
});

// ── Recuperación de contraseña ──────────────────────────────────
auth.post("/forgot", resetLimiter, async (req, res) => {
  const b = parse(z.object({ email }), req.body);
  const user = await one<{ id: string; name: string }>("select id, name from users where email = $1", [b.email]);
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    await query("update password_resets set used_at = now() where user_id = $1 and used_at is null", [user.id]);
    await query("insert into password_resets(user_id, token_hash, expires_at) values ($1,$2, now() + interval '1 hour')", [user.id, sha256(token)]);
    const base = process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`;
    await sendMail(b.email, "Restablece tu contraseña de Redekorate",
      `Hola ${user.name},\n\nPara crear una nueva contraseña abre este enlace (válido por 1 hora):\n${base}/reset?token=${token}\n\nSi no lo solicitaste, ignora este correo.`);
  }
  // Siempre la misma respuesta, exista o no la cuenta.
  res.json({ ok: true });
});

auth.post("/reset", resetLimiter, async (req, res) => {
  const b = parse(z.object({ token: z.string().min(20).max(200), password }), req.body);
  checkPassword(b.password);
  const r = await one<{ id: string; user_id: string }>(
    "select id, user_id from password_resets where token_hash = $1 and used_at is null and expires_at > now()", [sha256(b.token)]);
  if (!r) throw new HttpError(400, "El enlace no es válido o ya expiró. Solicita uno nuevo.");
  await query("update password_resets set used_at = now() where id = $1", [r.id]);
  await query("update users set password_hash = $2, token_version = token_version + 1, failed_logins = 0, locked_until = null where id = $1",
    [r.user_id, await bcrypt.hash(b.password, COST)]);
  res.json({ ok: true });
});
