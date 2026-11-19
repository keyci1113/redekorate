// Ticket routes against a real PostgreSQL. Needs a throwaway database:
//   createdb -O redekorate redekorate_test
//   TEST_DATABASE_URL=postgres://redekorate:redekorate@localhost:5432/redekorate_test npm test -w server
// Without TEST_DATABASE_URL every test here is skipped. The database name must end in "_test": its tables are emptied.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

type Role = "owner" | "editor" | "commenter" | "viewer" | "outsider";
let server: Server, base = "", project = "", insight = "";
const cookie = {} as Record<Role, string>, ids = {} as Record<Role, string>;
let closePool = async () => {};
let sql: (text: string, params?: unknown[]) => Promise<unknown> = async () => {};

async function call(as: Role, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { cookie: cookie[as], "content-type": "application/json", "x-lang": "en" },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const tickets = (suffix = "") => `/api/projects/${project}/tickets${suffix}`;
const create = async (title: string, extra: object = {}) => (await call("editor", "POST", tickets(), { title, ...extra })).body.ticket;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, { tickets: router }, { projects }, { errorHandler }, { studies }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"),
    import("./tickets.js"), import("./projects.js"), import("../lib/http.js"), import("./studies.js"),
  ]);
  closePool = () => pool.end();
  sql = (text, params) => pool.query(text, params);
  await migrate();
  await pool.query("truncate users cascade");

  for (const role of ["owner", "editor", "commenter", "viewer", "outsider"] as Role[]) {
    const name = role === "editor" ? "Ana Ríos" : role === "commenter" ? "Luis Mejía" : `The ${role}`;
    const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ($1,$2,'x', now()) returning id, email, name", [`${role}@test.local`, name]);
    ids[role] = u.id;
    // The session cookie the app itself would set at login.
    auth.signSession({ cookie: (n: string, v: string) => { cookie[role] = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  }
  project = (await pool.query("insert into projects(owner_id, name) values ($1,'Fintech') returning id", [ids.owner])).rows[0].id;
  for (const role of ["editor", "commenter", "viewer"] as Role[]) await pool.query("insert into project_members(project_id, user_id, role) values ($1,$2,$3)", [project, ids[role], role]);
  insight = (await pool.query("insert into insights(project_id, created_by, title) values ($1,$2,'Cierre de caja genera ansiedad') returning id", [project, ids.owner])).rows[0].id;

  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/projects/:id/tickets", router);
  app.use("/api/projects", projects);
  app.use("/api/studies", studies);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => { server?.close(); await closePool(); });

test("tickets created at the same time get consecutive, unique numbers", { skip }, async () => {
  const made = await Promise.all(Array.from({ length: 24 }, (_, i) => call("editor", "POST", tickets(), { title: `Concurrent ${i}` })));
  assert.ok(made.every((r) => r.status === 201));
  const numbers = made.map((r) => r.body.ticket.number as number).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 24 }, (_, i) => i + 1));
  const list = await call("viewer", "GET", tickets());
  assert.equal(list.body.next_number, 25);
});

test("each role can do exactly what the project allows", { skip }, async () => {
  const t = await create("Permissions");
  const one = tickets(`/${t.number}`);
  assert.equal((await call("outsider", "GET", tickets())).status, 404);
  assert.equal((await call("viewer", "GET", one)).status, 200);
  assert.equal((await call("viewer", "POST", tickets(), { title: "No" })).status, 403);
  assert.equal((await call("viewer", "POST", `${one}/comments`, { body: "No" })).status, 403);
  assert.equal((await call("commenter", "POST", `${one}/comments`, { body: "Sí" })).status, 201);
  assert.equal((await call("commenter", "PATCH", one, { priority: "high" })).status, 403);
  assert.equal((await call("commenter", "POST", tickets("/move"), { number: t.number, status: "done" })).status, 403);
  assert.equal((await call("editor", "PATCH", one, { priority: "high" })).status, 200);
  assert.equal((await call("editor", "POST", tickets("/delete"), { numbers: [t.number] })).status, 403);
  assert.equal((await call("owner", "POST", tickets("/delete"), { numbers: [t.number] })).status, 200);
  assert.equal((await call("viewer", "GET", one)).status, 404);
});

