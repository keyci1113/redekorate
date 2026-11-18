// Project report links against a real PostgreSQL: what a link may hold and what its public page gets.
//   createdb -O redekorate redekorate_test
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
async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { cookie, "content-type": "application/json", "x-requested-with": "redekorate", "x-lang": "en" },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const pub = async (token: string) => fetch(`${base}/api/public/project-reports/${token}`).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, { projects }, { studies }, { insights }, { documents }, { publicApi }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"),
    import("./projects.js"), import("./studies.js"), import("./insights.js"), import("./documents.js"), import("./public.js"), import("../lib/http.js"),
  ]);
  closePool = () => pool.end();
  await migrate();
  await pool.query("truncate users cascade");
  const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ('owner@reports.test','owner','x', now()) returning id, email, name");
  auth.signSession({ cookie: (n: string, v: string) => { cookie = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/projects", projects);
  app.use("/api/studies", studies);
  app.use("/api/insights", insights);
  app.use("/api/documents", documents);
  app.use("/api/public", publicApi);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); });

test("project report links hold studies, documents, diagrams and project-wide parts", { skip }, async () => {
  const project = (await call("POST", "/projects", { name: "Fisher Nut", description: "Payments app" })).body.project.id;
  const s = (await call("POST", "/studies", { project_id: project, title: "Survey", method: "survey" })).body.study;
  const guide = (await call("POST", "/documents", { project_id: project, kind: "interview_guide", title: "Guide", language: "en", data: { questions: ["Why?"] } })).body.document;
  const flow = (await call("POST", "/documents", { project_id: project, kind: "diagram", title: "Flow", language: "en", data: { nodes: [], edges: [] } })).body.document;
  await call("POST", "/insights", { project_id: project, title: "Loose insight" });
  const other = (await call("POST", "/projects", { name: "Other" })).body.project.id;
  const foreign = (await call("POST", "/documents", { project_id: other, kind: "interview_guide", title: "Foreign", language: "en" })).body.document;

  assert.equal((await call("POST", `/projects/${project}/shares`, {})).status, 400);
  assert.equal((await call("POST", `/projects/${project}/shares`, { document_ids: [foreign.id] })).status, 400);
  assert.equal((await call("POST", `/projects/${project}/shares`, { sections: ["milestones"] })).status, 400);

  const made = await call("POST", `/projects/${project}/shares`, { study_ids: [s.id], document_ids: [flow.id, guide.id], sections: ["insights", "overview"] });
  assert.equal(made.status, 201);
  assert.deepEqual(made.body.share.sections, ["overview", "insights"]);
  assert.deepEqual((await call("GET", `/projects/${project}/shares`)).body.shares[0].document_titles, ["Flow", "Guide"]);

  const r = (await pub(made.body.share.token)).body;
  assert.equal(r.project.description, "Payments app");
  assert.deepEqual(r.reports.map((x: any) => x.study.title), ["Survey"]);
  assert.deepEqual(r.documents.map((d: any) => [d.title, d.kind]), [["Flow", "diagram"], ["Guide", "interview_guide"]]);
  assert.ok(r.insights.some((i: any) => i.title === "Loose insight" && i.study_title === null));

  // Only what was picked travels: a studies-only link has no description, documents or insights.
  const plain = await call("POST", `/projects/${project}/shares`, { study_ids: [s.id] });
  const only = (await pub(plain.body.share.token)).body;
  assert.equal(only.project.description, null);
  assert.deepEqual([only.documents, only.insights], [[], null]);

  await call("DELETE", `/documents/${guide.id}`);
  assert.deepEqual((await pub(made.body.share.token)).body.documents.map((d: any) => d.title), ["Flow"]);
  await call("DELETE", `/projects/${project}/shares/${made.body.share.id}`);
  assert.equal((await pub(made.body.share.token)).status, 404);
});
