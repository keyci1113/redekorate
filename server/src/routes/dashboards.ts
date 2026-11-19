// Dashboards across the projects a person can open: studies, tickets and projects.
// GET /api/dashboards/{studies|tickets|projects}?project=<id>&period=7|30|90|quarter
// GET /api/dashboards/{studies|tickets}/items?…&by=<figure>&value=<…>: the items behind one figure (drill-downs, below).
import { Router, type Request } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, parse } from "../lib/http.js";
import { accessJoins, accessWhere, type Area } from "../lib/access.js";
import { LOW_COMPLETION, MIN_STARTED, PERIODS, bindNamed, pagePath, periodRange, projectHealth, studyAttention, topCounts } from "../lib/dashboards.js";
import { AT_RISK_DAYS, milestoneRows } from "../lib/milestones.js";
import { TICKET_STATUSES, TICKET_TYPES } from "../lib/tickets.js";

// ── Shared SQL ──────────────────────────────────────────────────
/** How many items a drill-down returns; `total` says how many match. */
const DRILL_LIMIT = 100;

/** CTE `<name>`: the non-archived projects the user ($1) can open, narrowed to one project when $2 is given. */
const accAs = (name: string, area?: Area) => `${name} as (select p.id ${accessJoins("$1")} where ${accessWhere("$1", area)} and not p.archived and ($2::uuid is null or p.id = $2))`;
/** CTE `closed`: done tickets with the moment they were moved to Done (their last edit when the history has no such entry). Needs `acc`. */
const CLOSED = `closed as (select t.id, t.project_id, t.created_at,
    coalesce((select max(a.created_at) from ticket_activity a where a.ticket_id = t.id and a.action = 'status' and a.to_value = 'done'), t.updated_at) as closed_at
  from tickets t where t.status = 'done' and t.project_id in (select id from acc))`;

export const dashboards = Router();
dashboards.use(requireAuth);

/** Studies pages count only projects whose research section is open to the person; ticket pages, the tickets section. */
const ACC_RESEARCH = accAs("acc", "research"), ACC_TICKETS = accAs("acc", "tickets");
/** The projects page lists every project and fills each half from `accr` / `acct`. */
const ACC_PROJECTS = `${accAs("acc")}, ${accAs("accr", "research")}, ${accAs("acct", "tickets")}`;

const Filters = z.object({ project: z.string().uuid().optional(), period: z.enum(PERIODS).default("30") });
function scope(req: Request) {
  const f = Filters.parse(req.query);
  const range = periodRange(f.period, new Date());
  return { ...range, period: f.period, base: [req.user!.id, f.project ?? null] as unknown[] };
}
const row = async <T = Record<string, any>>(sql: string, params: unknown[]) => (await query<T>(sql, params))[0];
/** Projects for the filter: every project the person can open, whatever the current selection. */
const projectOptions = (uid: string) => query(`select p.id, p.name ${accessJoins("$1")} where ${accessWhere("$1")} and not p.archived order by lower(p.name)`, [uid]);

// ── Drill-downs: the items behind one figure ────────────────────
dashboards.get("/studies/items", async (req, res) => { res.json(await studyItems(req.user!.id, req.query)); });
dashboards.get("/tickets/items", async (req, res) => { res.json(await ticketItems(req.user!.id, req.query)); });

