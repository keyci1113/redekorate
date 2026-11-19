// Notifications against a real PostgreSQL (see tickets.db.test.ts for the database it needs).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

type Who = "owner" | "ana" | "luis" | "outsider";
let server: Server, base = "", project = "";
const cookie = {} as Record<Who, string>, ids = {} as Record<Who, string>;
let closePool = async () => {};
let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
let flush: (baseUrl: string) => Promise<number>;

async function call(as: Who, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { cookie: cookie[as], "content-type": "application/json", "x-lang": "en" } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const tickets = (suffix = "") => `/api/projects/${project}/tickets${suffix}`;
const bell = async (as: Who) => (await call(as, "GET", "/api/notifications")).body as { notifications: { id: string; text: string; number: number; read_at: string | null }[]; unread: number; email: boolean };
/** What the bell says about one ticket, oldest first. */
const told = async (as: Who, number: number) => (await bell(as)).notifications.filter((n) => n.number === number).map((n) => n.text).reverse();
/** Waits until the emails a request left behind have gone out. */
async function settled() {
  for (let i = 0; i < 100; i++) {
    if ((await db.query("select 1 from notifications where emailed_at is null limit 1")).rows.length === 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("emails were never sent");
}

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, { tickets: router }, { notifications }, { errorHandler }, notify] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"),
    import("./tickets.js"), import("./notifications.js"), import("../lib/http.js"), import("../lib/notify.js"),
  ]);
  db = pool; flush = notify.flushEmails;
  closePool = () => pool.end();
  await migrate();
  await pool.query("truncate users cascade");
  const names: Record<Who, string> = { owner: "The owner", ana: "Ana Ríos", luis: "Luis Mejía", outsider: "The outsider" };
  for (const who of Object.keys(names) as Who[]) {
    const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ($1,$2,'x', now()) returning id, email, name", [`${who}@test.local`, names[who]]);
    ids[who] = u.id;
    auth.signSession({ cookie: (n: string, v: string) => { cookie[who] = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  }
  project = (await pool.query("insert into projects(owner_id, name) values ($1,'Fintech') returning id", [ids.owner])).rows[0].id;
  for (const who of ["ana", "luis"] as Who[]) await pool.query("insert into project_members(project_id, user_id, role) values ($1,$2,'editor')", [project, ids[who]]);

  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/projects/:id/tickets", router);
  app.use("/api/notifications", notifications);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => { await settled().catch(() => {}); server?.close(); await closePool(); });

test("being assigned tells you, whether at creation or later; assigning yourself tells nobody", { skip }, async () => {
  const made = (await call("owner", "POST", tickets(), { title: "At creation", assignees: [ids.ana, ids.owner] })).body.ticket;
  assert.deepEqual(await told("ana", made.number), ["The owner assigned you #" + made.number]);
  assert.deepEqual(await told("owner", made.number), []);

  const later = (await call("owner", "POST", tickets(), { title: "Later" })).body.ticket;
  await call("owner", "PATCH", tickets(`/${later.number}`), { assignees: [ids.luis] });
  assert.deepEqual(await told("luis", later.number), [`The owner assigned you #${later.number}`]);
  // Saving the same assignees again is not news.
  await call("owner", "PATCH", tickets(`/${later.number}`), { assignees: [ids.luis], priority: "high" });
  assert.equal((await told("luis", later.number)).length, 1);
});

test("moving a ticket tells everyone on it except whoever moved it — from the board, the details and a bulk edit", { skip }, async () => {
  const t = (await call("owner", "POST", tickets(), { title: "Moves", assignees: [ids.ana] })).body.ticket;
  await call("owner", "PATCH", tickets(`/${t.number}`), { watchers: [ids.luis] });
  assert.deepEqual(await told("luis", t.number), [`The owner tagged you on #${t.number}`]);
  await call("owner", "POST", tickets("/move"), { number: t.number, status: "in_progress", before: null });
  assert.equal((await told("ana", t.number)).at(-1), `The owner moved #${t.number} from To do to In progress`);
  assert.equal((await told("luis", t.number)).at(-1), `The owner moved #${t.number} from To do to In progress`);

  // Reordering inside the same column is not a move.
  const count = (await told("ana", t.number)).length;
  await call("owner", "POST", tickets("/move"), { number: t.number, status: "in_progress", before: null });
  assert.equal((await told("ana", t.number)).length, count);

  // Ana moves it herself: Luis hears, she does not.
  await call("ana", "PATCH", tickets(`/${t.number}`), { status: "in_review" });
  assert.equal((await told("ana", t.number)).length, count);
  assert.equal((await told("luis", t.number)).at(-1), `Ana Ríos moved #${t.number} from In progress to In review`);

  await call("owner", "POST", tickets("/bulk"), { numbers: [t.number], patch: { status: "done" } });
  assert.equal((await told("ana", t.number)).at(-1), `The owner moved #${t.number} from In review to Done`);
});

test("a comment tells the people on the ticket; an @mention tells that person they were tagged, once", { skip }, async () => {
  const t = (await call("owner", "POST", tickets(), { title: "Talk", assignees: [ids.ana] })).body.ticket;
  await call("owner", "POST", tickets(`/${t.number}/comments`), { body: "Need the quotes, @luis mejia. Thanks" });
  assert.equal((await told("ana", t.number)).at(-1), `The owner commented on #${t.number}`);
  assert.deepEqual(await told("luis", t.number), [`The owner tagged you on #${t.number}`]);
  assert.deepEqual(await told("owner", t.number), []);
});

test("the bell counts unread, marks one or all as read, and only ever touches your own", { skip }, async () => {
  const before = await bell("ana");
  assert.ok(before.unread >= 3);
  const first = before.notifications[0];
  // Someone else cannot mark it for her.
  await call("luis", "POST", "/api/notifications/read", { ids: [first.id] });
  assert.equal((await bell("ana")).unread, before.unread);
  await call("ana", "POST", "/api/notifications/read", { ids: [first.id] });
  assert.equal((await bell("ana")).unread, before.unread - 1);
  await call("ana", "POST", "/api/notifications/read", {});
  const done = await bell("ana");
  assert.equal(done.unread, 0);
  assert.ok(done.notifications.every((n) => n.read_at));
  assert.ok((await bell("luis")).unread > 0);
  assert.deepEqual((await bell("outsider")).notifications, []);
  assert.equal((await fetch(`${base}/api/notifications`)).status, 401);
});

test("each notification is emailed once, and not at all to someone who turned emails off", { skip }, async () => {
  await settled();
  assert.equal(await flush("https://app.test"), 0, "nothing is sent twice");
  assert.equal((await bell("luis")).email, true);
  assert.equal((await call("luis", "PUT", "/api/notifications/settings", { email: false })).body.email, false);
  assert.equal((await bell("luis")).email, false);

  const t = (await db.query("select id from tickets where project_id = $1 limit 1", [project])).rows[0];
  for (const who of ["ana", "luis"] as Who[]) await db.query("insert into notifications(user_id, actor_id, project_id, ticket_id, kind) values ($1,$2,$3,$4,'assigned')", [ids[who], ids.owner, project, t.id]);
  assert.equal(await flush("https://app.test"), 1, "only Ana gets the email");
  // Luis still sees it in the bell.
  assert.ok((await bell("luis")).unread > 0);
  assert.equal(await flush("https://app.test"), 0);
});

test("emails can be turned off per kind: those kinds are not emailed, the rest are, and the bell keeps them all", { skip }, async () => {
  await settled();
  assert.equal((await call("ana", "PUT", "/api/notifications/settings", { email_off: ["comment", "status", "comment"] })).status, 200);
  const me = (await call("ana", "GET", "/api/notifications")).body;
  assert.equal(me.email, true, "the master switch is untouched");
  assert.deepEqual([...me.email_off].sort(), ["comment", "status"]);
  assert.equal((await call("ana", "PUT", "/api/notifications/settings", { email_off: ["nonsense"] })).status, 400);
  assert.equal((await call("ana", "PUT", "/api/notifications/settings", {})).status, 400);

  const t = (await db.query("select id from tickets where project_id = $1 limit 1", [project])).rows[0];
  const before = (await bell("ana")).unread;
  for (const kind of ["comment", "status", "assigned"]) await db.query("insert into notifications(user_id, actor_id, project_id, ticket_id, kind) values ($1,$2,$3,$4,$5)", [ids.ana, ids.owner, project, t.id, kind]);
  assert.equal(await flush("https://app.test"), 1, "only the assignment is emailed");
  assert.equal((await bell("ana")).unread, before + 3);

  // Turning everything back on emails comments again.
  assert.deepEqual((await call("ana", "PUT", "/api/notifications/settings", { email_off: [] })).body, { email: true, email_off: [] });
  await db.query("insert into notifications(user_id, actor_id, project_id, ticket_id, kind) values ($1,$2,$3,$4,'comment')", [ids.ana, ids.owner, project, t.id]);
  assert.equal(await flush("https://app.test"), 1);
});
