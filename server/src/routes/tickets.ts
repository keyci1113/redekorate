// Tickets of a project: /api/projects/:id/tickets
// Roles follow the project: viewers read, commenters also comment, editors create and edit, owners delete.
import { Router, type Request } from "express";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool, one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { atLeast, projectIn, type ProjectRole } from "../lib/access.js";
import { sendMail } from "../lib/mail.js";
import { flushEmails, notify, ticketPeople } from "../lib/notify.js";
import { MAX_COLUMNS, builtInColumns, builtInName, columnLabel, columnsProblem, fallbackColumn, findColumn, type Column } from "../lib/board.js";
import { TICKET_PRIORITIES, TICKET_STATUSES, TICKET_TYPES, cleanLabels, mentionedIds, mostSimilar, reorder, setDiff, severityFromPriority, type TicketPriority, type TicketStatus } from "../lib/tickets.js";
import { isoDay, patchOf } from "../lib/schemas.js";
import { UPLOAD_DIR } from "./uploads.js";

const requireProject = projectIn("tickets");

export const tickets = Router({ mergeParams: true });
tickets.use(requireAuth);

type Db = Pick<PoolClient, "query">;
const pid = (req: Request) => (req.params as { id: string }).id;
const num = (req: Request) => {
  const n = Number((req.params as { number: string }).number);
  if (!Number.isInteger(n) || n < 1) throw notFound("Ticket");
  return n;
};

