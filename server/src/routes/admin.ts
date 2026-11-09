import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { requireAdmin, requireAuth, type Role } from "../lib/auth.js";
import { HttpError, parse } from "../lib/http.js";
import { sendMail } from "../lib/mail.js";

export const admin = Router();
admin.use(requireAuth, requireAdmin);

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const role = z.enum(["admin", "member"]);
const USER_COLS = "id, email, name, role, avatar, created_at, last_login_at, disabled_at";

admin.get("/users", async (_req, res) => {
  const users = await query(
    `select ${USER_COLS.split(", ").map((c) => `u.${c}`).join(", ")},
       (select count(*)::int from projects p where p.owner_id = u.id) as project_count
     from users u order by u.created_at`);
  res.json({ users });
});

/** Cambia rol y/o desactiva. Nunca sobre uno mismo, y siempre debe quedar al menos un admin activo. */
admin.patch("/users/:id", async (req, res) => {
  const b = parse(z.object({ role: role.optional(), disabled: z.boolean().optional() }), req.body);
  const target = await one<{ id: string; role: Role; disabled_at: string | null }>("select id, role, disabled_at from users where id = $1", [req.params.id]);
  if (!target) throw new HttpError(404, "Usuario no encontrado");
  const demotes = b.role === "member" && target.role === "admin";
  const disables = b.disabled === true && !target.disabled_at;
  if (target.id === req.user!.id && (demotes || disables)) throw new HttpError(400, "No puedes quitarte el rol de admin ni desactivar tu propia cuenta.");
  if ((demotes || disables) && target.role === "admin") {
    const others = await one<{ n: number }>("select count(*)::int as n from users where role = 'admin' and disabled_at is null and id <> $1", [target.id]);
    if (!others?.n) throw new HttpError(400, "Debe quedar al menos una persona administradora activa.");
  }
  if (b.role) await query("update users set role = $2 where id = $1", [target.id, b.role]);
  // Desactivar también cierra todas sus sesiones.
  if (b.disabled === true) await query("update users set disabled_at = coalesce(disabled_at, now()), token_version = token_version + 1 where id = $1", [target.id]);
  if (b.disabled === false) await query("update users set disabled_at = null, failed_logins = 0, locked_until = null where id = $1", [target.id]);
  const user = await one(`select ${USER_COLS}, (select count(*)::int from projects p where p.owner_id = users.id) as project_count from users where id = $1`, [target.id]);
  res.json({ user });
});

admin.get("/invites", async (_req, res) => {
  const invites = await query(
    `select i.id, i.email, i.role, i.created_at, i.expires_at, u.name as invited_by
     from invites i left join users u on u.id = i.invited_by
     where i.accepted_at is null and i.expires_at > now() order by i.created_at desc`);
  res.json({ invites });
});

admin.post("/invites", async (req, res) => {
  const b = parse(z.object({ email: z.string().trim().toLowerCase().email().max(254), role: role.default("member") }), req.body);
  if (await one("select 1 from users where email = $1", [b.email])) throw new HttpError(409, "Ya existe una cuenta con ese correo");
  await query("update invites set expires_at = now() where email = $1 and accepted_at is null and expires_at > now()", [b.email]);
  const token = crypto.randomBytes(32).toString("base64url");
  const invite = await one(
    "insert into invites(email, role, token_hash, invited_by, expires_at) values ($1,$2,$3,$4, now() + interval '7 days') returning id, email, role, created_at, expires_at",
    [b.email, b.role, sha256(token), req.user!.id]);
  const base = process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`;
  const link = `${base}/invite?token=${token}`;
  await sendMail(b.email, "Te invitaron a Redekorate",
    `Hola,\n\n${req.user!.name} te invitó a Redekorate. Crea tu cuenta con este enlace (válido por 7 días):\n${link}\n\nSi no esperabas esta invitación, ignora este correo.`);
  res.status(201).json({ invite: { ...invite, invited_by: req.user!.name }, link, mailed: !!process.env.SMTP_HOST });
});

admin.delete("/invites/:id", async (req, res) => {
  await query("update invites set expires_at = now() where id = $1 and accepted_at is null", [req.params.id]);
  res.json({ ok: true });
});