test("only people with access to the project can be assigned", { skip }, async () => {
  const t = await create("Assign");
  assert.equal((await call("editor", "PATCH", tickets(`/${t.number}`), { assignees: [ids.outsider] })).status, 400);
  const ok = await call("editor", "PATCH", tickets(`/${t.number}`), { assignees: [ids.editor, ids.commenter] });
  assert.deepEqual(ok.body.ticket.assignees.map((a: any) => a.id).sort(), [ids.editor, ids.commenter].sort());
});

test("moving a card changes status and order and writes the activity", { skip }, async () => {
  const a = await create("Move A", { status: "in_review" }), b = await create("Move B", { status: "in_review" }), c = await create("Move C");
  const moved = await call("editor", "POST", tickets("/move"), { number: c.number, status: "in_review", before: a.number });
  assert.equal(moved.status, 200);
  const column = moved.body.tickets.filter((t: any) => t.status === "in_review").map((t: any) => t.number);
  assert.deepEqual(column.slice(-3), [c.number, a.number, b.number]);
  const detail = (await call("viewer", "GET", tickets(`/${c.number}`))).body.ticket;
  const entry = detail.activity.find((x: any) => x.action === "status");
  assert.deepEqual([entry.from_value, entry.to_value, entry.actor_id], ["todo", "in_review", ids.editor]);
  // Reordering inside the same column is not a status change.
  await call("editor", "POST", tickets("/move"), { number: c.number, status: "in_review", before: null });
  const again = (await call("viewer", "GET", tickets(`/${c.number}`))).body.ticket;
  assert.equal(again.activity.filter((x: any) => x.action === "status").length, 1);
});

test("every edited field is recorded in the activity", { skip }, async () => {
  const t = await create("History");
  await call("editor", "PATCH", tickets(`/${t.number}`), { title: "History 2", priority: "urgent", due_date: "2026-11-20", milestone_name: "Cierre de caja v2", labels: ["POS"], assignees: [ids.editor], watchers: [ids.commenter] });
  const d = (await call("viewer", "GET", tickets(`/${t.number}`))).body.ticket;
  const actions = d.activity.map((x: any) => x.action).sort();
  assert.deepEqual(actions, ["assigned", "created", "due_date", "label_added", "milestone", "priority", "tagged", "title"]);
  assert.equal(d.due_date, "2026-11-20");
  assert.equal(d.milestone, "Cierre de caja v2");
});

test("bulk edit changes every selected ticket, bulk delete removes them", { skip }, async () => {
  const a = await create("Bulk A"), b = await create("Bulk B"), keep = await create("Bulk keep");
  const edited = await call("editor", "POST", tickets("/bulk"), { numbers: [a.number, b.number], patch: { status: "done", priority: "low", add_labels: ["copy"], assignees: [ids.editor] } });
  assert.equal(edited.status, 200);
  const rows = (n: number) => edited.body.tickets.find((t: any) => t.number === n);
  for (const n of [a.number, b.number]) {
    assert.deepEqual([rows(n).status, rows(n).priority, rows(n).labels, rows(n).assignees[0].id], ["done", "low", ["copy"], ids.editor]);
  }
  assert.equal(rows(keep.number).status, "todo");
  const gone = await call("owner", "POST", tickets("/delete"), { numbers: [a.number, b.number] });
  assert.ok(!gone.body.tickets.some((t: any) => t.number === a.number || t.number === b.number));
  assert.ok(gone.body.tickets.some((t: any) => t.number === keep.number));
});

