// Milestones, roadmap sharing and My work against a real PostgreSQL. Needs TEST_DATABASE_URL (a database whose name ends in _test).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;
let server: Server, base = "", project = "";
const cookie: Record<string, string> = {}, ids: Record<string, string> = {};
let closePool = async () => {};
let sql: (text: string, params?: unknown[]) => Promise<any[]> = async () => [];
async function call(as: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { ...(as ? { cookie: cookie[as] } : {}), "content-type": "application/json", "x-lang": "en" } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const M = () => `/projects/${project}/milestones`;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, r, { publicApi }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"), import("./roadmap.js"), import("./public.js"), import("../lib/http.js"),
  ]);
  closePool = () => pool.end();
  sql = async (text, params) => (await pool.query(text, params)).rows;
  await migrate();
  await pool.query("truncate users cascade");
  for (const who of ["owner", "editor", "viewer", "stranger"]) {
    const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ($1,$2,'x', now()) returning id, email, name", [`${who}@road.local`, who]);
    ids[who] = u.id;
    auth.signSession({ cookie: (n: string, v: string) => { cookie[who] = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  }
  project = (await sql("insert into projects(owner_id, name) values ($1,'Fintech') returning id", [ids.owner]))[0].id;
  for (const who of ["editor", "viewer"]) await sql("insert into project_members(project_id, user_id, role) values ($1,$2,$3)", [project, ids[who], who]);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/projects/:id/milestones", r.milestones);
  app.use("/api/projects/:id/roadmap", r.roadmap);
  app.use("/api/my-work", r.myWork);
  app.use("/api/public", publicApi);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); });

/** A ticket inserted directly: number, status, due (days from today), milestone, assignee. */
async function ticket(number: number, status: string, due: number | null, milestone: string | null, assignee: string | null, createdBy = ids.owner) {
  const [t] = await sql(`insert into tickets(project_id, number, title, status, due_date, milestone_id, created_by)
    values ($1,$2,$3,$4, case when $5::int is null then null else current_date + $5::int end, $6, $7) returning id`, [project, number, `T${number}`, status, due, milestone, createdBy]);
  if (assignee) await sql("insert into ticket_assignees(ticket_id, user_id) values ($1,$2)", [t.id, assignee]);
  return t.id as string;
}

test("milestones follow the project roles and refuse bad input", { skip }, async () => {
  assert.equal((await call("stranger", "GET", M())).status, 404);
  assert.equal((await call("viewer", "POST", M(), { name: "No" })).status, 403);
  const made = await call("editor", "POST", M(), { name: "Cierre v2", start_date: "2026-11-03", due_date: "2026-12-12" });
  assert.equal(made.status, 201);
  const id = made.body.milestones[0].id;
  assert.equal((await call("editor", "POST", M(), { name: "cierre V2" })).status, 400, "same name, different case");
  assert.equal((await call("editor", "POST", M(), { name: "Al revés", start_date: "2026-12-01", due_date: "2026-11-01" })).status, 400);
  assert.equal((await call("editor", "PATCH", `${M()}/${id}`, { name: "Cierre de caja v2", start_date: null, due_date: "2026-12-12" })).body.milestones[0].name, "Cierre de caja v2");
  assert.equal((await call("editor", "DELETE", `${M()}/${id}`)).status, 403);
  assert.equal((await call("viewer", "GET", M())).body.milestones.length, 1);
});

test("a milestone's counts, dates and state come from its tickets", { skip }, async () => {
  const id = (await call("viewer", "GET", M())).body.milestones[0].id;
  await ticket(1, "done", null, id, ids.owner);
  await ticket(2, "in_progress", 20, id, ids.owner);
  await ticket(3, "todo", 40, id, null);            // unassigned → at risk
  let m = (await call("viewer", "GET", M())).body.milestones[0];
  assert.deepEqual([m.total, m.todo, m.in_progress, m.in_review, m.done, m.progress, m.unassigned_open, m.state], [3, 1, 1, 0, 1, 33, 1, "at_risk"]);
  assert.equal(m.end_date, "2026-12-12", "its own due date wins over the tickets'");
  await ticket(4, "todo", -3, id, ids.owner);        // overdue → behind
  m = (await call("viewer", "GET", M())).body.milestones[0];
  assert.deepEqual([m.overdue_open, m.state], [1, "behind"]);
  // A milestone without dates takes them from its tickets; one that has not started is planned.
  const later = (await call("editor", "POST", M(), { name: "Inventario", start_date: "2999-01-12", due_date: "2999-03-06" })).body.milestones.find((x: any) => x.name === "Inventario");
  assert.equal(later.state, "planned");
});

