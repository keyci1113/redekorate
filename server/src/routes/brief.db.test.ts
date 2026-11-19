// The daily brief against a real PostgreSQL (see tickets.db.test.ts for the database it needs).
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

type Who = "owner" | "me";
let server: Server, base = "";
const cookie = {} as Record<Who, string>, ids = {} as Record<Who, string>;
/** both: every section; research / tickets: only that section; hidden: no access; archived: both sections, archived. */
const P = {} as Record<"both" | "research" | "tickets" | "hidden" | "archived", string>;
let closePool = async () => {};
let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
let numbers = 0;

async function call(as: Who, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { cookie: cookie[as], "content-type": "application/json", "x-lang": "en" } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const brief = async (qs = "") => (await call("me", "GET", `/api/brief${qs}`)).body;
const dot = async () => (await call("me", "GET", "/api/brief/status")).body.has_new as boolean;
/** The server's today as YYYY-MM-DD shifted by `days` (UTC, the brief's default time zone). */
const day = async (days: number) => (await db.query("select to_char((now() at time zone 'UTC')::date + $1::int, 'YYYY-MM-DD') as d", [days])).rows[0].d as string;

async function ticket(project: string, title: string, o: { due?: string | null; status?: string; assign?: boolean; source?: string; created?: string } = {}) {
  const { rows: [t] } = await db.query(
    "insert into tickets(project_id, number, title, due_date, status, source, created_by, created_at) values ($1,$2,$3,$4,$5,$6,$7, coalesce($8::timestamptz, now())) returning id, number",
    [project, ++numbers, title, o.due ?? null, o.status ?? "todo", o.source ?? "manual", ids.owner, o.created ?? null]);
  if (o.assign !== false) await db.query("insert into ticket_assignees(ticket_id, user_id) values ($1,$2)", [t.id, ids.me]);
  return t as { id: string; number: number };
}
async function study(project: string, title: string, status = "live") {
  return (await db.query("insert into studies(project_id, owner_id, title, method, public_slug, status, published_at) values ($1,$2,$3,'survey',$4,$5, now()) returning id",
    [project, ids.owner, title, `s-${numbers++}-${Math.random().toString(36).slice(2)}`, status])).rows[0].id as string;
}
const responses = (studyId: string, n: number, ago = "1 hour") =>
  db.query(`insert into sessions(study_id, started_at, completed_at) select $1, now() - $2::interval, now() - $2::interval from generate_series(1, $3)`, [studyId, ago, n]);

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, { brief: router }, { tickets }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"),
    import("./brief.js"), import("./tickets.js"), import("../lib/http.js"),
  ]);
  db = pool;
  closePool = () => pool.end();
  await migrate();
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/brief", router);
  app.use("/api/projects/:id/tickets", tickets);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // The flows below assert exact lists, so every test starts from the same people and projects.
  beforeEachSeed = async () => {
    await pool.query("truncate users cascade");
    const names: Record<Who, string> = { owner: "Olga Owner", me: "Mara Díaz" };
    for (const who of Object.keys(names) as Who[]) {
      const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ($1,$2,'x', now()) returning id, email, name", [`${who}@brief.test`, names[who]]);
      ids[who] = u.id;
      auth.signSession({ cookie: (n: string, v: string) => { cookie[who] = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
    }
    for (const k of Object.keys({ both: 1, research: 1, tickets: 1, hidden: 1, archived: 1 }) as (keyof typeof P)[]) {
      P[k] = (await pool.query("insert into projects(owner_id, name, archived) values ($1,$2,$3) returning id", [ids.owner, `P-${k}`, k === "archived"])).rows[0].id;
    }
    const areas: Record<string, string[]> = { both: ["research", "tickets"], research: ["research"], tickets: ["tickets"], archived: ["research", "tickets"] };
    for (const [k, a] of Object.entries(areas)) await pool.query("insert into project_members(project_id, user_id, role, areas) values ($1,$2,'editor',$3)", [P[k as keyof typeof P], ids.me, a]);
  };
});
let beforeEachSeed = async () => {};
beforeEach(async () => { if (!skip) await beforeEachSeed(); });
after(async () => { server?.close(); await closePool(); });

test("the brief only holds projects and sections the person can open", { skip }, async () => {
  const today = await day(0);
  for (const k of ["both", "research", "tickets", "hidden", "archived"] as const) {
    await ticket(P[k], `due ${k}`, { due: today });
    await ticket(P[k], `widget ${k}`, { source: "widget", assign: false });
    await responses(await study(P[k], `study ${k}`), 2);
    await db.query("insert into insights(project_id, created_by, title) values ($1,$2,$3)", [P[k], ids.owner, `insight ${k}`]);
    await db.query("insert into milestones(project_id, name, due_date) values ($1,$2,$3)", [P[k], `ms ${k}`, await day(3)]);
  }
  const b = await brief();
  const names = (xs: { project_name: string }[]) => xs.map((x) => x.project_name).sort();
  assert.deepEqual(names(b.my_day.tickets), ["P-both", "P-tickets"]);
  assert.deepEqual(names(b.news.widget.items), ["P-both", "P-tickets"]);
  assert.deepEqual(names(b.milestones), ["P-both", "P-tickets"]);
  assert.deepEqual(names(b.live_studies), ["P-both", "P-research"]);
  assert.deepEqual(names(b.news.responses), ["P-both", "P-research"]);
  assert.deepEqual(names(b.news.insights.items), ["P-both", "P-research"]);
  assert.equal(b.live_studies.find((s: any) => s.project_name === "P-both").today, 2);
  assert.equal(b.has_new, true);
});

test("my day: overdue, today and later this week, my open tickets only, at most 8", { skip }, async () => {
  const today = await day(0), weekEnd = (await brief()).week_end as string;
  await ticket(P.both, "late", { due: await day(-3) });
  await ticket(P.both, "now", { due: today });
  await ticket(P.both, "closed", { due: today, status: "done" });
  await ticket(P.both, "someone else's", { due: today, assign: false });
  await ticket(P.both, "undated");
  await ticket(P.both, "week end", { due: weekEnd });
  await ticket(P.both, "next week", { due: (await db.query("select to_char($1::date + 1, 'YYYY-MM-DD') as d", [weekEnd])).rows[0].d });
  let b = await brief();
  assert.deepEqual(b.my_day.tickets.map((t: any) => [t.title, t.bucket]),
    [["late", "overdue"], ["now", "today"], ...(weekEnd === today ? [["week end", "today"]] : [["week end", "week"]])]);
  // More than 8: the first 8 by due date, with the total for "see all".
  for (let i = 0; i < 9; i++) await ticket(P.both, `pile ${i}`, { due: await day(-10) });
  b = await brief();
  assert.equal(b.my_day.tickets.length, 8);
  assert.equal(b.my_day.total, 12);
  assert.equal(b.my_day.counts.overdue, 10);
  assert.ok(b.my_day.tickets.every((t: any) => t.bucket === "overdue"));
  // The viewer's time zone decides what "today" is.
  assert.match((await brief("?tz=Pacific/Kiritimati")).today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await brief("?tz=Not/AZone")).time_zone, "UTC");
});