test("a ticket created from an insight is linked on both sides, and deleting it leaves the insight", { skip }, async () => {
  const made = await call("editor", "POST", tickets(), { title: "Rediseñar el cierre", links: [{ target_type: "insight", target_id: insight, relation: "evidence" }] });
  const t = made.body.ticket;
  assert.equal(t.source, "insight");
  assert.equal(t.from_insight, true);
  assert.equal(t.links[0].title, "Cierre de caja genera ansiedad");
  const listed = async () => (await call("viewer", "GET", `/api/projects/${project}/insights`)).body.insights.find((i: any) => i.id === insight);
  assert.deepEqual((await listed()).ticket_numbers, [t.number]);
  await call("owner", "POST", tickets("/delete"), { numbers: [t.number] });
  assert.deepEqual((await listed()).ticket_numbers, []);
});

test("converting a ticket makes one insight with the edited fields and a severity from the priority", { skip }, async () => {
  const t = await create("Cajeros no encuentran descuentos", { priority: "urgent", labels: ["POS"], description: "Visto en 4 de 5 sesiones" });
  // Nothing sent: everything comes from the ticket, and urgent becomes critical.
  const r = await call("editor", "POST", tickets(`/${t.number}/insight`), {});
  assert.equal(r.status, 201);
  const x = r.body.ticket;
  assert.equal(x.from_insight, false, "a converted ticket is not 'from an insight'");
  assert.ok(x.converted_insight_id);
  const ins = (await call("viewer", "GET", `/api/projects/${project}/insights`)).body.insights.find((i: any) => i.id === x.converted_insight_id);
  assert.equal(ins.title, "Cajeros no encuentran descuentos");
  assert.equal(ins.severity, "critical");
  assert.deepEqual(ins.tags, ["POS"]);
  assert.ok(x.activity.some((a: any) => a.action === "insight_created" && a.to_value === "Cajeros no encuentran descuentos"));
  // A second conversion is refused instead of creating a duplicate.
  const again = await call("editor", "POST", tickets(`/${t.number}/insight`), {});
  assert.equal(again.status, 409);
  // The list shows it too.
  const listed = (await call("viewer", "GET", tickets())).body.tickets.find((k: any) => k.number === t.number);
  assert.equal(listed.converted_insight_id, x.converted_insight_id);

  // Edited fields win over the ticket's.
  const u = await create("Otro", { priority: "low" });
  const edited = await call("editor", "POST", tickets(`/${u.number}/insight`), { title: "Título editado", body: "Cuerpo", severity: "high", tags: ["a", "b"] });
  const ins2 = (await call("viewer", "GET", `/api/projects/${project}/insights`)).body.insights.find((i: any) => i.id === edited.body.ticket.converted_insight_id);
  assert.equal(ins2.title, "Título editado");
  assert.equal(ins2.severity, "high");
  assert.deepEqual(ins2.tags, ["a", "b"]);
  // Viewers cannot convert.
  assert.equal((await call("viewer", "POST", tickets(`/${u.number}/insight`), {})).status, 403);
});

test("mentioning someone with @ in a comment adds them to Tagged", { skip }, async () => {
  const t = await create("Mentions");
  const r = await call("commenter", "POST", tickets(`/${t.number}/comments`), { body: "Necesito las citas, @ana rios. Gracias" });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.ticket.watchers.map((w: any) => w.id), [ids.editor]);
  assert.equal(r.body.ticket.comments[0].visibility, "internal");
  assert.ok(r.body.ticket.activity.some((x: any) => x.action === "tagged" && x.to_value === "Ana Ríos"));
  // Ticket comments stay out of the project's own comment list.
  assert.deepEqual((await call("viewer", "GET", `/api/projects/${project}/comments`)).body.comments, []);
});

test("merging moves the conversation to the other ticket and removes this one", { skip }, async () => {
  const from = await create("Totales no coinciden"), into = await create("Totales del cierre");
  await call("commenter", "POST", tickets(`/${from.number}/comments`), { body: "Pasa con devoluciones" });
  const merged = await call("editor", "POST", tickets(`/${from.number}/merge`), { into: into.number });
  assert.equal(merged.body.ticket.number, into.number);
  assert.equal(merged.body.ticket.comments.length, 2);
  assert.ok(merged.body.ticket.activity.some((x: any) => x.action === "merged" && x.from_value === `#${from.number}`));
  assert.equal((await call("viewer", "GET", tickets(`/${from.number}`))).status, 404);
});

