// Ticket notifications: who is told about what, and the email that goes with it.
import type { PoolClient } from "pg";
import { pool } from "./db.js";
import { sendMail } from "./mail.js";

export const NOTIFY_KINDS = ["assigned", "tagged", "status", "comment"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
type Db = Pick<PoolClient, "query">;

/** Who hears about a change: the given people once each, never the person who made it. */
export function recipients(users: (string | null | undefined)[], actor: string | null): string[] {
  return [...new Set(users.filter((u): u is string => !!u && u !== actor))];
}

/** Records one notification per recipient. Call it inside the transaction that makes the change, so they exist together or not at all. */
export async function notify(db: Db, n: { users: (string | null | undefined)[]; actor: string | null; projectId: string; ticketId: string; kind: NotifyKind; data?: Record<string, unknown>; lang?: string }) {
  for (const user of recipients(n.users, n.actor)) {
    await db.query("insert into notifications(user_id, actor_id, project_id, ticket_id, kind, data, lang) values ($1,$2,$3,$4,$5,$6,$7)",
      [user, n.actor, n.projectId, n.ticketId, n.kind, JSON.stringify(n.data ?? {}), n.lang === "en" ? "en" : "es"]);
  }
}

/** Everyone on a ticket: assigned plus tagged. They are told when it moves or gets a comment. */
export async function ticketPeople(db: Db, ticketId: string): Promise<string[]> {
  const { rows } = await db.query("select user_id from ticket_assignees where ticket_id = $1 union select user_id from ticket_watchers where ticket_id = $1", [ticketId]);
  return rows.map((r) => r.user_id as string);
}

const STATUS = { es: { todo: "Por hacer", in_progress: "En progreso", in_review: "En revisión", done: "Hecho" }, en: { todo: "To do", in_progress: "In progress", in_review: "In review", done: "Done" } } as const;
const statusName = (lang: "es" | "en", s: unknown) => (STATUS[lang] as Record<string, string>)[String(s)] ?? String(s ?? "");

export interface NoticeRow { kind: NotifyKind; data: Record<string, unknown>; lang: string; actor_name: string | null; number: number; title: string; project_name: string }
/** One sentence saying what happened, in the notification's language. The bell and the email both use it. */
export function sentence(n: NoticeRow): string {
  const en = n.lang === "en", lang = en ? "en" : "es";
  const who = n.actor_name ?? (en ? "The feedback widget" : "El widget de feedback");
  switch (n.kind) {
    case "assigned": return en ? `${who} assigned you #${n.number}` : `${who} te asignó #${n.number}`;
    case "tagged": return en ? `${who} tagged you on #${n.number}` : `${who} te mencionó en #${n.number}`;
    case "status": return en ? `${who} moved #${n.number} from ${statusName(lang, n.data.from)} to ${statusName(lang, n.data.to)}` : `${who} movió #${n.number} de ${statusName(lang, n.data.from)} a ${statusName(lang, n.data.to)}`;
    default: return en ? `${who} commented on #${n.number}` : `${who} comentó en #${n.number}`;
  }
}

export function emailFor(n: NoticeRow, link: string): { subject: string; text: string } {
  const en = n.lang === "en", line = sentence(n);
  const excerpt = n.kind === "comment" && typeof n.data.excerpt === "string" && n.data.excerpt ? `\n\n"${n.data.excerpt}"` : "";
  return {
    subject: `[${n.project_name}] ${line}: ${n.title}`.slice(0, 180),
    text: `${line}.\n${n.title}${excerpt}\n\n${link}\n\n` + (en
      ? "You get this because you are assigned to or tagged on the ticket. Turn these emails off under My account."
      : "Recibes esto porque el ticket está asignado a ti o te mencionaron en él. Puedes apagar estos correos en Mi cuenta."),
  };
}

/**
 * Emails the notifications that have not gone out yet. Runs after the request that created them,
 * never inside it: a slow or failing mail server must not slow down or undo moving a ticket.
 * Each row is claimed first, so two requests finishing together do not send the same email twice.
 */
export async function flushEmails(baseUrl: string): Promise<number> {
  const { rows } = await pool.query(
    `update notifications n set emailed_at = now()
     from users u, tickets t, projects p, (select id from notifications where emailed_at is null order by created_at limit 50 for update skip locked) pick
     where n.id = pick.id and u.id = n.user_id and t.id = n.ticket_id and p.id = n.project_id
     returning n.kind, n.data, n.lang, t.number, t.title, t.project_id, p.name as project_name, u.email, u.notify_email, u.notify_email_off, u.disabled_at,
       (select a.name from users a where a.id = n.actor_id) as actor_name`);
  let sent = 0;
  for (const r of rows) {
    // The master switch, then the kinds this person turned off. The bell shows them either way.
    if (!r.notify_email || r.disabled_at || r.notify_email_off.includes(r.kind)) continue;
    const mail = emailFor(r as NoticeRow, `${baseUrl}/projects/${r.project_id}/tickets/${r.number}`);
    try { await sendMail(r.email, mail.subject, mail.text); sent++; }
    catch (e) { console.warn("[notify] email not sent:", e instanceof Error ? e.message : e); }
  }
  return sent;
}