test("deleting a milestone keeps its tickets", { skip }, async () => {
  const list = (await call("viewer", "GET", M())).body.milestones;
  const id = list.find((x: any) => x.name === "Cierre de caja v2").id;
  assert.equal((await call("owner", "DELETE", `${M()}/${id}`)).status, 200);
  const rows = await sql("select count(*)::int as n, count(milestone_id)::int as with_ms from tickets where project_id = $1", [project]);
  assert.deepEqual([rows[0].n, rows[0].with_ms], [4, 0]);
});

test("the read-only roadmap link shows milestones and studies, and nothing about tickets", { skip }, async () => {
  const R = `/projects/${project}/roadmap`;
  assert.equal((await call("viewer", "POST", `${R}/share`)).status, 403);
  const on = await call("editor", "POST", `${R}/share`);
  const tok = on.body.share_token as string;
  assert.match(tok, /^[A-Za-z0-9]{24}$/);
  assert.equal((await call("editor", "POST", `${R}/share`)).body.share_token, tok, "sharing again keeps the same link");
  assert.equal((await call("viewer", "GET", R)).body.share_token, tok);
  const pub = await call(null, "GET", `/public/roadmap/${tok}`);
  assert.equal(pub.status, 200);
  assert.deepEqual(Object.keys(pub.body).sort(), ["milestones", "project", "studies"]);
  assert.deepEqual(Object.keys(pub.body.milestones[0]).sort(), ["begin_date", "done", "end_date", "id", "name", "progress", "state", "total"]);
  assert.deepEqual(Object.keys(pub.body.project).sort(), ["color", "name"]);
  assert.equal((await call(null, "GET", "/public/roadmap/doesnotexist")).status, 404);
  assert.equal((await call(null, "GET", R)).status, 401);
  await call("editor", "DELETE", `${R}/share`);
  assert.equal((await call(null, "GET", `/public/roadmap/${tok}`)).status, 404, "a revoked link stops working");
  assert.notEqual((await call("editor", "POST", `${R}/share`)).body.share_token, tok, "a new link is a different one");
});

test("My work lists what is assigned to me, what I created and what was done recently", { skip }, async () => {
  await sql("delete from tickets where project_id = $1", [project]);
  await ticket(11, "todo", 5, null, ids.editor, ids.owner);
  await ticket(12, "in_progress", -2, null, ids.editor, ids.editor);
  await ticket(13, "todo", null, null, ids.owner, ids.editor);
  await ticket(14, "done", null, null, ids.editor, ids.owner);
  const mine = (await call("editor", "GET", "/my-work")).body;
  assert.deepEqual(mine.tickets.map((t: any) => t.number), [12, 11], "soonest due first");
  assert.deepEqual(mine.counts, { open: 2, overdue: 1, projects: 1 });
  assert.deepEqual((await call("editor", "GET", "/my-work?show=created")).body.tickets.map((t: any) => t.number).sort(), [12, 13]);
  assert.deepEqual((await call("editor", "GET", "/my-work?show=done")).body.tickets.map((t: any) => t.number), [14]);
  assert.deepEqual((await call("stranger", "GET", "/my-work")).body.counts, { open: 0, overdue: 0, projects: 0 });
  assert.equal((await call("editor", "GET", "/my-work?show=everything")).status, 400);
  // Losing access to the project removes its tickets from My work.
  await sql("delete from project_members where project_id = $1 and user_id = $2", [project, ids.editor]);
  assert.deepEqual((await call("editor", "GET", "/my-work")).body.tickets, []);
});
