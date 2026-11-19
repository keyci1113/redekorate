// Pins what the web app's routes answer for projects, studies, insights, documents, milestones, the roadmap and
// My work: status codes, the envelope and the fields each answer carries. Written before the logic moved into
// server/src/services, so the move can't change what the web app receives.
//   TEST_DATABASE_URL=postgres://redekorate:redekorate@localhost:5432/redekorate_test npm test -w server
// Without TEST_DATABASE_URL every test here is skipped. The database name must end in "_test": its tables are emptied.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

type Who = "owner" | "viewer" | "outsider";
let server: Server, base = "";
const cookie = {} as Record<Who, string>, ids = {} as Record<Who, string>;
let closePool = async () => {};

async function call(as: Who, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { cookie: cookie[as], "content-type": "application/json", "x-lang": "en" },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const keys = (o: object) => Object.keys(o).sort();

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, { projects }, { studies }, { insights }, { documents }, roadmapRoutes, { tickets }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"),
    import("./projects.js"), import("./studies.js"), import("./insights.js"), import("./documents.js"), import("./roadmap.js"), import("./tickets.js"), import("../lib/http.js"),
  ]);
  closePool = () => pool.end();
  await migrate();
  await pool.query("truncate users cascade");
  for (const who of ["owner", "viewer", "outsider"] as Who[]) {
    const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ($1,$2,'x', now()) returning id, email, name", [`${who}@pinned.test`, `The ${who}`]);
    ids[who] = u.id;
    auth.signSession({ cookie: (n: string, v: string) => { cookie[who] = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  }
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/projects/:id/tickets", tickets);
  app.use("/api/projects/:id/milestones", roadmapRoutes.milestones);
  app.use("/api/projects/:id/roadmap", roadmapRoutes.roadmap);
  app.use("/api/my-work", roadmapRoutes.myWork);
  app.use("/api/projects", projects);
  app.use("/api/studies", studies);
  app.use("/api/insights", insights);
  app.use("/api/documents", documents);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); });

const PROJECT_LIST_EXTRA = ["areas", "document_count", "insight_count", "live_count", "org_color", "org_logo", "org_name", "owner_name", "participant_count", "response_count", "role", "share_count", "started_count", "study_count"];

test("projects: create, list, read, edit, and who may do what", { skip }, async () => {
  const made = await call("owner", "POST", "/projects", { name: "Pinned", description: "D" });
  assert.equal(made.status, 201);
  const p = made.body.project;
  assert.deepEqual(keys(made.body), ["project"]);
  assert.deepEqual([p.name, p.description, p.color, p.category, p.archived, p.organization_id], ["Pinned", "D", "#5B5BD6", "ux_research", false, null]);

  const list = await call("owner", "GET", "/projects");
  assert.equal(list.status, 200);
  const row = list.body.projects.find((x: any) => x.id === p.id);
  for (const k of PROJECT_LIST_EXTRA) assert.ok(k in row, `list row has ${k}`);
  assert.deepEqual([row.role, row.areas, row.study_count], ["owner", ["research", "tickets"], 0]);
  assert.equal((await call("owner", "GET", "/projects?category=software")).body.projects.length, 0);
  assert.equal((await call("owner", "GET", "/projects?category=nope")).status, 400);

  const one = await call("owner", "GET", `/projects/${p.id}`);
  assert.deepEqual([one.body.project.role, one.body.project.areas], ["owner", ["research", "tickets"]]);
  assert.ok("org_name" in one.body.project);
  assert.equal((await call("outsider", "GET", `/projects/${p.id}`)).status, 404);

  await call("owner", "POST", `/projects/${p.id}/members`, { email: "viewer@pinned.test", role: "viewer" });
  assert.equal((await call("viewer", "GET", `/projects/${p.id}`)).body.project.role, "viewer");
  assert.equal((await call("viewer", "PATCH", `/projects/${p.id}`, { name: "No" })).status, 403);

  const edited = await call("owner", "PATCH", `/projects/${p.id}`, { category: "software" });
  assert.equal(edited.status, 200);
  assert.deepEqual([edited.body.project.name, edited.body.project.description, edited.body.project.category], ["Pinned", "D", "software"]);
  assert.equal("role" in edited.body.project, false, "the edit answers the plain row");
  assert.deepEqual((await call("owner", "GET", `/projects/${p.id}/studies`)).body, { studies: [] });
  assert.deepEqual((await call("owner", "GET", `/projects/${p.id}/insights`)).body, { insights: [] });
});