const langOf = (req: Request) => (req.get("x-lang") === "en" ? "en" : "es");
/** After the response: email whatever this request just notified people about. Never awaited by the request. */
const emailLater = (req: Request) => { void flushEmails((process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`).replace(/\/$/, "")).catch(() => {}); };

/** Runs `fn` in a transaction and returns its result. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

// ── People ──────────────────────────────────────────────────────
export interface Person { id: string; name: string; email: string; avatar: string | null; role: ProjectRole }
const RANK: Record<ProjectRole, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

/** Everyone who can open the project's tickets (owner, collaborators and organization members with that section): the people a ticket can be assigned to. */
export async function projectPeople(projectId: string, db: Db = pool): Promise<Person[]> {
  const { rows } = await db.query(
    `select u.id, u.name, u.email, u.avatar, x.role from (
       select p.owner_id as user_id, 'owner' as role from projects p where p.id = $1
       union all select m.user_id, m.role from project_members m where m.project_id = $1 and 'tickets' = any(m.areas)
       union all select om.user_id, case when om.role in ('owner','admin') then 'owner' else om.project_role end
         from organization_members om join projects p on p.organization_id = om.organization_id
         where p.id = $1 and (om.role in ('owner','admin') or (om.all_projects and 'tickets' = any(om.areas)))
     ) x join users u on u.id = x.user_id where u.disabled_at is null`, [projectId]);
  const best = new Map<string, Person>();
  for (const r of rows as Person[]) { const cur = best.get(r.id); if (!cur || RANK[r.role] > RANK[cur.role]) best.set(r.id, r); }
  return [...best.values()].sort((a, b) => RANK[b.role] - RANK[a.role] || a.name.localeCompare(b.name));
}

// ── Reads ───────────────────────────────────────────────────────
const LIST_COLS = `t.id, t.number, t.title, t.type, t.status, coalesce(t.column_id::text, t.status) as "column", t.priority, to_char(t.due_date, 'YYYY-MM-DD') as due_date,
  t.milestone_id, m.name as milestone, t.position, t.source, t.created_at, t.updated_at,
  coalesce((select json_agg(json_build_object('id', u.id, 'name', u.name, 'avatar', u.avatar) order by u.name)
            from ticket_assignees a join users u on u.id = a.user_id where a.ticket_id = t.id), '[]'::json) as assignees,
  coalesce((select array_agg(l.label order by lower(l.label)) from ticket_labels l where l.ticket_id = t.id), '{}') as labels,
  exists(select 1 from ticket_links k where k.ticket_id = t.id and k.target_type = 'insight' and k.relation <> 'converted') as from_insight,
  (select k.target_id from ticket_links k join insights i on i.id = k.target_id and i.project_id = t.project_id
    where k.ticket_id = t.id and k.target_type = 'insight' and k.relation = 'converted' order by k.created_at limit 1) as converted_insight_id,
  (select r.ref from ticket_reporters r where r.ticket_id = t.id order by r.created_at limit 1) as widget_ref`;
const LIST_SQL = `select ${LIST_COLS} from tickets t left join milestones m on m.id = t.milestone_id`;

const listRows = (projectId: string, db: Db = pool) => db.query(`${LIST_SQL} where t.project_id = $1 order by t.position, t.number`, [projectId]).then((r) => r.rows);
/** The project's board: its own columns in order, or the four built-in ones. */
async function boardColumns(projectId: string, db: Db = pool): Promise<Column[]> {
  const { rows } = await db.query("select id, name, status from ticket_columns where project_id = $1 order by position, created_at", [projectId]);
  return rows.length ? rows.map((r) => ({ ...r, custom: true }) as Column) : builtInColumns();
}
/** SQL test for "this ticket sits in column $n" (built-in columns are addressed by their status). */
const IN_COLUMN = (n: number) => `coalesce(column_id::text, status) = $${n}`;
const endOfColumn = async (db: Db, projectId: string, column: string) =>
  (await db.query(`select coalesce(max(position), 0) + 1024 as p from tickets where project_id = $1 and ${IN_COLUMN(2)}`, [projectId, column])).rows[0].p as number;

const milestones = (projectId: string) => query("select id, name from milestones where project_id = $1 order by lower(name)", [projectId]);

async function ticketRow(projectId: string, number: number, db: Db = pool) {
  const { rows } = await db.query(
    `select ${LIST_COLS}, t.description, t.created_by, cu.name as created_by_name
     from tickets t left join milestones m on m.id = t.milestone_id left join users cu on cu.id = t.created_by
     where t.project_id = $1 and t.number = $2`, [projectId, number]);
  if (!rows[0]) throw notFound("Ticket");
  return rows[0] as Record<string, any> & { id: string; number: number; title: string; status: TicketStatus };
}

const COMMENTS_SQL = `select c.id, c.body, c.created_at, c.user_id, coalesce(u.name, c.author_name) as name, u.avatar, c.visibility
  from comments c left join users u on u.id = c.user_id where c.ticket_id = $1 order by c.created_at`;

/** Links stored on this ticket plus tickets that link to it, each with the title of the other side. Deleted targets are left out. */
const LINKS_SQL = `
  select k.id, k.target_type, k.target_id, k.relation, false as incoming,
    case k.target_type
      when 'insight' then (select i.title from insights i where i.id = k.target_id and i.project_id = $2)
      when 'study' then (select s.title from studies s where s.id = k.target_id and s.project_id = $2)
      when 'document' then (select d.title from documents d where d.id = k.target_id and d.project_id = $2)
      else (select x.title from tickets x where x.id = k.target_id and x.project_id = $2) end as title,
    case when k.target_type = 'ticket' then (select x.number from tickets x where x.id = k.target_id) end as number,
    case when k.target_type = 'insight' then (select i.severity from insights i where i.id = k.target_id) end as severity,
    case when k.target_type = 'insight' then (select jsonb_array_length(i.evidence) from insights i where i.id = k.target_id) end as evidence_count,
    case when k.target_type = 'insight' then (select s.title from insights i join studies s on s.id = i.study_id where i.id = k.target_id) end as study_title
  from ticket_links k where k.ticket_id = $1
  union all
  select k.id, 'ticket', x.id, k.relation, true, x.title, x.number, null, null, null
  from ticket_links k join tickets x on x.id = k.ticket_id where k.target_type = 'ticket' and k.target_id = $1`;

async function detail(projectId: string, number: number) {
  const t = await ticketRow(projectId, number);
  const [watchers, links, activity, comments, reporters, others] = await Promise.all([
    query("select u.id, u.name, u.avatar from ticket_watchers w join users u on u.id = w.user_id where w.ticket_id = $1 order by u.name", [t.id]),
    query(LINKS_SQL, [t.id, projectId]),
    query(`select a.id, a.action, a.from_value, a.to_value, a.created_at, a.actor_id, u.name as actor_name, u.avatar as actor_avatar
           from ticket_activity a left join users u on u.id = a.actor_id where a.ticket_id = $1 order by a.created_at desc, a.id`, [t.id]),
    query(COMMENTS_SQL, [t.id]),
    query(`select id, ref, name, email, external_user_id, verified, first_seen, last_seen, reports_count, metadata, custom_data, attachments, erased_at, created_at
           from ticket_reporters where ticket_id = $1 order by created_at`, [t.id]),
    query<{ id: string; number: number; title: string }>("select id, number, title from tickets where project_id = $1 and id <> $2", [projectId, t.id]),
  ]);
  const similar = mostSimilar(t, others);
  return { ...t, watchers, links: links.filter((l) => l.title !== null), activity, comments, reporters, similar: similar ? { number: similar.number, title: similar.title } : null };
}

// ── Writes ──────────────────────────────────────────────────────
const log = (db: Db, ticketId: string, actor: string | null, action: string, from: string | null = null, to: string | null = null) =>
  db.query("insert into ticket_activity(ticket_id, actor_id, action, from_value, to_value) values ($1,$2,$3,$4,$5)", [ticketId, actor, action, from, to]);

const Fields = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000),
  type: z.enum(TICKET_TYPES),
  status: z.enum(TICKET_STATUSES),
  column: z.string().min(1).max(40),          // a column of the project's board; wins over status
  priority: z.enum(TICKET_PRIORITIES),
  due_date: isoDay.nullable(),
  milestone_id: z.string().uuid().nullable(),
  milestone_name: z.string().trim().min(1).max(120),   // creates the milestone when it does not exist yet
  assignees: z.array(z.string().uuid()).max(30),
  watchers: z.array(z.string().uuid()).max(50),
  labels: z.array(z.string().max(60)).max(40),
});
type Patch = Partial<z.infer<typeof Fields>>;
const LinkInput = z.object({
  target_type: z.enum(["insight", "study", "document", "ticket"]),
  target_id: z.string().uuid().optional(),
  target_number: z.number().int().positive().optional(),   // tickets are referred to by their number
  relation: z.string().trim().max(40).default("related"),
});

/** The milestone id a patch points to, creating the milestone by name when needed. undefined = not touched. */
async function milestoneFor(db: Db, projectId: string, p: Patch): Promise<{ id: string | null; name: string | null } | undefined> {
  if (p.milestone_name) {
    const { rows } = await db.query(
      `insert into milestones(project_id, name) values ($1,$2) on conflict (project_id, lower(name)) do update set name = milestones.name returning id, name`, [projectId, p.milestone_name]);
    return rows[0];
  }
  if (p.milestone_id === undefined) return undefined;
  if (p.milestone_id === null) return { id: null, name: null };
  const { rows } = await db.query("select id, name from milestones where id = $1 and project_id = $2", [p.milestone_id, projectId]);
  if (!rows[0]) throw new HttpError(400, "Ese milestone no pertenece a este proyecto");
  return rows[0];
}

function requirePeople(ids: string[] | undefined, people: Person[]) {
  if (!ids) return;
  const known = new Set(people.map((p) => p.id));
  if (ids.some((id) => !known.has(id))) throw new HttpError(400, "Solo se puede asignar o etiquetar a colaboradores del proyecto");
}

async function targetId(db: Db, projectId: string, l: z.infer<typeof LinkInput>): Promise<string> {
  const table = { insight: "insights", study: "studies", document: "documents", ticket: "tickets" }[l.target_type];
  const { rows } = l.target_type === "ticket" && l.target_number
    ? await db.query("select id from tickets where project_id = $1 and number = $2", [projectId, l.target_number])
    : await db.query(`select id from ${table} where id = $1 and project_id = $2`, [l.target_id ?? null, projectId]);
  if (!rows[0]) throw new HttpError(400, "Lo que quieres vincular no pertenece a este proyecto");
  return rows[0].id;
}

/** Creates a ticket with the next number of its project. Must run inside a transaction. */
export async function createTicket(db: Db, projectId: string, actor: string | null, b: Patch & { title: string; source?: "manual" | "insight" | "widget" }, people: Person[], lang = "es") {
  requirePeople(b.assignees, people);
  const { rows: [{ last: number }] } = await db.query(
    `insert into ticket_counters(project_id, last) values ($1, greatest(1, (select coalesce(max(number), 0) + 1 from tickets where project_id = $1)))
     on conflict (project_id) do update set last = ticket_counters.last + 1 returning last`, [projectId]);
  const cols = await boardColumns(projectId, db);
  // The asked column, else the first one for the asked status, else the first column of the board.
  const column = findColumn(cols, b.column, b.status ?? "todo") ?? cols[0];
  const ms = await milestoneFor(db, projectId, b);
  const { rows: [t] } = await db.query(
    `insert into tickets(project_id, number, title, description, type, status, priority, due_date, milestone_id, source, created_by, column_id, position)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning id, number`,
    [projectId, number, b.title, b.description ?? "", b.type ?? "task", column.status, b.priority ?? "medium", b.due_date ?? null, ms?.id ?? null, b.source ?? "manual", actor,
      column.custom ? column.id : null, await endOfColumn(db, projectId, column.id)]);
  for (const u of new Set(b.assignees ?? [])) await db.query("insert into ticket_assignees(ticket_id, user_id) values ($1,$2)", [t.id, u]);
  for (const l of cleanLabels(b.labels ?? [])) await db.query("insert into ticket_labels(ticket_id, label) values ($1,$2)", [t.id, l]);
  await log(db, t.id, actor, "created", null, b.source ?? "manual");
  await notify(db, { users: b.assignees ?? [], actor, projectId, ticketId: t.id, kind: "assigned", lang });
  return t as { id: string; number: number };
}

const STATUS_FIELDS = ["type", "priority"] as const;

/** Applies a patch to one ticket and records every change in its activity. */
async function applyPatch(db: Db, projectId: string, t: Record<string, any>, p: Patch, actor: string, people: Person[], lang = "es") {
  const tell = (users: (string | null | undefined)[], kind: "assigned" | "tagged" | "status", data?: Record<string, unknown>) => notify(db, { users, actor, projectId, ticketId: t.id, kind, data, lang });
  requirePeople(p.assignees, people);
  requirePeople(p.watchers, people);
  const nameOf = (id: string) => people.find((x) => x.id === id)?.name ?? "";
  const set: string[] = [], vals: unknown[] = [t.id];
  const col = (name: string, v: unknown) => { vals.push(v); set.push(`${name} = $${vals.length}`); };

  if (p.title !== undefined && p.title !== t.title) { col("title", p.title); await log(db, t.id, actor, "title", t.title, p.title); }
  if (p.description !== undefined && p.description !== t.description) { col("description", p.description); await log(db, t.id, actor, "description"); }
  for (const f of STATUS_FIELDS) {
    if (p[f] !== undefined && p[f] !== t[f]) { col(f, p[f]); await log(db, t.id, actor, f, t[f], p[f]); }
  }
  // A move names a column, or a status (the first column that counts as it). Asking for the status the ticket already has moves nothing.
  if (p.column !== undefined || (p.status !== undefined && p.status !== t.status)) {
    const cols = await boardColumns(projectId, db);
    const target = findColumn(cols, p.column, p.status);
    if (!target) throw new HttpError(400, "Esa columna no existe en el tablero de este proyecto");
    if (target.id !== t.column) {
      const from = cols.find((c) => c.id === t.column);
      col("status", target.status); col("column_id", target.custom ? target.id : null); col("position", await endOfColumn(db, projectId, target.id));
      const names = { from: from ? columnLabel(from) : t.status, to: columnLabel(target) };
      await log(db, t.id, actor, "status", names.from, names.to);
      // Everyone on the ticket hears that it moved (people added in this same edit hear "assigned"/"tagged" instead).
      await tell(await ticketPeople(db, t.id), "status", names);
    }
  }
  if (p.due_date !== undefined && p.due_date !== t.due_date) { col("due_date", p.due_date); await log(db, t.id, actor, "due_date", t.due_date, p.due_date); }
  const ms = await milestoneFor(db, projectId, p);
  if (ms && ms.id !== t.milestone_id) { col("milestone_id", ms.id); await log(db, t.id, actor, "milestone", t.milestone, ms.name); }

  if (p.assignees) {
    const d = setDiff<string>((t.assignees as { id: string }[]).map((a) => a.id), [...new Set(p.assignees)]);
    for (const u of d.added) { await db.query("insert into ticket_assignees(ticket_id, user_id) values ($1,$2) on conflict do nothing", [t.id, u]); await log(db, t.id, actor, "assigned", null, nameOf(u)); await tell([u], "assigned"); }
    for (const u of d.removed) { await db.query("delete from ticket_assignees where ticket_id = $1 and user_id = $2", [t.id, u]); await log(db, t.id, actor, "unassigned", (t.assignees as { id: string; name: string }[]).find((a) => a.id === u)?.name ?? null); }
  }
  if (p.watchers) {
    const cur = (await db.query("select user_id from ticket_watchers where ticket_id = $1", [t.id])).rows.map((r) => r.user_id as string);
    const d = setDiff<string>(cur, [...new Set(p.watchers)]);
    for (const u of d.added) { await db.query("insert into ticket_watchers(ticket_id, user_id) values ($1,$2) on conflict do nothing", [t.id, u]); await log(db, t.id, actor, "tagged", null, nameOf(u)); await tell([u], "tagged"); }
    for (const u of d.removed) { await db.query("delete from ticket_watchers where ticket_id = $1 and user_id = $2", [t.id, u]); await log(db, t.id, actor, "untagged", nameOf(u) || null); }
  }
  if (p.labels) {
    const d = setDiff<string>(t.labels as string[], cleanLabels(p.labels));
    for (const l of d.added) { await db.query("insert into ticket_labels(ticket_id, label) values ($1,$2) on conflict do nothing", [t.id, l]); await log(db, t.id, actor, "label_added", null, l); }
    for (const l of d.removed) { await db.query("delete from ticket_labels where ticket_id = $1 and label = $2", [t.id, l]); await log(db, t.id, actor, "label_removed", l); }
  }
  if (set.length) await db.query(`update tickets set ${set.join(", ")}, updated_at = now() where id = $1`, vals);
  else await db.query("update tickets set updated_at = now() where id = $1", [t.id]);
}

// ── Routes ──────────────────────────────────────────────────────
tickets.get("/", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id);
  const [rows, people, ms, next] = await Promise.all([
    listRows(p.id), projectPeople(p.id), milestones(p.id),
    one<{ n: number }>("select greatest(coalesce((select last from ticket_counters where project_id = $1), 0), coalesce((select max(number) from tickets where project_id = $1), 0)) + 1 as n", [p.id]),
  ]);
  res.json({ tickets: rows, columns: await boardColumns(p.id), people, milestones: ms, next_number: next!.n, role: p.role });
});

tickets.post("/", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const b = parse(Fields.partial().required({ title: true }).extend({ links: z.array(LinkInput).max(10).default([]) }), req.body);
  const people = await projectPeople(p.id);
  const t = await tx(async (c) => {
    const fromInsight = b.links.some((l) => l.target_type === "insight");
    const created = await createTicket(c, p.id, req.user!.id, { ...b, source: fromInsight ? "insight" : "manual" }, people, langOf(req));
    for (const l of b.links) {
      const target = await targetId(c, p.id, l);
      await c.query("insert into ticket_links(ticket_id, target_type, target_id, relation) values ($1,$2,$3,$4) on conflict do nothing", [created.id, l.target_type, target, l.relation]);
    }
    return created;
  });
  emailLater(req);
  res.status(201).json({ ticket: await detail(p.id, t.number) });
});

tickets.get("/:number", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id);
  res.json({ ticket: await detail(p.id, num(req)), role: p.role, columns: await boardColumns(p.id) });
});

tickets.patch("/:number", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const b = parse(patchOf(Fields), req.body);
  const people = await projectPeople(p.id);
  await tx(async (c) => applyPatch(c, p.id, await ticketRow(p.id, num(req), c), b, req.user!.id, people, langOf(req)));
  emailLater(req);
  res.json({ ticket: await detail(p.id, num(req)) });
});

/** Board drag and drop: new column and place inside it. `before` is the number of the card it lands above (null = end). */
tickets.post("/move", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const b = parse(z.object({ number: z.number().int().positive(), column: z.string().min(1).max(40).optional(), status: z.enum(TICKET_STATUSES).optional(), before: z.number().int().positive().nullable().default(null) }), req.body);
  await tx(async (c) => {
    const t = await ticketRow(p.id, b.number, c);
    const cols = await boardColumns(p.id, c);
    const target = findColumn(cols, b.column, b.status);
    if (!target) throw new HttpError(400, "Esa columna no existe en el tablero de este proyecto");
    const column = (await c.query(`select id, number from tickets where project_id = $1 and ${IN_COLUMN(2)} order by position, number for update`, [p.id, target.id])).rows as { id: string; number: number }[];
    const before = column.find((x) => x.number === b.before)?.id ?? null;
    const order = reorder(column.map((x) => x.id).concat(column.some((x) => x.id === t.id) ? [] : [t.id]), t.id, before);
    for (let i = 0; i < order.length; i++) await c.query("update tickets set position = $2 where id = $1", [order[i], (i + 1) * 1024]);
    if (t.column !== target.id) {
      const from = cols.find((x) => x.id === t.column);
      const names = { from: from ? columnLabel(from) : t.status, to: columnLabel(target) };
      await c.query("update tickets set status = $2, column_id = $3, updated_at = now() where id = $1", [t.id, target.status, target.custom ? target.id : null]);
      await log(c, t.id, req.user!.id, "status", names.from, names.to);
      await notify(c, { users: await ticketPeople(c, t.id), actor: req.user!.id, projectId: p.id, ticketId: t.id, kind: "status", data: names, lang: langOf(req) });
    }
  });
  emailLater(req);
  res.json({ tickets: await listRows(p.id) });
});

// ── Board columns ───────────────────────────────────────────────
const ColumnsInput = z.object({
  columns: z.array(z.object({ id: z.string().min(1).max(40).optional(), name: z.string().trim().min(1).max(40), status: z.enum(TICKET_STATUSES) })).min(1).max(MAX_COLUMNS),
  moves: z.record(z.string(), z.string()).default({}),   // removed column id → the kept column its tickets go to
});
const COLUMN_PROBLEMS = {
  count: `El tablero necesita entre 2 y ${MAX_COLUMNS} columnas`, name: "Cada columna necesita un nombre de hasta 40 caracteres",
  duplicate: "Dos columnas no pueden llamarse igual", todo: "Al menos una columna debe contar como Por hacer", done: "Al menos una columna debe contar como Hecho",
  done_last: "Las columnas que cuentan como Hecho van al final del tablero",
};

/** Saves the whole board: the list in its new order. Columns left out are removed and their tickets moved; a column whose status changed takes its tickets with it. */
tickets.put("/columns", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const b = parse(ColumnsInput, req.body);
  const problem = columnsProblem(b.columns);
  if (problem) throw new HttpError(400, COLUMN_PROBLEMS[problem]);
  await tx(async (c) => {
    await c.query("select id from projects where id = $1 for update", [p.id]);   // one board edit at a time
    let current = await boardColumns(p.id, c);
    const alias = new Map<string, string>();   // built-in key → the row that replaces it
    if (!current[0].custom) {
      // First edit: the built-in columns become rows of this project, and every ticket is tied to its column.
      for (const [i, col] of current.entries()) {
        const { rows: [row] } = await c.query("insert into ticket_columns(project_id, name, status, position) values ($1,$2,$3,$4) returning id", [p.id, builtInName(col.status, langOf(req)), col.status, i]);
        await c.query("update tickets set column_id = $2 where project_id = $1 and status = $3", [p.id, row.id, col.status]);
        alias.set(col.id, row.id);
      }
      current = await boardColumns(p.id, c);
    }
    const real = (id: string | undefined) => (id === undefined ? undefined : alias.get(id) ?? id);
    const known = new Set(current.map((x) => x.id));
    const kept: { id: string; status: TicketStatus }[] = [];
    for (const [i, col] of b.columns.entries()) {
      const id = real(col.id);
      if (id !== undefined && !known.has(id)) throw new HttpError(400, "Esa columna no existe en el tablero de este proyecto");
      if (id !== undefined && kept.some((k) => k.id === id)) throw new HttpError(400, "Dos columnas no pueden llamarse igual");
      if (id === undefined) {
        const { rows: [row] } = await c.query("insert into ticket_columns(project_id, name, status, position) values ($1,$2,$3,$4) returning id", [p.id, col.name, col.status, i]);
        kept.push({ id: row.id, status: col.status });
      } else {
        await c.query("update ticket_columns set name = $2, status = $3, position = $4 where id = $1", [id, col.name, col.status, i]);
        // The column now counts as something else: so do the tickets in it.
        await c.query("update tickets set status = $2 where column_id = $1 and status <> $2", [id, col.status]);
        kept.push({ id, status: col.status });
      }
    }
    for (const gone of current.filter((x) => !kept.some((k) => k.id === x.id))) {
      const chosen = real(b.moves[gone.id] ?? Object.entries(b.moves).find(([from]) => real(from) === gone.id)?.[1]);
      const to = fallbackColumn(gone, kept, chosen);
      // Appended after what is already there, keeping their order.
      await c.query(
        `update tickets set column_id = $2, status = $3, position = position + (select coalesce(max(position), 0) + 1024 from tickets where column_id = $2)
         where column_id = $1`, [gone.id, to.id, to.status]);
      await c.query("delete from ticket_columns where id = $1", [gone.id]);
    }
  });
  res.json({ columns: await boardColumns(p.id), tickets: await listRows(p.id) });
});

/** Back to the four built-in columns. Each ticket lands in the column of the status its column counted as. */
tickets.delete("/columns", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  await tx(async (c) => {
    await c.query("update tickets set column_id = null where project_id = $1", [p.id]);
    await c.query("delete from ticket_columns where project_id = $1", [p.id]);
  });
  res.json({ columns: await boardColumns(p.id), tickets: await listRows(p.id) });
});

const Numbers = z.array(z.number().int().positive()).min(1).max(200);

tickets.post("/bulk", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const b = parse(z.object({
    numbers: Numbers,
    patch: Fields.pick({ status: true, column: true, priority: true, milestone_id: true, assignees: true }).partial().extend({ add_labels: z.array(z.string().max(60)).max(20).optional() }),
  }), req.body);
  const people = await projectPeople(p.id);
  await tx(async (c) => {
    for (const n of new Set(b.numbers)) {
      const t = await ticketRow(p.id, n, c);
      const { add_labels, ...patch } = b.patch;
      await applyPatch(c, p.id, t, add_labels ? { ...patch, labels: [...(t.labels as string[]), ...add_labels] } : patch, req.user!.id, people, langOf(req));
    }
  });
  emailLater(req);
  res.json({ tickets: await listRows(p.id) });
});

/** Deleting takes the comments and the history with it; linked insights stay and simply lose the link. Owners only. */
tickets.post("/delete", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "owner");
  const b = parse(z.object({ numbers: Numbers }), req.body);
  await tx(async (c) => {
    const ids = (await c.query("select id from tickets where project_id = $1 and number = any($2::int[])", [p.id, b.numbers])).rows.map((r) => r.id);
    await c.query("delete from ticket_links where target_type = 'ticket' and target_id = any($1::uuid[])", [ids]);
    await c.query("delete from tickets where id = any($1::uuid[])", [ids]);
  });
  res.json({ tickets: await listRows(p.id) });
});

tickets.post("/:number/links", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const b = parse(LinkInput, req.body);
  await tx(async (c) => {
    const t = await ticketRow(p.id, num(req), c);
    const target = await targetId(c, p.id, b);
    if (b.target_type === "ticket" && target === t.id) throw new HttpError(400, "Un ticket no se puede vincular consigo mismo");
    const r = await c.query("insert into ticket_links(ticket_id, target_type, target_id, relation) values ($1,$2,$3,$4) on conflict do nothing returning id", [t.id, b.target_type, target, b.relation]);
    if (r.rows[0]) await log(c, t.id, req.user!.id, "linked", null, b.target_type);
  });
  res.status(201).json({ ticket: await detail(p.id, num(req)) });
});

tickets.delete("/:number/links/:linkId", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const t = await ticketRow(p.id, num(req));
  // The link may be stored on this ticket or on the ticket that points to it.
  const r = await query<{ target_type: string }>("delete from ticket_links where id = $1 and (ticket_id = $2 or (target_type = 'ticket' and target_id = $2)) returning target_type", [req.params.linkId, t.id]);
  if (r[0]) await log(pool, t.id, req.user!.id, "unlinked", r[0].target_type);
  res.json({ ticket: await detail(p.id, t.number) });
});

/** What converting a ticket takes: the insight's fields as the person edited them. Anything left out comes from the ticket. */
const ToInsightInput = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  body: z.string().max(20000).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
}).strict();

/**
 * Turns the ticket into an insight of the project, linked with relation "converted" (a ticket created
 * FROM an insight uses "evidence"). A ticket converts once: a second call is refused, so no duplicate insight.
 */
tickets.post("/:number/insight", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const b = parse(ToInsightInput, req.body ?? {});
  await tx(async (c) => {
    const t = await ticketRow(p.id, num(req), c);
    await c.query("select id from tickets where id = $1 for update", [t.id]);
    if (t.converted_insight_id) throw new HttpError(409, "Este ticket ya se convirtió en un insight");
    const title = b.title ?? t.title;
    const { rows: [i] } = await c.query(
      "insert into insights(project_id, created_by, title, body, tags, severity) values ($1,$2,$3,$4,$5,$6) returning id",
      [p.id, req.user!.id, title, b.body ?? t.description, b.tags ?? t.labels, b.severity ?? severityFromPriority(t.priority as TicketPriority)]);
    await c.query("insert into ticket_links(ticket_id, target_type, target_id, relation) values ($1,'insight',$2,'converted')", [t.id, i.id]);
    await log(c, t.id, req.user!.id, "insight_created", null, title);
  });
  res.status(201).json({ ticket: await detail(p.id, num(req)) });
});

// Conversation: internal comments (commenters and up) and emails to the reporter of a widget ticket (editors).
tickets.post("/:number/comments", async (req, res) => {
  const b = parse(z.object({ body: z.string().trim().min(1).max(4000), visibility: z.enum(["internal", "email_to_reporter"]).default("internal") }), req.body);
  const p = await requireProject(pid(req), req.user!.id, b.visibility === "internal" ? "commenter" : "editor");
  const t = await ticketRow(p.id, num(req));
  if (b.visibility === "email_to_reporter") {
    const r = await one<{ email: string | null }>("select email from ticket_reporters where ticket_id = $1 and email is not null order by created_at limit 1", [t.id]);
    if (!r?.email) throw new HttpError(400, "Este ticket no tiene a quién responder por correo");
    try { await sendMail(r.email, `Re: ${t.title} (#${t.number})`, b.body); }
    catch { throw new HttpError(502, "No se pudo enviar el correo. Inténtalo de nuevo."); }
  }
  const people = await projectPeople(p.id);
  await tx(async (c) => {
    await c.query("insert into comments(project_id, ticket_id, user_id, body, visibility) values ($1,$2,$3,$4,$5)", [p.id, t.id, req.user!.id, b.body, b.visibility]);
    const before = await ticketPeople(c, t.id);
    const mentioned = b.visibility === "internal" ? mentionedIds(b.body, people) : [];
    // People mentioned with @ start following the ticket.
    for (const u of mentioned) {
      const r = await c.query("insert into ticket_watchers(ticket_id, user_id) values ($1,$2) on conflict do nothing returning user_id", [t.id, u]);
      if (r.rows[0]) await log(c, t.id, req.user!.id, "tagged", null, people.find((x) => x.id === u)?.name ?? null);
    }
    // A mention is its own notice; everyone else already on the ticket hears there is a new comment.
    const base = { actor: req.user!.id, projectId: p.id, ticketId: t.id, lang: langOf(req) };
    await notify(c, { ...base, users: mentioned, kind: "tagged" });
    await notify(c, { ...base, users: before.filter((u) => !mentioned.includes(u)), kind: "comment", data: { excerpt: b.body.replace(/\s+/g, " ").slice(0, 160) } });
    await c.query("update tickets set updated_at = now() where id = $1", [t.id]);
  });
  emailLater(req);
  res.status(201).json({ ticket: await detail(p.id, t.number) });
});

tickets.delete("/:number/comments/:commentId", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "commenter");
  const t = await ticketRow(p.id, num(req));
  const c = await one<{ user_id: string | null }>("select user_id from comments where id = $1 and ticket_id = $2", [req.params.commentId, t.id]);
  if (!c) throw notFound("Comentario");
  if (c.user_id !== req.user!.id && !atLeast(p.role, "owner")) throw new HttpError(403, "Solo puedes borrar tus propios comentarios");
  await query("delete from comments where id = $1", [req.params.commentId]);
  res.json({ ticket: await detail(p.id, t.number) });
});

