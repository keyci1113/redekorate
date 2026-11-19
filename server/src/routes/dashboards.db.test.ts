// Dashboard figures against a real PostgreSQL. Same setup as tickets.db.test.ts: needs TEST_DATABASE_URL (a database whose name ends in _test).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;
let server: Server, base = "", project = "", other = "", ownerId = "";
let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const cookie: Record<string, string> = {};
let closePool = async () => {};
const get = async (as: string, path: string) => {
  const res = await fetch(`${base}/api/dashboards/${path}`, { headers: { cookie: cookie[as] } });
  return { status: res.status, body: (await res.json()) as any };
};

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, { dashboards }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"), import("./dashboards.js"), import("../lib/http.js"),
  ]);
  closePool = () => pool.end();
  db = pool;
  await migrate();
  await pool.query("truncate users cascade");
  const ids: Record<string, string> = {};
  for (const who of ["owner", "stranger"]) {
    const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ($1,$2,'x', now()) returning id, email, name", [`${who}@dash.local`, who]);
    ids[who] = u.id;
    auth.signSession({ cookie: (n: string, v: string) => { cookie[who] = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  }
  ownerId = ids.owner;
  project = (await pool.query("insert into projects(owner_id, name) values ($1,'Fintech') returning id", [ids.owner])).rows[0].id;
  other = (await pool.query("insert into projects(owner_id, name) values ($1,'Tienda') returning id", [ids.owner])).rows[0].id;
  await pool.query("insert into projects(owner_id, name, archived) values ($1,'Archivado', true)", [ids.owner]);
  const ms = (await pool.query("insert into milestones(project_id, name) values ($1,'Cierre v2') returning id", [project])).rows[0].id;
  // number, project, status, created (days ago), due (days from today), closed (days ago), milestone, assigned
  const rows: [number, string, string, number, number | null, number | null, boolean, boolean][] = [
    [1, project, "todo", 1, 5, null, true, true],
    [2, project, "in_progress", 2, -2, null, true, true],      // overdue, in the milestone
    [3, project, "in_review", 20, -10, null, false, false],    // overdue for more than a week, unassigned
    [4, project, "done", 10, null, 6, true, true],             // closed after 4 days
    [5, project, "done", 9, null, 1, false, true],             // closed after 8 days
    [6, other, "todo", 40, null, null, false, false],
  ];
  for (const [number, pid, status, created, due, closed, inMs, assigned] of rows) {
    const { rows: [t] } = await pool.query(
      `insert into tickets(project_id, number, title, status, due_date, milestone_id, created_by, created_at, updated_at, source)
       values ($1,$2,$3,$4, case when $5::int is null then null else current_date + $5::int end, $6, $7, now() - ($8 || ' days')::interval, now(), $9) returning id`,
      [pid, number, `T${number}`, status, due, inMs ? ms : null, ids.owner, created, number === 1 ? "widget" : "manual"]);
    if (assigned) await pool.query("insert into ticket_assignees(ticket_id, user_id) values ($1,$2)", [t.id, ids.owner]);
    if (closed !== null) await pool.query("insert into ticket_activity(ticket_id, actor_id, action, from_value, to_value, created_at) values ($1,$2,'status','todo','done', now() - ($3 || ' days')::interval)", [t.id, ids.owner, closed]);
    if (number === 1) await pool.query(`insert into ticket_reporters(ticket_id, metadata) values ($1, '{"page_url":"https://shop.example/caja/?x=1"}')`, [t.id]);
  }
  // Studies for the drill-downs, in the second project: a live survey with one of two sessions finished, a draft card sort, and two insights.
  const live = (await pool.query("insert into studies(project_id, owner_id, title, method, status, public_slug) values ($1,$2,'Encuesta','survey','live','dash-live') returning id", [other, ids.owner])).rows[0].id;
  await pool.query("insert into studies(project_id, owner_id, title, method, public_slug) values ($1,$2,'Card sort','card_sort','dash-draft')", [other, ids.owner]);
  await pool.query("insert into sessions(study_id, participant, completed_at) values ($1, '{}', now() - interval '1 day'), ($1, '{}', null)", [live]);
  await pool.query("insert into insights(project_id, study_id, created_by, title, severity) values ($1,$2,$3,'Pago confuso','critical'), ($1,null,$3,'Menú largo','low')", [other, live, ids.owner]);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/dashboards", dashboards);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); });

test("ticket figures count open, overdue and closed tickets and the median time to close", { skip }, async () => {
  const { body: d } = await get("owner", "tickets?period=30");
  const x = d.totals;
  assert.deepEqual([x.open, x.todo, x.in_progress, x.in_review], [4, 2, 1, 1]);
  assert.equal(x.overdue, 2);
  assert.equal(x.overdue_last_week, 1);          // only #3 was already overdue a week ago
  assert.equal(x.oldest_days_late, 10);
  assert.equal(x.closed_period, 2);
  assert.equal(Math.round(x.median_days), 6);    // median of 4 and 8 days
  assert.equal(x.source_widget, 1);
  // The "Created" and "Closed" tiles follow the period, with the period before for comparison.
  assert.deepEqual([x.created_period, x.created_period_widget, x.closed_period, x.closed_prev_period], [5, 1, 2, 0]);
  assert.equal((await get("owner", "tickets?period=7")).body.totals.created_period, 2);   // #1 and #2
  assert.equal((await get("owner", "tickets?period=7")).body.totals.created_prev_period, 2); // #4 and #5
  assert.equal(d.weeks.length, 8);
  assert.equal(d.weeks.reduce((n: number, w: any) => n + w.closed, 0), 2);
  assert.deepEqual(d.people.map((p: any) => [p.name, p.open, p.overdue]), [["owner", 2, 1], [null, 2, 1]]);
  assert.deepEqual(d.due.map((r: any) => r.number), [3, 2]);
});

test("the project filter narrows every figure, and archived projects are left out", { skip }, async () => {
  const one = (await get("owner", `tickets?project=${other}`)).body;
  assert.equal(one.totals.open, 1);
  assert.deepEqual(one.projects.map((p: any) => p.name), ["Fintech", "Tienda"]);
});

test("the projects dashboard derives milestone state and project health from the tickets", { skip }, async () => {
  const { body: d } = await get("owner", "projects");
  const fintech = d.rows.find((r: any) => r.id === project), tienda = d.rows.find((r: any) => r.id === other);
  assert.deepEqual([fintech.open_tickets, fintech.overdue, fintech.health], [3, 2, "at_risk"]);
  assert.deepEqual([fintech.next_milestone.name, fintech.next_milestone.state, fintech.next_milestone.progress], ["Cierre v2", "behind", 33]);
  assert.deepEqual([tienda.open_tickets, tienda.overdue, tienda.next_milestone], [1, 0, null]);
  assert.equal(d.rows.length, 2);
});

test("ticket drill-downs list exactly the tickets behind each figure", { skip }, async () => {
  const numbers = async (q: string) => {
    const { status, body } = await get("owner", `tickets/items?${q}`);
    assert.equal(status, 200, q);
    assert.equal(body.total, body.items.length, q);
    return body.items.map((t: any) => t.number);
  };
  assert.deepEqual(await numbers("by=open"), [3, 2, 1, 6]);              // most overdue first, no due date last
  assert.deepEqual(await numbers("by=overdue"), [3, 2]);
  assert.deepEqual(await numbers("by=status&value=todo"), [1, 6]);
  assert.deepEqual(await numbers("by=closed_period"), [5, 4]);           // last closed first
  assert.deepEqual(await numbers("by=created_period&period=7"), [1, 2]);
  assert.deepEqual(await numbers("by=assignee&value=none"), [3, 6]);
  assert.deepEqual(await numbers("by=source&value=widget"), [1]);
  assert.deepEqual(await numbers("by=page&value=/caja"), [1]);
  assert.deepEqual(await numbers("by=page&value=/otra"), []);
  assert.deepEqual(await numbers(`by=overdue&project=${other}`), []);
  const [first] = (await get("owner", "tickets/items?by=overdue")).body.items;
  assert.deepEqual([first.project_name, first.assignees, first.due_date.length], ["Fintech", null, 10]);
  // a value that does not fit the figure is refused
  assert.equal((await get("owner", "tickets/items?by=status&value=archived")).status, 400);
  assert.equal((await get("owner", "tickets/items?by=assignee&value=nobody")).status, 400);
  assert.equal((await get("owner", "tickets/items?by=everything")).status, 400);
});

test("study drill-downs list the studies or insights behind each figure", { skip }, async () => {
  const items = async (q: string) => (await get("owner", `studies/items?${q}`)).body;
  const live = await items("by=live");
  assert.deepEqual(live.items.map((s: any) => [s.title, s.started, s.finished, s.n]), [["Encuesta", 2, 1, null]]);
  assert.deepEqual((await items("by=method&value=card_sort")).items.map((s: any) => s.title), ["Card sort"]);
  assert.deepEqual((await items("by=responses_week")).items.map((s: any) => [s.title, s.n]), [["Encuesta", 1]]);
  assert.deepEqual((await items("by=participants")).items.map((s: any) => [s.title, s.n]), [["Encuesta", 2]]);
  const day = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);   // a week from three days ago holds yesterday in any time zone
  assert.equal((await items(`by=day&value=${day}&bucket=week`)).items.length, 1);
  const insights = await items("by=severity");
  assert.equal(insights.kind, "insights");
  assert.deepEqual(insights.items.map((i: any) => [i.title, i.study_title]), [["Pago confuso", "Encuesta"], ["Menú largo", null]]);
  assert.deepEqual((await items("by=severity&value=low")).items.map((i: any) => i.title), ["Menú largo"]);
  assert.equal((await items(`by=live&project=${project}`)).total, 0);
  assert.equal((await get("owner", "studies/items?by=day&value=yesterday")).status, 400);
  // someone without access sees nothing
  assert.equal((await get("stranger", "studies/items?by=live")).body.total, 0);
  assert.equal((await get("stranger", "tickets/items?by=open")).body.total, 0);
});

test("people only see the projects they can open", { skip }, async () => {
  const { body: d } = await get("stranger", "tickets");
  assert.equal(d.totals.open, 0);
  assert.deepEqual(d.projects, []);
  assert.equal((await get("stranger", "projects")).body.rows.length, 0);
  assert.equal((await fetch(`${base}/api/dashboards/tickets`)).status, 401);
  assert.equal((await get("owner", "tickets?period=year")).status, 400);
});

test("the studies figures follow the period and count each insight that became a ticket once", { skip }, async () => {
  const insight = async (title: string) => (await db.query("select id from insights where title = $1", [title])).rows[0].id;
  const [pay, menu] = [await insight("Pago confuso"), await insight("Menú largo")];
  const t6 = (await db.query("select id from tickets where number = 6")).rows[0].id;
  const t3 = (await db.query("select id from tickets where number = 3")).rows[0].id;
  // #6 was created from "Pago confuso"; "Menú largo" was made FROM ticket #3 (converted), which is the other direction.
  await db.query("insert into ticket_links(ticket_id, target_type, target_id, relation) values ($1,'insight',$2,'evidence'), ($3,'insight',$4,'converted')", [t6, pay, t3, menu]);
  const { body: d } = await get("owner", "studies?period=30");
  assert.equal(d.severity.with_tickets, 1);
  assert.equal(d.severity.critical + d.severity.high + d.severity.medium + d.severity.low, d.totals.insights, "the severity bars add up to the New insights tile");
  assert.deepEqual([d.totals.responses_period, d.totals.responses_prev_period], [1, 0]);
  assert.deepEqual(d.live.map((s: any) => [s.title, s.attention]), [["Encuesta", null]], "two sessions are too few to judge completion");
  await db.query("delete from ticket_links where ticket_id in ($1, $2)", [t6, t3]);
});

test("one rule decides which studies need attention and how healthy a project is", { skip }, async () => {
  // A study live for three days without a single response: silent.
  const quiet = (await db.query("insert into projects(owner_id, name) values ($1,'Silencio') returning id", [ownerId])).rows[0].id;
  const study = (await db.query("insert into studies(project_id, owner_id, title, method, status, public_slug, published_at) values ($1,$2,'Mudo','survey','live','dash-mute', now() - interval '3 days') returning id", [quiet, ownerId])).rows[0].id;
  const s = (await get("owner", `studies?project=${quiet}`)).body;
  assert.deepEqual(s.live.map((x: any) => [x.title, x.attention]), [["Mudo", "silent"]]);
  const row = (await get("owner", "projects")).body.rows.find((r: any) => r.id === quiet);
  // Nothing happened this week, but its study needs attention: that is not "quiet".
  assert.deepEqual([row.studies_attention, row.health], [1, "needs_attention"]);
  // A milestone due soon with open work is at risk, and the project is not "on track".
  const ms = (await db.query("insert into milestones(project_id, name, due_date) values ($1,'Pronto', current_date + 5) returning id", [quiet])).rows[0].id;
  await db.query("insert into tickets(project_id, number, title, status, milestone_id, created_by, source) values ($1, 1, 'Abierto', 'todo', $2, $3, 'manual')", [quiet, ms, ownerId]);
  await db.query("delete from studies where id = $1", [study]);
  const again = (await get("owner", "projects")).body.rows.find((r: any) => r.id === quiet);
  assert.deepEqual([again.studies_attention, again.milestones_at_risk, again.health], [0, 1, "needs_attention"]);
  await db.query("delete from projects where id = $1", [quiet]);
});

test("the projects list counts UX documents and diagrams apart, as the project tabs do", { skip }, async () => {
  const { listProjects } = await import("../services/projects.js");
  await db.query(`insert into documents(project_id, owner_id, kind, title) values
    ($1,$2,'text','Plan'), ($1,$2,'persona','Ana'), ($1,$2,'diagram','Flujo'), ($1,$2,'sitemap','Mapa'), ($1,$2,'moodboard','Tablero')`, [other, ownerId]);
  const { projects } = await listProjects({ id: ownerId } as any);
  const tienda = projects.find((p: any) => p.id === other);
  assert.deepEqual([tienda.document_count, tienda.diagram_count], [2, 3]);
  await db.query("delete from documents where project_id = $1", [other]);
});
