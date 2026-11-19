// The bell: /api/notifications — what happened on the tickets the signed-in person is on.
import { Router } from "express";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { parse } from "../lib/http.js";
import { NOTIFY_KINDS, sentence, type NoticeRow } from "../lib/notify.js";

export const notifications = Router();
notifications.use(requireAuth);

notifications.get("/", async (req, res) => {
  const uid = req.user!.id;
  const [rows, meta] = await Promise.all([
    query<NoticeRow & { id: string; read_at: string | null; created_at: string; project_id: string; actor_avatar: string | null }>(
      `select n.id, n.kind, n.data, n.lang, n.read_at, n.created_at, n.project_id, t.number, t.title, p.name as project_name, a.name as actor_name, a.avatar as actor_avatar
       from notifications n join tickets t on t.id = n.ticket_id join projects p on p.id = n.project_id left join users a on a.id = n.actor_id
       where n.user_id = $1 order by n.created_at desc limit 30`, [uid]),
    one<{ unread: number; email: boolean; email_off: string[] }>(
      `select (select count(*)::int from notifications where user_id = $1 and read_at is null) as unread,
         (select notify_email from users where id = $1) as email, (select notify_email_off from users where id = $1) as email_off`, [uid]),
  ]);
  // The sentence is written in the reader's language, not the one stored for the email.
  const lang = req.get("x-lang") === "en" ? "en" : "es";
  res.json({ notifications: rows.map((r) => ({ ...r, text: sentence({ ...r, lang }) })), unread: meta!.unread, email: meta!.email, email_off: meta!.email_off });
});

/** Marks notifications as read: the given ones, or all of them. Only ever the caller's own. */
notifications.post("/read", async (req, res) => {
  const b = parse(z.object({ ids: z.array(z.string().uuid()).max(100).optional() }), req.body);
  if (b.ids) await query("update notifications set read_at = now() where user_id = $1 and read_at is null and id = any($2::uuid[])", [req.user!.id, b.ids]);
  else await query("update notifications set read_at = now() where user_id = $1 and read_at is null", [req.user!.id]);
  res.json({ ok: true });
});

/** The email switch (`email`) and the kinds turned off (`email_off`); either one or both. */
notifications.put("/settings", async (req, res) => {
  const b = parse(z.object({ email: z.boolean().optional(), email_off: z.array(z.enum(NOTIFY_KINDS)).max(NOTIFY_KINDS.length).optional() })
    .refine((v) => v.email !== undefined || v.email_off !== undefined, "Send email, email_off or both"), req.body);
  const r = (await one<{ email: boolean; email_off: string[] }>(
    `update users set notify_email = coalesce($2, notify_email), notify_email_off = coalesce($3::text[], notify_email_off)
     where id = $1 returning notify_email as email, notify_email_off as email_off`,
    [req.user!.id, b.email ?? null, b.email_off ? [...new Set(b.email_off)] : null]))!;
  res.json(r);
});