/** Merges this ticket into another: its conversation, people, links and reporter move there, and this one is removed. */
tickets.post("/:number/merge", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const b = parse(z.object({ into: z.number().int().positive() }), req.body);
  if (b.into === num(req)) throw new HttpError(400, "Un ticket no se puede fusionar consigo mismo");
  await tx(async (c) => {
    const from = await ticketRow(p.id, num(req), c), into = await ticketRow(p.id, b.into, c);
    await c.query("update comments set ticket_id = $2 where ticket_id = $1", [from.id, into.id]);
    await c.query("update ticket_reporters set ticket_id = $2 where ticket_id = $1", [from.id, into.id]);
    await c.query("insert into ticket_watchers(ticket_id, user_id) select $2, user_id from ticket_watchers where ticket_id = $1 on conflict do nothing", [from.id, into.id]);
    await c.query("insert into ticket_assignees(ticket_id, user_id) select $2, user_id from ticket_assignees where ticket_id = $1 on conflict do nothing", [from.id, into.id]);
    await c.query("insert into ticket_labels(ticket_id, label) select $2, label from ticket_labels where ticket_id = $1 on conflict do nothing", [from.id, into.id]);
    await c.query(`insert into ticket_links(ticket_id, target_type, target_id, relation)
      select $2, target_type, target_id, relation from ticket_links where ticket_id = $1 and not (target_type = 'ticket' and target_id = $2) on conflict do nothing`, [from.id, into.id]);
    await c.query("delete from ticket_links where target_type = 'ticket' and target_id = $1", [from.id]);
    await c.query("insert into comments(project_id, ticket_id, user_id, body, visibility) values ($1,$2,$3,$4,'internal')",
      [p.id, into.id, req.user!.id, `#${from.number} · ${from.title}${from.description ? `\n\n${from.description}` : ""}`]);
    await log(c, into.id, req.user!.id, "merged", `#${from.number}`, null);
    await c.query("delete from tickets where id = $1", [from.id]);
  });
  res.json({ ticket: await detail(p.id, b.into) });
});

