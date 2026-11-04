import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { clearSession, readUser, requireAuth, signSession } from "../lib/auth.js";
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

auth.post("/register", authLimiter, async (req, res) => {
  if (process.env.ALLOW_REGISTRATION === "false") {
    const any = await one("select 1 from users limit 1");
    if (any) throw new HttpError(403, "El registro está cerrado. Pide acceso a la administradora.");
  }
  const body = parse(z.object({ name: z.string().trim().min(1).max(120), email, password }), req.body);
  checkPassword(body.password);
  const exists = await one("select id from users where email = $1", [body.email]);
  if (exists) throw new HttpError(409, "Ya existe una cuenta con ese correo");
  const hash = await bcrypt.hash(body.password, COST);
  const user = await one<{ id: string; email: string; name: string }>(
    "insert into users(name, email, password_hash, last_login_at) values ($1,$2,$3,now()) returning id, email, name",
    [body.name, body.email, hash],
  );
  signSession(res, user!, 0);
  res.status(201).json({ user });
});

auth.post("/login", authLimiter, async (req, res) => {
  const body = parse(z.object({ email, password: password.min(1) }), req.body);
  const row = await one<{ id: string; email: string; name: string; password_hash: string; token_version: number; failed_logins: number; locked_until: string | null }>(
    "select id, email, name, password_hash, token_version, failed_logins, locked_until from users where email = $1", [body.email]);
  const ok = await bcrypt.compare(body.password, row?.password_hash ?? DUMMY_HASH);
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
  await query("update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1", [row.id]);
  const user = { id: row.id, email: row.email, name: row.name };
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
  const b = parse(z.object({ name: z.string().trim().min(1).max(120) }), req.body);
  const user = await one("update users set name = $2 where id = $1 returning id, email, name", [req.user!.id, b.name]);
  const { token_version } = (await one<{ token_version: number }>("select token_version from users where id = $1", [req.user!.id]))!;
  signSession(res, user, token_version);
  res.json({ user });
});

auth.post("/password", requireAuth, authLimiter, async (req, res) => {
  const b = parse(z.object({ current: password.min(1), next: password }), req.body);
  checkPassword(b.next);
  const row = (await one<{ password_hash: string }>("select password_hash from users where id = $1", [req.user!.id]))!;
  if (!(await bcrypt.compare(b.current, row.password_hash))) throw new HttpError(400, "La contraseña actual no es correcta");
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
  const b = parse(z.object({ password: password.min(1) }), req.body);
  const row = (await one<{ password_hash: string }>("select password_hash from users where id = $1", [req.user!.id]))!;
  if (!(await bcrypt.compare(b.password, row.password_hash))) throw new HttpError(400, "Contraseña incorrecta");
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