// ── Studies ─────────────────────────────────────────────────────
dashboards.get("/studies", async (req, res) => {
  const s = scope(req), p = [...s.base, s.since, s.before];
  const daily = s.days <= 31;
  const [projects, totals, series, methods, live, severity] = await Promise.all([
    projectOptions(req.user!.id),
    row(`with ${ACC_RESEARCH}, st as (select * from studies where project_id in (select id from acc)),
           se as (select x.* from sessions x join st on st.id = x.study_id)
         select
           (select count(*)::int from se where completed_at > now() - interval '7 days') as responses_week,
           (select count(*)::int from se where completed_at > now() - interval '14 days' and completed_at <= now() - interval '7 days') as responses_prev_week,
           (select count(*)::int from se where completed_at >= $3) as responses_period,
           (select count(*)::int from se where completed_at >= $4 and completed_at < $3) as responses_prev_period,
           (select count(*)::int from st where status = 'live') as live,
           (select count(*)::int from st) as studies,
           (select count(*)::int from se join st on st.id = se.study_id where st.status = 'live') as started,
           (select count(*)::int from se join st on st.id = se.study_id where st.status = 'live' and se.completed_at is not null) as finished,
           (select count(*)::int from insights i where i.project_id in (select id from acc) and i.created_at >= $3) as insights,
           (select count(*)::int from insights i where i.project_id in (select id from acc) and i.created_at >= $3 and i.severity = 'critical') as insights_critical,
           (select count(*)::int from insights i where i.project_id in (select id from acc) and i.created_at >= $3 and i.severity = 'high') as insights_high,
           (select count(*)::int from se where started_at >= $3) as participants,
           (select count(*)::int from se where started_at >= $4 and started_at < $3) as participants_prev`, p),
    query(`with ${ACC_RESEARCH}
         select to_char(b, 'YYYY-MM-DD') as day, coalesce(c.n, 0)::int as n
         from generate_series(date_trunc($4, $3::timestamptz), date_trunc($4, now()), ('1 ' || $4)::interval) b
         left join (select date_trunc($4, se.completed_at) as b, count(*) n from sessions se join studies st on st.id = se.study_id
                    where st.project_id in (select id from acc) and se.completed_at >= date_trunc($4, $3::timestamptz) group by 1) c using (b)
         order by b`, [...s.base, s.since, daily ? "day" : "week"]),
    query(`with ${ACC_RESEARCH} select method, count(*)::int as n from studies where project_id in (select id from acc) group by method order by n desc, method`, s.base),
    query(`with ${ACC_RESEARCH}
         select st.id, st.title, st.method, st.published_at, p.name as project_name,
           (select count(*)::int from sessions x where x.study_id = st.id) as started,
           (select count(*)::int from sessions x where x.study_id = st.id and x.completed_at is not null) as finished,
           (select max(x.completed_at) from sessions x where x.study_id = st.id) as last_response_at
         from studies st join projects p on p.id = st.project_id
         where st.project_id in (select id from acc) and st.status = 'live' order by st.title`, s.base),
    // Insights of the period, like the "New insights" tile. An insight "became a ticket" when a ticket links to it
    // as its source; a "converted" link is the other way round (the insight was made from the ticket).
    row(`with ${ACC_RESEARCH}
         select count(*) filter (where severity = 'critical')::int as critical, count(*) filter (where severity = 'high')::int as high,
           count(*) filter (where severity = 'medium')::int as medium, count(*) filter (where severity = 'low')::int as low,
           count(*) filter (where exists(select 1 from ticket_links k where k.target_type = 'insight' and k.target_id = i.id and k.relation <> 'converted'))::int as with_tickets
         from insights i where i.project_id in (select id from acc) and i.created_at >= $3`, [...s.base, s.since]),
  ]);
  const now = Date.now();
  res.json({ projects, period: s.period, days: s.days, bucket: daily ? "day" : "week", totals, series, methods, severity, low_completion: LOW_COMPLETION, min_started: MIN_STARTED,
    live: live.map((x) => ({ ...x, attention: studyAttention(x, now) })) });
});