test("a study created from a ticket is linked on both sides and written to the ticket's history", { skip }, async () => {
  const t = await create("Entrevistar a 5 cajeros", { type: "research_request" });
  const body = { project_id: project, title: "Entrevistas · Cajeros", method: "survey", blocks: [], ticket_number: t.number };
  assert.equal((await call("viewer", "POST", "/api/studies", body)).status, 403);
  assert.equal((await call("editor", "POST", "/api/studies", { ...body, ticket_number: 99999 })).status, 400, "an unknown ticket creates nothing");
  const made = await call("editor", "POST", "/api/studies", body);
  assert.equal(made.status, 201);
  const sid = made.body.study.id;
  const d = (await call("viewer", "GET", tickets(`/${t.number}`))).body.ticket;
  assert.deepEqual(d.links.map((l: any) => [l.target_type, l.target_id, l.title]), [["study", sid, "Entrevistas · Cajeros"]]);
  const entry = d.activity.find((x: any) => x.action === "study_created");
  assert.deepEqual([entry.to_value, entry.actor_id], ["Entrevistas · Cajeros", ids.editor]);
  assert.deepEqual((await call("viewer", "GET", `/api/studies/${sid}/results`)).body.tickets.map((x: any) => x.number), [t.number]);
  // Exactly one study was created, and deleting it leaves the ticket without a dangling link.
  assert.equal((await call("viewer", "GET", `/api/projects/${project}/studies`)).body.studies.length, 1);
  assert.equal((await call("editor", "DELETE", `/api/studies/${sid}`)).status, 200);
  assert.deepEqual((await call("viewer", "GET", tickets(`/${t.number}`))).body.ticket.links, []);
});

