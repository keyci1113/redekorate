/**
 * The daily brief (GET /api/brief): my tickets due this week, what is new since I last opened it, live studies and
 * milestones due soon, across every project I can open. Each part follows that project's sections: studies, responses
 * and insights need "research"; tickets, widget tickets, mentions and milestones need "tickets". A handful of
 * aggregate queries over all projects at once, never one per project.
 */
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { parse } from "../lib/http.js";
import { accessJoins, accessWhere, type Area } from "../lib/access.js";
import { milestoneRows } from "../lib/milestones.js";
import { MY_DAY_LIMIT, addDays, briefSince, dueBucket, safeTimeZone, weekEnd, type DueBucket } from "../lib/brief.js";
import type { Actor } from "./actor.js";

/** CTE `acc`: the open (not archived) projects where the person in $1 has `area`, with their names. */
const acc = (area: Area) => `acc as (select p.id, p.name ${accessJoins("$1")} where ${accessWhere("$1", area)} and not p.archived)`;
const LIST = 5;

export const BriefQuery = z.object({
  /** The viewer's time zone: "today" and "due today" are their day, not the server's. */
  tz: z.string().max(64).optional(),
  /** The start the panel already used; a refresh keeps it so "What's new" does not empty itself. */
  since: z.iso.datetime({ offset: true }).optional(),
});

interface Counted<T> { items: T[]; total: number }
const counted = <T extends { total?: number }>(rows: T[]): Counted<Omit<T, "total">> =>
  ({ items: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0 });

/** What changed since `since`: new responses per study, new insights, widget tickets, assignments and mentions. */
async function whatsNew(uid: string, since: Date) {
  const [responses, insights, widget, notices] = await Promise.all([
    query<{ study_id: string; title: string; project_id: string; project_name: string; count: number }>(
      `with ${acc("research")}
       select s.id as study_id, s.title, s.project_id, acc.name as project_name, count(*)::int as count
       from sessions x join studies s on s.id = x.study_id join acc on acc.id = s.project_id
       where x.completed_at > $2 group by s.id, acc.name order by count desc, s.title limit 10`, [uid, since]),
    query<{ id: string; title: string; project_id: string; project_name: string; total: number }>(
      `with ${acc("research")}
       select i.id, i.title, i.project_id, acc.name as project_name, (count(*) over())::int as total
       from insights i join acc on acc.id = i.project_id
       where i.created_at > $2 and i.created_by <> $1 order by i.created_at desc limit ${LIST}`, [uid, since]),
    query<{ id: string; number: number; title: string; project_id: string; project_name: string; total: number }>(
      `with ${acc("tickets")}
       select t.id, t.number, t.title, t.project_id, acc.name as project_name, (count(*) over())::int as total
       from tickets t join acc on acc.id = t.project_id
       where t.source = 'widget' and t.created_at > $2 order by t.created_at desc limit ${LIST}`, [uid, since]),
    // Assignments and @mentions in comments are already recorded as notifications for this person. A mention also
    // counts on a project they open without the tickets section when it let them read that ticket (ticket_mention_access).
    query<{ kind: "assigned" | "tagged"; number: number; title: string; project_id: string; project_name: string; actor_name: string | null; excerpt: string | null; created_at: string }>(
      `with ${acc("tickets")}
       select n.kind, t.number, t.title, t.project_id, pr.name as project_name, a.name as actor_name, n.data->>'excerpt' as excerpt, n.created_at
       from notifications n join tickets t on t.id = n.ticket_id join projects pr on pr.id = n.project_id left join users a on a.id = n.actor_id
       where n.user_id = $1 and n.created_at > $2 and (n.kind = 'assigned' or (n.kind = 'tagged' and n.data ? 'comment'))
         and (n.project_id in (select id from acc)
           or (n.kind = 'tagged' and exists (select 1 from ticket_mention_access g where g.ticket_id = n.ticket_id and g.user_id = $1)
               and n.project_id in (select p.id ${accessJoins("$1")} where ${accessWhere("$1")} and not p.archived)))
       order by n.created_at desc limit 60`, [uid, since]),
  ]);
  const assignedAll = notices.filter((n) => n.kind === "assigned")
    .filter((n, i, all) => all.findIndex((m) => m.project_id === n.project_id && m.number === n.number) === i);
  const mentionsAll = notices.filter((n) => n.kind === "tagged");
  const strip = ({ kind: _k, ...n }: (typeof notices)[number]) => n;
  return {
    responses,
    insights: counted(insights),
    widget: counted(widget),
    assigned: { items: assignedAll.slice(0, LIST).map(strip), total: assignedAll.length },
    mentions: { items: mentionsAll.slice(0, LIST).map(strip), total: mentionsAll.length },
  };
}
type News = Awaited<ReturnType<typeof whatsNew>>;
const hasNews = (n: News) => n.responses.length > 0 || n.insights.total + n.widget.total + n.assigned.total + n.mentions.total > 0;