// ── Tickets ─────────────────────────────────────────────────────
dashboards.get("/tickets", async (req, res) => {
  const s = scope(req), p = [...s.base, s.since, s.before];
  const [projects, totals, weeks, people, types, due, reporters] = await Promise.all([
    projectOptions(req.user!.id),
    row(`with ${ACC_TICKETS}, ${CLOSED}, tk as (select * from tickets where project_id in (select id from acc)), wk as (select date_trunc('week', now()) as w)
         select
           (select count(*)::int from tk where status <> 'done') as open,
           (select count(*)::int from tk where status = 'todo') as todo,
           (select count(*)::int from tk where status = 'in_progress') as in_progress,
           (select count(*)::int from tk where status = 'in_review') as in_review,
           (select count(*)::int from tk where status <> 'done' and due_date < current_date) as overdue,
           (select count(*)::int from tk t left join closed c on c.id = t.id
              where t.due_date < current_date - 7 and t.created_at < now() - interval '7 days' and (t.status <> 'done' or c.closed_at > now() - interval '7 days')) as overdue_last_week,
           (select max(current_date - due_date)::int from tk where status <> 'done' and due_date < current_date) as oldest_days_late,
           (select count(*)::int from tk, wk where created_at >= w) as created_week,
           (select count(*)::int from tk, wk where created_at >= w - interval '7 days' and created_at < w) as created_prev_week,
           (select count(*)::int from tk, wk where created_at >= w and source = 'widget') as created_week_widget,
           (select count(*)::int from closed, wk where closed_at >= w) as closed_week,
           (select count(*)::int from tk where created_at >= $3) as created_period,
           (select count(*)::int from tk where created_at >= $4 and created_at < $3) as created_prev_period,
           (select count(*)::int from tk where created_at >= $3 and source = 'widget') as created_period_widget,
           (select count(*)::int from closed where closed_at >= $3) as closed_period,
           (select count(*)::int from closed where closed_at >= $4 and closed_at < $3) as closed_prev_period,
           (select (extract(epoch from percentile_cont(0.5) within group (order by closed_at - created_at)) / 86400)::float8 from closed where closed_at >= $3) as median_days,
           (select (extract(epoch from percentile_cont(0.5) within group (order by closed_at - created_at)) / 86400)::float8 from closed where closed_at >= $4 and closed_at < $3) as median_days_prev,
           (select count(*)::int from tk where created_at >= $3 and source = 'manual') as source_manual,
           (select count(*)::int from tk where created_at >= $3 and source = 'insight') as source_insight,
           (select count(*)::int from tk where created_at >= $3 and source = 'widget') as source_widget`, p),
    query(`with ${ACC_TICKETS}, ${CLOSED}
         select to_char(w, 'YYYY-MM-DD') as week,
           (select count(*)::int from tickets t where t.project_id in (select id from acc) and t.created_at >= w and t.created_at < w + interval '7 days') as created,
           (select count(*)::int from closed c where c.closed_at >= w and c.closed_at < w + interval '7 days') as closed
         from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') w order by w`, s.base),
    query(`with ${ACC_TICKETS}, tk as (select * from tickets where project_id in (select id from acc) and status <> 'done')
         select u.id, u.name, u.avatar, count(*)::int as open, count(*) filter (where tk.due_date < current_date)::int as overdue
         from tk join ticket_assignees a on a.ticket_id = tk.id join users u on u.id = a.user_id group by u.id
         union all
         select null, null, null, count(*)::int, count(*) filter (where tk.due_date < current_date)::int
         from tk where not exists(select 1 from ticket_assignees a where a.ticket_id = tk.id) having count(*) > 0
         order by 4 desc`, s.base),
    query(`with ${ACC_TICKETS} select type, count(*)::int as n from tickets where project_id in (select id from acc) group by type`, s.base),
    query(`with ${ACC_TICKETS}
         select t.number, t.title, t.status, t.priority, to_char(t.due_date, 'YYYY-MM-DD') as due_date, t.project_id, p.name as project_name,
           (select string_agg(u.name, ', ' order by u.name) from ticket_assignees a join users u on u.id = a.user_id where a.ticket_id = t.id) as assignees
         from tickets t join projects p on p.id = t.project_id
         where t.project_id in (select id from acc) and t.status <> 'done' and t.due_date <= current_date + 3
         order by t.due_date, t.number limit 8`, s.base),
    query<{ page_url: string | null; created_at: string }>(`with ${ACC_TICKETS}
         select r.metadata->>'page_url' as page_url, r.created_at from ticket_reporters r join tickets t on t.id = r.ticket_id
         where t.project_id in (select id from acc) and r.created_at >= $3 and r.erased_at is null`, [...s.base, s.since]),
  ]);
  const paths = reporters.map((r) => pagePath(r.page_url)).filter((x): x is string => x !== null);
  const hosts = topCounts(reporters.flatMap((r) => { try { return r.page_url ? [new URL(r.page_url).host] : []; } catch { return []; } }), 1).top;
  res.json({ projects, period: s.period, days: s.days, totals, weeks, people, types, due, widget: { ...topCounts(paths, 4), total: reporters.length, host: hosts[0]?.key ?? null } });
});

