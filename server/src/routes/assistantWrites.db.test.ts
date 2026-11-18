// What AI apps write through the MCP server, against a real PostgreSQL: edits change only what they send,
// replaced content is checked, never emptied by accident, refused when stale, and can be put back.
//   TEST_DATABASE_URL=postgres://redekorate:redekorate@localhost:5432/redekorate_test npm test -w server
// Without TEST_DATABASE_URL every test here is skipped. The database name must end in "_test": its tables are emptied.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

let server: Server, base = "", cookie = "";
let closePool = async () => {};
/** `ai` = the call comes from the MCP server, as its loopback client marks it. */
async function call(method: string, path: string, body?: unknown, ai = false) {
  const res = await fetch(`${base}/api${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { cookie, "content-type": "application/json", "x-requested-with": "redekorate", "x-lang": "en", ...(ai ? { "x-redekorate-client": "mcp" } : {}) },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, { projects }, { studies }, { insights }, { documents }, { participants }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"),
    import("./projects.js"), import("./studies.js"), import("./insights.js"), import("./documents.js"), import("./participants.js"), import("../lib/http.js"),
  ]);
  closePool = () => pool.end();
  await migrate();
  await pool.query("truncate users cascade");
  const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ('owner@writes.test','owner','x', now()) returning id, email, name");
  auth.signSession({ cookie: (n: string, v: string) => { cookie = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/projects", projects);
  app.use("/api/studies", studies);
  app.use("/api/insights", insights);
  app.use("/api/documents", documents);
  app.use("/api/participants", participants);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); });

test("edits change only what they send (insights and participants)", { skip }, async () => {
  const project = (await call("POST", "/projects", { name: "Edits" })).body.project.id;
  const made = await call("POST", "/insights", { project_id: project, title: "Slow checkout", body: "X", tags: ["a"], severity: "high", confidence: "low" });
  const i = (await call("PATCH", `/insights/${made.body.insight.id}`, { reviewed: true })).body.insight;
  assert.deepEqual([i.body, i.tags, i.severity, i.confidence, !!i.reviewed_at], ["X", ["a"], "high", "low", true]);

  const p = await call("POST", "/participants", { project_id: project, name: "Ana", email: "ana@x.com", phone: "123", notes: "n", consent: true });
  assert.equal(p.status, 201);
  const renamed = (await call("PATCH", `/participants/${p.body.participant.id}`, { name: "Ana P" })).body.participant;
  assert.deepEqual([renamed.name, renamed.email, renamed.phone, renamed.notes, renamed.consent], ["Ana P", "ana@x.com", "123", "n", true]);
});

test("what AI apps replace is checked, never emptied by accident, refused when stale, and can be put back", { skip }, async () => {
  const project = (await call("POST", "/projects", { name: "Versions" })).body.project.id;
  const blocks = [
    { id: "b1", type: "choice", title: "Pick", multiple: false, options: [{ id: "o1", label: "A" }, { id: "o2", label: "B" }], allowOther: false, randomize: false,
      logic: { rules: [{ id: "r1", op: "is", value: "o1", goTo: "b2" }] } },
    { id: "b2", type: "thank_you", title: "Thanks" },
  ];
  const s = await call("POST", "/studies", { project_id: project, title: "V", method: "survey", blocks }, true);
  assert.equal(s.status, 201);
  const id = s.body.study.id;
  const broken = await call("PATCH", `/studies/${id}`, { blocks: [{ id: "b1", type: "choice", title: "x" }, { id: "b1", type: "scale", title: "y", min: 10, max: 1 }] }, true);
  assert.equal(broken.status, 400);
  assert.ok(broken.body.issues.length >= 3, JSON.stringify(broken.body));
  assert.equal((await call("PATCH", `/studies/${id}`, { blocks: [] }, true)).status, 400);
  const read = (await call("GET", `/studies/${id}`)).body.study;
  assert.equal((await call("PATCH", `/studies/${id}`, { blocks, base_updated_at: "2020-01-01T00:00:00Z" }, true)).status, 409);
  const edited = await call("PATCH", `/studies/${id}`, { blocks: [blocks[1]], base_updated_at: read.updated_at }, true);
  assert.equal(edited.status, 200);
  const versions = (await call("GET", `/studies/${id}/versions`)).body.versions;
  assert.equal(versions.length, 1);
  assert.equal((await call("POST", `/studies/${id}/versions/${versions[0].id}/restore`)).status, 200);
  assert.equal((await call("GET", `/studies/${id}`)).body.study.blocks.length, 2);
  assert.equal((await call("GET", `/studies/${id}/versions`)).body.versions.length, 2, "the restore saved what it replaced");
  // The web app's own edits save no versions and aren't checked (a draft in progress may be unfinished).
  assert.equal((await call("PATCH", `/studies/${id}`, { blocks: [{ id: "b1", type: "choice", title: "" }] })).status, 200);
  assert.equal((await call("GET", `/studies/${id}/versions`)).body.versions.length, 2);

  assert.equal((await call("POST", "/documents", { project_id: project, kind: "interview_guide", title: "G", language: "en", data: { nope: 1 } }, true)).status, 400);
  const dia = await call("POST", "/documents", { project_id: project, kind: "diagram", title: "D", language: "en",
    data: { nodes: [{ id: "n1", shape: "rect", x: 0, y: 0, w: 160, h: 80, text: "A", color: "blue" }], edges: [] } }, true);
  assert.equal(dia.status, 201);
  const did = dia.body.document.id;
  assert.equal((await call("PATCH", `/documents/${did}`, { data: { nodes: [{ id: "n1", shape: "star" }], edges: [{ id: "e", from: "n1", to: "n99" }] } }, true)).status, 400);
  assert.equal((await call("PATCH", `/documents/${did}`, { data: {} }, true)).status, 400);
  assert.equal((await call("PATCH", `/documents/${did}`, { data: { nodes: [{ id: "n2", shape: "ellipse", x: 10, y: 10, text: "B" }], edges: [] } }, true)).status, 200);
  assert.equal((await call("GET", `/documents/${did}/versions`)).body.versions.length, 1, "a refused edit saves nothing");
});

test("status changes do only what they say", { skip }, async () => {
  const project = (await call("POST", "/projects", { name: "Status" })).body.project.id;
  const id = (await call("POST", "/studies", { project_id: project, title: "S", method: "survey", blocks: [{ id: "q", type: "open_question", title: "Why?", multiline: true }] })).body.study.id;
  assert.equal((await call("POST", `/studies/${id}/status`, { status: "closed" })).status, 400, "never launched");
  const version = (await call("POST", `/studies/${id}/status`, { status: "live" })).body.study.published_version;
  await call("PATCH", `/studies/${id}`, { title: "S2" });
  assert.equal((await call("POST", `/studies/${id}/status`, { status: "live" })).body.study.published_version, version, "launching again publishes nothing");
  assert.equal((await call("POST", `/studies/${id}/publish`)).body.study.published_version, version, "nothing new in the draft");
});