async function startOf(actor: Actor, tz: string, asked?: string) {
  const u = await one<{ brief_seen_at: Date | null; now: Date; today: string }>(
    "select brief_seen_at, now() as now, to_char((now() at time zone $2)::date, 'YYYY-MM-DD') as today from users where id = $1", [actor.id, tz]);
  return { since: briefSince(u?.brief_seen_at ?? null, u?.now ?? new Date(), asked ? new Date(asked) : null), today: u?.today ?? new Date().toISOString().slice(0, 10) };
}

export interface MyDayTicket { id: string; number: number; title: string; priority: string; due_date: string; project_id: string; project_name: string; bucket: DueBucket }

/** The whole brief for the signed-in person. */
export async function getBrief(actor: Actor, input: unknown) {
  const q = parse(BriefQuery, input ?? {});
  const tz = safeTimeZone(q.tz);
  const uid = actor.id;
  const { since, today } = await startOf(actor, tz, q.since);
  const end = weekEnd(today);
  const [mine, news, live, milestones] = await Promise.all([
    query<Omit<MyDayTicket, "bucket">>(
      `with ${acc("tickets")}
       select t.id, t.number, t.title, t.priority, to_char(t.due_date, 'YYYY-MM-DD') as due_date, t.project_id, acc.name as project_name
       from tickets t join acc on acc.id = t.project_id
       where t.status <> 'done' and t.due_date <= $2::date and exists(select 1 from ticket_assignees a where a.ticket_id = t.id and a.user_id = $1)
       order by t.due_date, array_position(array['urgent','high','medium','low'], t.priority), t.number limit 200`, [uid, end]),
    whatsNew(uid, since),
    query<{ id: string; title: string; project_id: string; project_name: string; responses: number; today: number }>(
      `with ${acc("research")}
       select s.id, s.title, s.project_id, acc.name as project_name,
         count(x.id) filter (where x.completed_at is not null)::int as responses,
         count(x.id) filter (where (x.completed_at at time zone $2)::date = $3::date)::int as today
       from studies s join acc on acc.id = s.project_id left join sessions x on x.study_id = s.id
       where s.status = 'live' group by s.id, acc.name order by s.published_at desc nulls last limit 20`, [uid, tz, today]),
    milestoneRows(
      `m.project_id in (select p.id ${accessJoins("$1")} where ${accessWhere("$1", "tickets")} and not p.archived) and m.due_date between $2::date and $3::date`,
      [uid, today, addDays(today, 7)]),
  ]);
  const tickets = mine.map((t) => ({ ...t, bucket: dueBucket(t.due_date, today) })).filter((t): t is MyDayTicket => t.bucket !== null);
  const count = (b: DueBucket) => tickets.filter((t) => t.bucket === b).length;
  return {
    today, week_end: end, since: since.toISOString(), time_zone: tz,
    my_day: { tickets: tickets.slice(0, MY_DAY_LIMIT), total: tickets.length, counts: { overdue: count("overdue"), today: count("today"), week: count("week") } },
    news, has_new: hasNews(news),
    live_studies: live,
    milestones: milestones.filter((m) => m.state !== "done")
      .map(({ id, name, project_id, project_name, due_date, progress, total, done, state }) => ({ id, name, project_id, project_name, due_date, progress, total, done, state })),
  };
}

/** Whether the sun button shows its dot: anything new since the person last opened the brief. */
export async function briefStatus(actor: Actor) {
  const { since } = await startOf(actor, "UTC");
  return { has_new: hasNews(await whatsNew(actor.id, since)) };
}

/** Opening the panel: "What's new" starts from now on the next open, and the dot goes away. */
export async function markBriefSeen(actor: Actor) {
  const r = await one<{ brief_seen_at: string }>("update users set brief_seen_at = now() where id = $1 returning brief_seen_at", [actor.id]);
  return { seen_at: r?.brief_seen_at ?? null, has_new: false };
}