// ── Projects ────────────────────────────────────────────────────
dashboards.get("/projects", async (req, res) => {
  const s = scope(req);
  const [projects, rows, liveStudies, milestones, activity] = await Promise.all([
    projectOptions(req.user!.id),
    query(`with ${ACC_PROJECTS}
         select p.id, p.name, p.description, p.color,
           (select count(*)::int from studies st where st.project_id = p.id and p.id in (select id from accr) and st.status = 'live') as live_studies,
           (select count(*)::int from sessions x join studies st on st.id = x.study_id where st.project_id = p.id and p.id in (select id from accr) and x.completed_at > now() - interval '7 days') as responses_7d,
           (select count(*)::int from tickets t where t.project_id = p.id and p.id in (select id from acct) and t.status <> 'done') as open_tickets,
           (select count(*)::int from tickets t where t.project_id = p.id and p.id in (select id from acct) and t.status <> 'done' and t.due_date < current_date) as overdue,
           (select count(*)::int from tickets t where t.project_id = p.id and p.id in (select id from acct) and t.updated_at > now() - interval '7 days') as ticket_changes_7d
         from projects p where p.id in (select id from acc) order by lower(p.name)`, s.base),
    // Live studies, judged by studyAttention like on the studies dashboard.
    query<{ project_id: string; started: number; finished: number; last_response_at: Date | null; published_at: Date | null }>(`with ${ACC_PROJECTS}
         select st.project_id, st.published_at,
           (select count(*)::int from sessions x where x.study_id = st.id) as started,
           (select count(*)::int from sessions x where x.study_id = st.id and x.completed_at is not null) as finished,
           (select max(x.completed_at) from sessions x where x.study_id = st.id) as last_response_at
         from studies st where st.project_id in (select id from accr) and st.status = 'live'`, s.base),
    milestoneRows(`m.project_id in (select p.id ${accessJoins("$1")} where ${accessWhere("$1", "tickets")} and not p.archived and ($2::uuid is null or p.id = $2))`, s.base),
    query(`with ${ACC_PROJECTS}
         select * from (
           select 'responses' as kind, max(x.completed_at) as at, st.project_id, st.id::text as ref, st.title, count(*)::int as n, null::text as extra
             from sessions x join studies st on st.id = x.study_id
             where st.project_id in (select id from accr) and x.completed_at > now() - interval '24 hours' group by st.id
           union all
           select 'ticket_status', a.created_at, t.project_id, t.number::text, coalesce(u.name, ''), 0, a.to_value
             from ticket_activity a join tickets t on t.id = a.ticket_id left join users u on u.id = a.actor_id
             where t.project_id in (select id from acct) and a.action = 'status' and a.created_at > now() - interval '7 days'
           union all
           select 'insight', i.created_at, i.project_id, i.id::text, i.title, 0, i.severity
             from insights i where i.project_id in (select id from accr) and i.created_at > now() - interval '7 days'
           union all
           select 'widget', max(t.created_at), t.project_id, null, '', count(*)::int, null
             from tickets t where t.project_id in (select id from acct) and t.source = 'widget' and t.created_at > now() - interval '7 days' group by t.project_id
         ) e order by at desc limit 8`, s.base),
  ]);
  const ms = milestones, now = Date.now();
  const out = rows.map((r) => {
    const mine = ms.filter((m) => m.project_id === r.id);
    // The next milestone is the unfinished one that ends first; milestones without dated tickets go last.
    const next = mine.find((m) => m.state !== "done") ?? null;
    const milestones_behind = mine.filter((m) => m.state === "behind").length;
    const milestones_at_risk = mine.filter((m) => m.state === "at_risk").length;
    const why = liveStudies.filter((x) => x.project_id === r.id).map((x) => studyAttention(x, now));
    const low_completion = why.filter((w) => w === "low_completion").length, studies_attention = why.filter(Boolean).length;
    return { ...r, low_completion, studies_attention, milestones_behind, milestones_at_risk,
      health: projectHealth({ ...r, studies_attention, milestones_behind, milestones_at_risk }), next_milestone: next };
  });
  const names = new Map(rows.map((r) => [r.id, r.name]));
  res.json({
    projects, period: s.period, days: s.days, rows: out,
    milestones: ms,
    activity: activity.map((a) => ({ ...a, project_name: names.get(a.project_id) ?? "" })),
    low_completion: LOW_COMPLETION, at_risk_days: AT_RISK_DAYS,
  });
});

// ── Drill-downs ─────────────────────────────────────────────────
// The tickets, studies or insights behind one number of a dashboard (a tile, a bar, a column). Same filters as the
// dashboards (project, period) and the same access rules: studies and insights count only projects whose research
// section the person can open, tickets only those whose ticket section they can.

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Base = { project: z.string().uuid().optional(), period: z.enum(PERIODS).default("30") };