/** Deletes the reporter's personal data (name, email, user id, device and custom data, attachments). The ticket and its text stay. */
tickets.delete("/:number/reporter", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const t = await ticketRow(p.id, num(req));
  const before = await query<{ attachments: Attachments }>("select attachments from ticket_reporters where ticket_id = $1", [t.id]);
  await query(`update ticket_reporters set name = null, email = null, external_user_id = null, verified = false, first_seen = null, last_seen = null,
    metadata = '{}', custom_data = '{}', attachments = '{}', erased_at = now() where ticket_id = $1`, [t.id]);
  await removeUploads(before.flatMap((r) => attachmentUrls(r.attachments)));
  await log(pool, t.id, req.user!.id, "reporter_erased");
  res.json({ ticket: await detail(p.id, t.number) });
});

/** What the feedback widget stored with a report. */
type Attachments = { screenshot?: string; recording?: string; files?: { url: string; name: string }[] };
const attachmentUrls = (a: Attachments) => [a.screenshot, a.recording, ...(a.files ?? []).map((f) => f.url)].filter((u): u is string => !!u);
/** Deletes stored widget uploads (bytes and their `uploads` row). A file already gone is not an error. */
async function removeUploads(urls: string[]) {
  const names = urls.map((u) => /^\/uploads\/([a-z0-9]+\.[a-z0-9]+)$/.exec(u)?.[1]).filter((n): n is string => !!n);
  if (!names.length) return;
  await Promise.all(names.map((n) => unlink(path.join(UPLOAD_DIR, n)).catch(() => {})));
  await query("delete from uploads where filename = any($1)", [names]);
}