test("studies: create, read, edit, status, publish, duplicate, results and delete", { skip }, async () => {
  const project = (await call("owner", "POST", "/projects", { name: "Studies" })).body.project.id;
  const blocks = [{ id: "q", type: "open_question", title: "Why?" }];
  const made = await call("owner", "POST", "/studies", { project_id: project, title: "S", method: "survey" });
  assert.equal(made.status, 201);
  const s = made.body.study;
  assert.deepEqual([s.status, s.blocks, s.settings, typeof s.public_slug], ["draft", [], {}, "string"]);
  assert.equal((await call("viewer", "POST", "/studies", { project_id: project, title: "S", method: "survey" })).status, 404);

  const read = await call("owner", "GET", `/studies/${s.id}`);
  assert.deepEqual(keys(read.body), ["project", "study", "tickets"]);
  assert.deepEqual(keys(read.body.project), ["color", "id", "name", "org_color", "org_logo", "org_name", "organization_id", "role"]);
  assert.equal(read.body.study.has_unpublished, false);

  assert.equal((await call("owner", "POST", `/studies/${s.id}/status`, { status: "live" })).status, 400, "no blocks yet");
  const patched = await call("owner", "PATCH", `/studies/${s.id}`, { blocks, base_updated_at: "2000-01-01T00:00:00Z" });
  assert.equal(patched.status, 409, "a stale base is refused for the web app too");
  const ok = await call("owner", "PATCH", `/studies/${s.id}`, { blocks, title: "S1" });
  assert.deepEqual(keys(ok.body), ["study"]);
  assert.deepEqual([ok.body.study.title, ok.body.study.blocks.length, ok.body.study.has_unpublished], ["S1", 1, false]);

  const live = await call("owner", "POST", `/studies/${s.id}/status`, { status: "live" });
  assert.deepEqual([live.body.study.status, live.body.study.published_version, live.body.study.has_unpublished], ["live", 1, false]);
  await call("owner", "PATCH", `/studies/${s.id}`, { title: "S2", blocks: [...blocks, { id: "t", type: "thank_you", title: "Thanks" }] });
  assert.equal((await call("owner", "GET", `/studies/${s.id}`)).body.study.has_unpublished, true);
  const pub = await call("owner", "POST", `/studies/${s.id}/publish`);
  assert.deepEqual([pub.body.study.published_version, pub.body.study.has_unpublished], [2, false]);
  assert.equal((await call("owner", "POST", `/studies/${s.id}/publish`)).body.study.published_version, 2);

  const copy = await call("owner", "POST", `/studies/${s.id}/duplicate`);
  assert.equal(copy.status, 201);
  assert.deepEqual([copy.body.study.title, copy.body.study.status], ["S2 (copy)", "draft"]);

  const results = await call("owner", "GET", `/studies/${s.id}/results`);
  assert.deepEqual(keys(results.body), ["answers", "insights", "recordings", "role", "sessions", "study", "tickets"]);
  assert.equal(results.body.role, "owner");
  assert.deepEqual((await call("owner", "GET", `/studies/${s.id}/versions`)).body, { versions: [] });

  assert.deepEqual((await call("owner", "DELETE", `/studies/${copy.body.study.id}`)).body, { ok: true });
  assert.equal((await call("owner", "GET", `/studies/${copy.body.study.id}`)).status, 404);
  const listed = (await call("owner", "GET", `/projects/${project}/studies`)).body.studies;
  assert.deepEqual(keys(listed[0]), ["block_count", "created_at", "id", "method", "public_slug", "published_at", "response_count", "started_count", "status", "title", "updated_at"]);
});