const TICKET_DRILLS = ["open", "status", "overdue", "due", "created_week", "closed_week", "created_period", "closed_period", "assignee", "type", "source", "week", "page"] as const;
const TicketDrill = z.object({ ...Base, by: z.enum(TICKET_DRILLS), value: z.string().max(500).optional() });

/** The SQL condition (on `t` = tickets, `c` = closed) and its parameter for one ticket drill-down. `{since}` is the period start, `{arg}` the value. */
function ticketCondition(by: (typeof TICKET_DRILLS)[number], value: string | undefined): { where: string; arg?: unknown; order: string } {
  const need = <T>(schema: z.ZodType<T>): T => {
    const r = schema.safeParse(value);
    if (!r.success) throw new HttpError(400, "Datos inválidos");
    return r.data;
  };
  const byDue = "t.due_date nulls last, t.number";
  switch (by) {
    case "open": return { where: "t.status <> 'done'", order: byDue };
    case "status": return { where: "t.status = {arg}", arg: need(z.enum(TICKET_STATUSES)), order: byDue };
    case "overdue": return { where: "t.status <> 'done' and t.due_date < current_date", order: byDue };
    case "due": return { where: "t.status <> 'done' and t.due_date <= current_date + 3", order: byDue };
    case "created_week": return { where: "t.created_at >= date_trunc('week', now())", order: "t.created_at desc" };
    case "closed_week": return { where: "c.closed_at >= date_trunc('week', now())", order: "c.closed_at desc" };
    case "created_period": return { where: "t.created_at >= {since}", order: "t.created_at desc" };
    case "closed_period": return { where: "c.closed_at >= {since}", order: "c.closed_at desc" };
    case "type": return { where: "t.type = {arg}", arg: need(z.enum(TICKET_TYPES)), order: "t.status = 'done', t.created_at desc" };
    case "source": return { where: "t.created_at >= {since} and t.source = {arg}", arg: need(z.enum(["manual", "insight", "widget"])), order: "t.created_at desc" };
    case "assignee": {
      const who = need(z.union([z.literal("none"), z.string().uuid()]));
      return who === "none"
        ? { where: "t.status <> 'done' and not exists(select 1 from ticket_assignees a where a.ticket_id = t.id)", order: byDue }
        : { where: "t.status <> 'done' and exists(select 1 from ticket_assignees a where a.ticket_id = t.id and a.user_id = {arg})", arg: who, order: byDue };
    }
    case "week": return {
      where: "((t.created_at >= {arg}::date and t.created_at < {arg}::date + 7) or (c.closed_at >= {arg}::date and c.closed_at < {arg}::date + 7))",
      arg: need(Day), order: "coalesce(c.closed_at, t.created_at) desc",
    };
    case "page": return { where: "t.id = any({arg}::uuid[])", order: "t.created_at desc" };
  }
}

/** The tickets behind one figure of the tickets dashboard (or the projects dashboard), newest or most urgent first. */
async function ticketItems(userId: string, input: unknown) {
  const f = parse(TicketDrill, input);
  const { since } = periodRange(f.period, new Date());
  const cond = ticketCondition(f.by, f.value);
  const base: unknown[] = [userId, f.project ?? null];
  let arg = cond.arg;
  if (f.by === "page") {
    // Widget tickets whose report came from that page in the period; the page is the URL's path, as on the dashboard.
    const path = f.value ?? "";
    const reports = await query<{ ticket_id: string; page_url: string | null }>(
      `with ${accAs("acc", "tickets")}
       select r.ticket_id, r.metadata->>'page_url' as page_url from ticket_reporters r join tickets t on t.id = r.ticket_id
       where t.project_id in (select id from acc) and r.created_at >= $3 and r.erased_at is null`, [...base, since]);
    arg = [...new Set(reports.filter((r) => pagePath(r.page_url) === path).map((r) => r.ticket_id))];
  }
  const { sql: where, params } = bindNamed(cond.where, base, { since, arg });
  const rows = await query<Record<string, unknown> & { total: number }>(
    `with ${accAs("acc", "tickets")}, ${CLOSED}
     select t.number, t.title, t.status, t.priority, t.type, to_char(t.due_date, 'YYYY-MM-DD') as due_date, t.created_at, c.closed_at,
       t.project_id, p.name as project_name,
       (select string_agg(u.name, ', ' order by u.name) from ticket_assignees a join users u on u.id = a.user_id where a.ticket_id = t.id) as assignees,
       count(*) over ()::int as total
     from tickets t join projects p on p.id = t.project_id left join closed c on c.id = t.id
     where t.project_id in (select id from acc) and ${where}
     order by ${cond.order} limit ${DRILL_LIMIT}`, params);
  return { kind: "tickets" as const, total: rows[0]?.total ?? 0, items: rows.map(({ total: _, ...r }) => r) };
}