/**
 * Removes one attachment (screenshot, recording or file) that came with a widget report, for example a screenshot that shows
 * private data or a file nobody needs. The report's text stays. Editors and owners only.
 */
tickets.delete("/:number/attachments", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const t = await ticketRow(p.id, num(req));
  const { url } = parse(z.object({ url: z.string().min(1).max(300) }), req.body);
  const reporters = await query<{ id: string; attachments: Attachments }>("select id, attachments from ticket_reporters where ticket_id = $1", [t.id]);
  const owner = reporters.find((r) => attachmentUrls(r.attachments).includes(url));
  if (!owner) throw notFound("Adjunto");
  const a = owner.attachments;
  const name = a.screenshot === url ? "screenshot" : a.recording === url ? "recording" : a.files?.find((f) => f.url === url)?.name ?? "file";
  const next: Attachments = { ...a };
  if (next.screenshot === url) delete next.screenshot;
  if (next.recording === url) delete next.recording;
  if (next.files) { next.files = next.files.filter((f) => f.url !== url); if (!next.files.length) delete next.files; }
  await query("update ticket_reporters set attachments = $2 where id = $1", [owner.id, JSON.stringify(next)]);
  await removeUploads([url]);
  await log(pool, t.id, req.user!.id, "attachment_removed", name, null);
  res.json({ ticket: await detail(p.id, t.number) });
});