test("a project can define its own board columns", { skip }, async () => {
  // Runs last: it replaces the board of the shared project.
  const before = (await call("viewer", "GET", tickets())).body;
  assert.deepEqual(before.columns.map((c: any) => [c.id, c.name, c.custom]), [["todo", null, false], ["in_progress", null, false], ["in_review", null, false], ["done", null, false]]);
  const a = await create("Stays in to do"), b = await create("Was in review", { status: "in_review" }), d = await create("Already done", { status: "done" });
  assert.equal(b.column, "in_review");

  assert.equal((await call("commenter", "PUT", tickets("/columns"), { columns: before.columns.map((c: any) => ({ id: c.id, name: "x" + c.id, status: c.status })) })).status, 403);
  assert.equal((await call("editor", "PUT", tickets("/columns"), { columns: [{ id: "todo", name: "Backlog", status: "todo" }, { id: "in_progress", name: "Doing", status: "in_progress" }] })).status, 400, "no column counts as done");
  assert.equal((await call("editor", "PUT", tickets("/columns"), { columns: [{ name: "A", status: "todo" }, { name: "a", status: "done" }] })).status, 400, "duplicate names");
  const qaAsDone = await call("editor", "PUT", tickets("/columns"), { columns: [{ name: "Backlog", status: "todo" }, { name: "QA", status: "done" }, { name: "Release", status: "in_review" }] });
  assert.equal(qaAsDone.status, 400, "a done column cannot sit in front of one that is not done");
  assert.equal(qaAsDone.body.error, "Columns that count as Done go at the end of the board");

  // Rename, add "Blocked" and "QA", drop In review (its tickets go to QA), and reorder.
  const saved = await call("editor", "PUT", tickets("/columns"), {
    columns: [
      { id: "todo", name: "Backlog", status: "todo" }, { name: "Blocked", status: "todo" }, { id: "in_progress", name: "Doing", status: "in_progress" },
      { name: "QA", status: "in_review" }, { id: "done", name: "Shipped", status: "done" },
    ],
    moves: { in_review: "QA" },
  });
  assert.equal(saved.status, 200);
  const cols = saved.body.columns as { id: string; name: string; status: string; custom: boolean }[];
  assert.deepEqual(cols.map((c) => [c.name, c.status]), [["Backlog", "todo"], ["Blocked", "todo"], ["Doing", "in_progress"], ["QA", "in_review"], ["Shipped", "done"]]);
  assert.ok(cols.every((c) => c.custom));
  const col = (name: string) => cols.find((c) => c.name === name)!.id;
  const at = (n: number, list = saved.body.tickets) => list.find((t: any) => t.number === n);
  assert.equal(at(a.number).column, col("Backlog"));
  assert.equal(at(d.number).column, col("Shipped"));
  // "moves" named the new column by a name the server could not know, so the fallback applies: same status → QA.
  assert.equal(at(b.number).column, col("QA"));
  assert.equal(at(b.number).status, "in_review");

  // Dragging to a column sets the status that column counts as, and the history uses the column names.
  const moved = await call("editor", "POST", tickets("/move"), { number: a.number, column: col("Blocked"), before: null });
  assert.equal(at(a.number, moved.body.tickets).column, col("Blocked"));
  assert.equal(at(a.number, moved.body.tickets).status, "todo");
  const shipped = (await call("editor", "PATCH", tickets(`/${a.number}`), { column: col("Shipped") })).body.ticket;
  assert.equal(shipped.status, "done");
  assert.deepEqual(shipped.activity.filter((x: any) => x.action === "status").map((x: any) => [x.from_value, x.to_value]).slice(0, 2), [["Blocked", "Shipped"], ["Backlog", "Blocked"]]);
  // A plain status still works: it lands in the first column that counts as it.
  assert.equal((await call("editor", "PATCH", tickets(`/${a.number}`), { status: "todo" })).body.ticket.column, col("Backlog"));
  assert.equal((await call("editor", "POST", tickets("/move"), { number: a.number, column: "00000000-0000-0000-0000-000000000000", before: null })).status, 400);
  // New tickets land in the first to-do column; a ticket can also be created straight into a column.
  assert.equal((await create("New one")).column, col("Backlog"));
  assert.equal((await create("Straight to QA", { column: col("QA") })).status, "in_review");
  assert.deepEqual((await call("viewer", "GET", tickets(`/${a.number}`))).body.columns.map((c: any) => c.name), ["Backlog", "Blocked", "Doing", "QA", "Shipped"]);

  // A column that now counts as done takes its tickets with it; removing a column moves its tickets to the chosen one.
  const again = await call("editor", "PUT", tickets("/columns"), {
    columns: [{ id: col("Backlog"), name: "Backlog", status: "todo" }, { id: col("QA"), name: "Verified", status: "done" }, { id: col("Shipped"), name: "Shipped", status: "done" }],
    moves: { [col("Doing")]: col("Shipped") },
  });
  assert.equal(again.status, 200);
  assert.equal(at(b.number, again.body.tickets).status, "done");
  assert.ok(again.body.tickets.every((t: any) => again.body.columns.some((c: any) => c.id === t.column)), "no ticket is left without a column");

  // A board saved before the "done goes last" rule still loads and still takes moves; the rule only applies on save.
  await sql("update ticket_columns set position = 99 where id = $1", [col("Backlog")]);
  const legacy = await call("viewer", "GET", tickets());
  assert.equal(legacy.status, 200);
  assert.deepEqual(legacy.body.columns.map((c: any) => c.name), ["Verified", "Shipped", "Backlog"]);
  assert.equal((await call("editor", "PATCH", tickets(`/${a.number}`), { column: col("Shipped") })).status, 200);

  // Back to the built-in board: every ticket sits in the column of its status.
  const reset = await call("editor", "DELETE", tickets("/columns"));
  assert.deepEqual(reset.body.columns.map((c: any) => c.id), ["todo", "in_progress", "in_review", "done"]);
  assert.ok(reset.body.tickets.every((t: any) => t.column === t.status));
});