const STUDY_DRILLS = ["live", "method", "responses_week", "responses_period", "participants", "day", "insights", "severity"] as const;
const StudyDrill = z.object({ ...Base, by: z.enum(STUDY_DRILLS), value: z.string().max(200).optional(), bucket: z.enum(["day", "week"]).default("day") });

/**
 * The studies (or insights) behind one figure of the studies dashboard or the home page. Studies carry `n`,
 * the responses or sessions that count for the figure (null when the figure is not a count of sessions).
 */
async function studyItems(userId: string, input: unknown) {
  const f = parse(StudyDrill, input);
  const { since } = periodRange(f.period, new Date());
  const base: unknown[] = [userId, f.project ?? null];
  const ACC = accAs("acc", "research");

  if (f.by === "insights" || f.by === "severity") {
    const severity = f.by === "severity" && f.value ? z.enum(["critical", "high", "medium", "low"]).safeParse(f.value) : null;
    if (severity && !severity.success) throw new HttpError(400, "Datos inválidos");
    const rows = await query<Record<string, unknown> & { total: number }>(
      `with ${ACC}
       select i.id, i.title, i.severity, i.created_at, i.reviewed_at, i.project_id, p.name as project_name, i.study_id, s.title as study_title,
         count(*) over ()::int as total
       from insights i join projects p on p.id = i.project_id left join studies s on s.id = i.study_id
       where i.project_id in (select id from acc) and ($3::timestamptz is null or i.created_at >= $3) and ($4::text is null or i.severity = $4)
       order by array_position(array['critical','high','medium','low']::text[], i.severity), i.created_at desc limit ${DRILL_LIMIT}`,
      [...base, since, severity?.data ?? null]);   // both figures count the insights of the period
    return { kind: "insights" as const, total: rows[0]?.total ?? 0, items: rows.map(({ total: _, ...r }) => r) };
  }

  // Which studies, and what `n` counts for each: sessions in a window, or nothing.
  let where = "true", n = "null::int", order = "s.title";
  const params = [...base];
  const sessions = (cond: string) => `(select count(*)::int from sessions x where x.study_id = s.id and ${cond})`;
  switch (f.by) {
    case "live": where = "s.status = 'live'"; break;
    case "method": {
      if (!f.value) throw new HttpError(400, "Datos inválidos");
      params.push(f.value); where = "s.method = $3"; order = "s.status = 'draft', s.updated_at desc"; break;
    }
    case "responses_week": n = sessions("x.completed_at > now() - interval '7 days'"); break;
    case "responses_period": params.push(since); n = sessions("x.completed_at >= $3"); break;
    case "participants": params.push(since); n = sessions("x.started_at >= $3"); break;
    case "day": {
      const day = Day.safeParse(f.value);
      if (!day.success) throw new HttpError(400, "Datos inválidos");
      // The column's bucket starts on that day and lasts a day or a week, as on the chart.
      params.push(day.data, f.bucket);
      n = sessions("x.completed_at >= $3::date and x.completed_at < $3::date + ('1 ' || $4)::interval"); break;
    }
  }
  if (n !== "null::int") { where = `${n} > 0`; order = "n desc, s.title"; }
  const rows = await query<Record<string, unknown> & { total: number }>(
    `with ${ACC}
     select s.id, s.title, s.method, s.status, s.project_id, p.name as project_name, ${n} as n,
       ${sessions("true")} as started, ${sessions("x.completed_at is not null")} as finished,
       count(*) over ()::int as total
     from studies s join projects p on p.id = s.project_id
     where s.project_id in (select id from acc) and ${where}
     order by ${order} limit ${DRILL_LIMIT}`, params);
  return { kind: "studies" as const, total: rows[0]?.total ?? 0, items: rows.map(({ total: _, ...r }) => r) };
}