test("what's new starts at the last open: 24 hours the first time, never more than 7 days back", { skip }, async () => {
  const s = await study(P.both, "Checkout survey");
  await responses(s, 3, "2 hours");
  await responses(s, 4, "2 days");
  await responses(s, 5, "10 days");
  // First open: the last 24 hours.
  assert.deepEqual((await brief()).news.responses.map((r: any) => [r.title, r.count]), [["Checkout survey", 3]]);
  // Last opened 3 days ago: 3 + 4.
  await db.query("update users set brief_seen_at = now() - interval '3 days' where id = $1", [ids.me]);
  let b = await brief();
  assert.equal(b.news.responses[0].count, 7);
  // Last opened a month ago: capped at 7 days, so the 10-day-old ones stay out.
  await db.query("update users set brief_seen_at = now() - interval '30 days' where id = $1", [ids.me]);
  b = await brief();
  assert.equal(b.news.responses[0].count, 7);
  assert.ok(Date.now() - new Date(b.since).getTime() <= 7 * 86_400_000 + 60_000);
  // A refresh sends back the start it used, so opening (and marking seen) does not empty the list.
  await call("me", "POST", "/api/brief/seen");
  assert.equal((await brief()).news.responses.length, 0);
  assert.equal((await brief(`?since=${encodeURIComponent(b.since)}`)).news.responses[0].count, 7);
});

test("assignments and @mentions in comments since the last open", { skip }, async () => {
  const t = await ticket(P.both, "Fix the form", { assign: false });
  await call("owner", "PATCH", `/api/projects/${P.both}/tickets/${t.number}`, { assignees: [ids.me] });
  await call("owner", "POST", `/api/projects/${P.both}/tickets/${t.number}/comments`, { body: "@Mara Díaz can you look?", visibility: "internal" });
  // Tagged from the fields, not a comment: not a mention.
  const u = await ticket(P.both, "Other", { assign: false });
  await call("owner", "PATCH", `/api/projects/${P.both}/tickets/${u.number}`, { watchers: [ids.me] });
  const b = await brief();
  assert.deepEqual(b.news.assigned.items.map((n: any) => [n.number, n.actor_name]), [[t.number, "Olga Owner"]]);
  assert.deepEqual(b.news.mentions.items.map((n: any) => [n.number, n.excerpt]), [[t.number, "@Mara Díaz can you look?"]]);
});

test("a mention on a project where I have no tickets section shows once it let me read that ticket", { skip }, async () => {
  const t = await ticket(P.research, "Ask Mara", { assign: false });
  const hidden = await ticket(P.hidden, "Not my project", { assign: false });
  await call("owner", "POST", `/api/projects/${P.research}/tickets/${t.number}/comments`, { body: "@Mara Díaz what do the interviews say?", visibility: "internal" });
  await call("owner", "POST", `/api/projects/${P.hidden}/tickets/${hidden.number}/comments`, { body: "@Mara Díaz not for you", visibility: "internal" });
  const b = await brief();
  assert.deepEqual(b.news.mentions.items.map((n: any) => [n.number, n.project_id]), [[t.number, P.research]], "the hidden project's mention granted nothing");
});

test("opening the brief clears the dot until something new arrives", { skip }, async () => {
  const s = await study(P.research, "Diary");
  assert.equal(await dot(), false);
  await responses(s, 1, "1 minute");
  assert.equal(await dot(), true);
  assert.equal((await call("me", "POST", "/api/brief/seen")).status, 200);
  assert.equal(await dot(), false);
  await new Promise((r) => setTimeout(r, 20));
  await responses(s, 1, "0 seconds");
  assert.equal(await dot(), true);
  // A response in a project without the research section never lights it.
  await call("me", "POST", "/api/brief/seen");
  await responses(await study(P.tickets, "Hidden"), 2, "0 seconds");
  assert.equal(await dot(), false);
});

test("the brief needs a session", { skip }, async () => {
  assert.equal((await fetch(`${base}/api/brief`)).status, 401);
});