test("insights: defaults on create, edits change only what they send, delete", { skip }, async () => {
  const project = (await call("owner", "POST", "/projects", { name: "Insights" })).body.project.id;
  const made = await call("owner", "POST", "/insights", { project_id: project, title: "T" });
  assert.equal(made.status, 201);
  const i = made.body.insight;
  assert.deepEqual([i.body, i.tags, i.severity, i.confidence, i.evidence, i.study_id], ["", [], "medium", "medium", [], null]);
  const edited = await call("owner", "PATCH", `/insights/${i.id}`, { severity: "high", reviewed: true });
  assert.deepEqual([edited.body.insight.severity, edited.body.insight.title, !!edited.body.insight.reviewed_at], ["high", "T", true]);
  const listed = (await call("owner", "GET", `/projects/${project}/insights`)).body.insights[0];
  assert.deepEqual([listed.study_title, listed.ticket_numbers], [null, []]);
  assert.equal((await call("owner", "POST", "/insights", { project_id: project, title: "X", study_id: "00000000-0000-0000-0000-000000000000" })).status, 400);
  assert.deepEqual((await call("owner", "DELETE", `/insights/${i.id}`)).body, { ok: true });
  assert.equal((await call("owner", "PATCH", `/insights/${i.id}`, { title: "Y" })).status, 404);
});

test("documents: list, create, read, edit, duplicate, delete", { skip }, async () => {
  const project = (await call("owner", "POST", "/projects", { name: "Docs" })).body.project.id;
  const made = await call("owner", "POST", "/documents", { project_id: project, kind: "persona", title: "P", language: "en" });
  assert.equal(made.status, 201);
  const d = made.body.document;
  assert.deepEqual(d.data, {});
  const listed = (await call("owner", "GET", `/documents?project_id=${project}`)).body.documents;
  assert.deepEqual(keys(listed[0]), ["created_at", "id", "kind", "language", "share_token", "title", "updated_at"]);
  const read = await call("owner", "GET", `/documents/${d.id}`);
  assert.deepEqual(keys(read.body), ["document", "project"]);
  assert.deepEqual(keys(read.body.project), ["color", "id", "name", "project_role", "role"]);
  const edited = await call("owner", "PATCH", `/documents/${d.id}`, { data: { goals: ["G"] } });
  assert.deepEqual([edited.body.document.title, edited.body.document.data], ["P", { goals: ["G"] }]);
  const copy = await call("owner", "POST", `/documents/${d.id}/duplicate`, {});
  assert.deepEqual([copy.status, copy.body.document.title], [201, "P (copy)"]);
  assert.deepEqual((await call("owner", "DELETE", `/documents/${copy.body.document.id}`)).body, { ok: true });
  assert.equal((await call("outsider", "GET", `/documents/${d.id}`)).status, 404);
});

test("milestones, roadmap and My work answer as before", { skip }, async () => {
  const project = (await call("owner", "POST", "/projects", { name: "PM" })).body.project.id;
  const made = await call("owner", "POST", `/projects/${project}/milestones`, { name: "Beta", start_date: "2026-01-05", due_date: "2026-02-01" });
  assert.equal(made.status, 201);
  assert.deepEqual(keys(made.body), ["milestones"]);
  const m = made.body.milestones[0];
  assert.deepEqual([m.name, m.start_date, m.due_date, m.total, m.progress], ["Beta", "2026-01-05", "2026-02-01", 0, 0]);
  assert.equal((await call("owner", "POST", `/projects/${project}/milestones`, { name: "beta" })).status, 400, "same name");
  assert.equal((await call("owner", "POST", `/projects/${project}/milestones`, { name: "Bad", due_date: "2026-02-30" })).status, 400, "not a real day");
  const edited = await call("owner", "PATCH", `/projects/${project}/milestones/${m.id}`, { name: "Beta 2", start_date: null, due_date: "2026-03-01" });
  assert.deepEqual([edited.body.milestones[0].name, edited.body.milestones[0].start_date, edited.body.milestones[0].due_date], ["Beta 2", null, "2026-03-01"]);
  const list = await call("owner", "GET", `/projects/${project}/milestones`);
  assert.deepEqual([keys(list.body), list.body.role], [["milestones", "role"], "owner"]);
  const rm = await call("owner", "GET", `/projects/${project}/roadmap`);
  assert.deepEqual(keys(rm.body), ["milestones", "project", "role", "share_token", "studies"]);

  await call("owner", "POST", `/projects/${project}/tickets`, { title: "Mine", assignees: [ids.owner], due_date: "2020-01-01" });
  const mine = await call("owner", "GET", "/my-work");
  assert.deepEqual(keys(mine.body), ["counts", "show", "tickets"]);
  assert.deepEqual([mine.body.show, mine.body.counts.open, mine.body.counts.overdue], ["assigned", 1, 1]);
  assert.equal(mine.body.tickets[0].title, "Mine");
});
