// The public REST API (/api/v1) against a real PostgreSQL: bearer tokens only, read-only tokens, strict edits,
// guarded content (versions, no emptying, 409 when stale), and answers without outside people's data.
//   TEST_DATABASE_URL=postgres://redekorate:redekorate@localhost:5432/redekorate_test npm test -w server
// Without TEST_DATABASE_URL every test here is skipped. The database name must end in "_test": its tables are emptied.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

let server: Server, base = "", owner = "", reader = "", viewer = "", cookie = "", ownerId = "";
let closePool = async () => {};
let sql: (text: string, params?: unknown[]) => Promise<any[]> = async () => [];
const uploads = mkdtempSync(path.join(tmpdir(), "rk-api-"));

async function api(token: string | null, method: string, p: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/api/v1${p}`, {
    method, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...headers },
  });
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, headers: res.headers, body: (type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer())) as any };
}

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  process.env.UPLOAD_DIR = uploads;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, { createPat }, v1] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"),
    import("../lib/apiAccess.js"), import("./v1.js"),
  ]);
  closePool = () => pool.end();
  sql = async (text, params) => (await pool.query(text, params)).rows;
  await migrate();
  await pool.query("truncate users cascade");
  const [o] = await sql("insert into users(email, name, password_hash, onboarded_at) values ('owner@api.test','Olga Owner','x', now()) returning id, email, name");
  const [v] = await sql("insert into users(email, name, password_hash, onboarded_at) values ('viewer@api.test','Vic Viewer','x', now()) returning id");
  ownerId = o.id;
  owner = (await createPat(o.id, "script", null)).token;
  reader = (await createPat(o.id, "read", 30, "read")).token;
  viewer = (await createPat(v.id, "viewer", null)).token;
  auth.signSession({ cookie: (n: string, val: string) => { cookie = `${n}=${val}`; } } as any, { ...o, role: "member", avatar: null, onboarded_at: null }, 0);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use(v1.API_V1_PATH, v1.apiV1({ baseUrl: () => base }));
  app.use(v1.API_V1_PATH, v1.apiErrors);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); });

test("a bearer token is required; the session cookie does not open the API", { skip }, async () => {
  const none = await api(null, "GET", "/me");
  assert.equal(none.status, 401);
  assert.match(none.headers.get("www-authenticate") ?? "", /^Bearer/);
  assert.equal((await api(null, "GET", "/me", undefined, { cookie })).status, 401);
  assert.equal((await api("rdk_pat_made_up", "GET", "/me")).status, 401);
  const me = await api(owner, "GET", "/me");
  assert.deepEqual([me.status, me.body.user.email, me.body.organizations], [200, "owner@api.test", []]);
});

test("projects: create, strict edits that change only what is sent, read-only tokens, 404 and 405", { skip }, async () => {
  const made = await api(owner, "POST", "/projects", { name: "API", description: "Keep me" });
  assert.equal(made.status, 201);
  const id = made.body.project.id;
  assert.equal("roadmap_token" in made.body.project, false, "link tokens never travel");

  const edited = await api(owner, "PATCH", `/projects/${id}`, { color: "#112233" });
  assert.deepEqual([edited.status, edited.body.project.description, edited.body.project.color], [200, "Keep me", "#112233"]);
  const unknown = await api(owner, "PATCH", `/projects/${id}`, { colour: "#112233", archived: true });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error, "Invalid input");
  assert.match(unknown.body.issues[0].message, /Unknown fields: colour, archived/);

  assert.equal((await api(reader, "GET", `/projects/${id}`)).status, 200);
  const ro = await api(reader, "PATCH", `/projects/${id}`, { name: "No" });
  assert.deepEqual([ro.status, ro.body.error], [403, "This token is read-only"]);
  assert.equal((await api(viewer, "GET", `/projects/${id}`)).status, 404, "a project you can't open does not exist for you");
  assert.equal((await api(owner, "GET", "/projects/not-a-uuid")).status, 404);
  assert.equal((await api(owner, "GET", "/projects?nope=1")).status, 400);
  const wrong = await api(owner, "DELETE", `/projects/${id}`);
  assert.deepEqual([wrong.status, wrong.headers.get("allow")], [405, "GET, PATCH"]);
  assert.equal((await api(owner, "GET", "/admin/users")).status, 404);
  const bad = await api(owner, "POST", "/projects", "{not json");
  assert.deepEqual([bad.status, bad.body.error], [400, "Invalid JSON"]);
});

test("studies: checked content, 409 when stale, no emptying, versions, English errors", { skip }, async () => {
  const project = (await api(owner, "POST", "/projects", { name: "Studies" })).body.project.id;
  const broken = await api(owner, "POST", "/studies", { project_id: project, title: "S", method: "survey", blocks: [{ id: "a", type: "choice", title: "x" }] });
  assert.equal(broken.status, 400);
  assert.ok(broken.body.issues.some((i: any) => i.path === "blocks.0.options"), JSON.stringify(broken.body));
  assert.equal((await api(owner, "POST", "/studies", { project_id: project, title: "S", method: "persona" })).status, 400, "templates are documents");
  const blocks = [{ id: "q", type: "open_question", title: "Why?" }];
  const s = (await api(owner, "POST", "/studies", { project_id: project, title: "S", method: "survey", blocks })).body.study;

  const stale = await api(owner, "PATCH", `/studies/${s.id}`, { blocks: [...blocks, { id: "t", type: "thank_you", title: "Thanks" }], base_updated_at: "2020-01-01T00:00:00Z" });
  assert.equal(stale.status, 409);
  assert.match(stale.body.error, /changed since you read it/i);
  assert.ok(stale.body.updated_at);
  assert.equal((await api(owner, "PATCH", `/studies/${s.id}`, { blocks: [] })).status, 400, "emptying is refused");
  const ok = await api(owner, "PATCH", `/studies/${s.id}`, { title: "S2", base_updated_at: stale.body.updated_at, settings: { language: "en" } });
  assert.equal(ok.status, 200);
  assert.equal((await api(owner, "PATCH", `/studies/${s.id}`, { settings: { language: "fr" } })).status, 400);

  const versions = (await api(owner, "GET", `/studies/${s.id}/versions`)).body.versions;
  assert.equal(versions.length, 1);
  assert.equal((await api(reader, "POST", `/studies/${s.id}/versions/${versions[0].id}/restore`)).status, 403);
  assert.equal((await api(owner, "POST", `/studies/${s.id}/versions/${versions[0].id}/restore`)).status, 200);
  const closed = await api(owner, "POST", `/studies/${s.id}/status`, { status: "closed" });
  assert.deepEqual([closed.status, closed.body.error], [400, "This study was never launched, so there is nothing to close"]);
});

test("results leave out participants, and answers lose contact details", { skip }, async () => {
  const project = (await api(owner, "POST", "/projects", { name: "Results" })).body.project.id;
  const s = (await api(owner, "POST", "/studies", { project_id: project, title: "R", method: "survey", blocks: [{ id: "q", type: "open_question", title: "Why?" }] })).body.study;
  const [session] = await sql("insert into sessions(study_id, participant) values ($1, $2) returning id", [s.id, JSON.stringify({ name: "Ana", email: "ana@x.com" })]);
  await sql("insert into answers(session_id, study_id, block_id, value) values ($1,$2,'q',$3)", [session.id, s.id, JSON.stringify("Write me at ana@x.com")]);
  const r = await api(owner, "GET", `/studies/${s.id}/results`);
  assert.equal(r.status, 200);
  assert.equal("participant" in r.body.sessions[0], false);
  assert.equal("recordings" in r.body, false);
  assert.equal(r.body.answers[0].value, "Write me at [email removed]");
});

test("tickets: filters and pages, strict edits, guarded descriptions, no reporter details, screenshots for editors", { skip }, async () => {
  const project = (await api(owner, "POST", "/projects", { name: "Board" })).body.project.id;
  for (const [title, priority] of [["Login fails", "high"], ["Slow export", "low"], ["Login copy", "medium"]]) await api(owner, "POST", `/projects/${project}/tickets`, { title, priority, labels: ["web"] });
  const page = await api(owner, "GET", `/projects/${project}/tickets?query=login&sort=number_asc&limit=1&page=9`);
  assert.deepEqual([page.status, page.body.total, page.body.pages, page.body.page, page.body.tickets[0].title], [200, 2, 2, 2, "Login copy"]);
  assert.equal(page.body.tickets[0].column_name, "To do");
  assert.equal((await api(owner, "GET", `/projects/${project}/tickets?column=to%20DO`)).body.total, 3);
  assert.equal((await api(owner, "GET", `/projects/${project}/tickets?limit=500`)).status, 400);

  const t = (await api(owner, "POST", `/projects/${project}/tickets`, { title: "With text", description: "First" })).body.ticket;
  assert.equal((await api(owner, "PATCH", `/projects/${project}/tickets/${t.number}`, { due_date: "2026-02-30" })).status, 400, "not a real day");
  assert.equal((await api(owner, "PATCH", `/projects/${project}/tickets/${t.number}`, { description: "" })).status, 400, "emptying is refused");
  assert.equal((await api(owner, "PATCH", `/projects/${project}/tickets/${t.number}`, { description: "Second", base_updated_at: "2020-01-01T00:00:00Z" })).status, 409);
  const edited = await api(owner, "PATCH", `/projects/${project}/tickets/${t.number}`, { description: "Second", base_updated_at: t.updated_at });
  assert.deepEqual([edited.status, edited.body.ticket.description, edited.body.ticket.priority], [200, "Second", "medium"]);
  const versions = (await api(owner, "GET", `/projects/${project}/tickets/${t.number}/versions`)).body.versions;
  assert.equal(versions.length, 1);
  assert.equal((await api(owner, "POST", `/projects/${project}/tickets/${t.number}/versions/${versions[0].id}/restore`)).status, 200);
  assert.equal((await api(owner, "GET", `/projects/${project}/tickets/${t.number}`)).body.ticket.description, "First");
  const c = await api(owner, "POST", `/projects/${project}/tickets/${t.number}/comments`, { body: "Looked", visibility: "email_to_reporter" });
  assert.equal(c.status, 400, "comments through the API are internal only");

  // A ticket from the feedback widget, with a screenshot.
  writeFileSync(path.join(uploads, "abc123.png"), Buffer.from("89504e470d0a1a0a", "hex"));
  const [w] = await sql("insert into tickets(project_id, number, title, source) values ($1, 99, 'From a site', 'widget') returning id", [project]);
  await sql(`insert into ticket_reporters(ticket_id, ref, name, email, verified, metadata, attachments) values ($1, 'FB-1', 'Rita', 'rita@x.com', true, '{"page_url":"https://x"}', '{"screenshot":"/uploads/abc123.png"}')`, [w.id]);
  const read = await api(owner, "GET", `/projects/${project}/tickets/99`);
  assert.equal(read.body.ticket.from_feedback_widget, true);
  assert.deepEqual(read.body.ticket.reporters, [{ verified: true, reports_count: 1, attachment_count: 1, erased: false }]);
  assert.equal(read.body.ticket.screenshot_count, 1);
  assert.ok(!JSON.stringify(read.body).includes("rita@x.com"));
  const shot = await api(owner, "GET", `/projects/${project}/tickets/99/screenshots/0`);
  assert.deepEqual([shot.status, shot.headers.get("content-type"), shot.headers.get("x-image-count")], [200, "image/png", "1"]);
  assert.equal((await api(owner, "GET", `/projects/${project}/tickets/99/screenshots/1`)).status, 404);
  await sql("insert into project_members(project_id, user_id, role) values ($1, (select id from users where email = 'viewer@api.test'), 'viewer')", [project]);
  assert.equal((await api(viewer, "GET", `/projects/${project}/tickets/99`)).status, 200);
  assert.equal((await api(viewer, "GET", `/projects/${project}/tickets/99/screenshots/0`)).status, 403);
});

test("milestones: real dates, partial edits, and My work", { skip }, async () => {
  const project = (await api(owner, "POST", "/projects", { name: "PM" })).body.project.id;
  assert.equal((await api(owner, "POST", `/projects/${project}/milestones`, { name: "M", due_date: "2026-13-01" })).status, 400);
  const m = (await api(owner, "POST", `/projects/${project}/milestones`, { name: "M", start_date: "2026-01-01", due_date: "2026-02-01" })).body.milestones[0];
  const edited = (await api(owner, "PATCH", `/projects/${project}/milestones/${m.id}`, { due_date: null })).body.milestones[0];
  assert.deepEqual([edited.name, edited.start_date, edited.due_date], ["M", "2026-01-01", null]);
  assert.equal((await api(owner, "PATCH", `/projects/${project}/milestones/${m.id}`, { due_date: "2025-01-01" })).status, 400, "start after end");
  await api(owner, "POST", `/projects/${project}/tickets`, { title: "Mine", assignees: [ownerId] });
  const mine = await api(reader, "GET", "/my-work");
  assert.deepEqual([mine.status, mine.body.tickets.length], [200, 1]);
});

test("the OpenAPI document lists every operation, and nothing deletes", { skip }, async () => {
  const doc = (await api(null, "GET", "/openapi.json")).body;
  const { OPERATIONS } = await import("./v1.js");
  const ops = Object.values(doc.paths).flatMap((p: any) => Object.entries(p).map(([m, o]: any) => [m, o.operationId]));
  assert.equal(ops.length, OPERATIONS.length);
  assert.ok(ops.every(([m]) => m !== "delete"));
  assert.equal(doc.servers[0].url, `${base}/api/v1`);
});
