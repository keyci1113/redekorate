// UI review fixes that live on the server, against a real PostgreSQL:
// the Studies page list, the localized "(copy)" suffix, and a session clock that includes the first screen.
//   TEST_DATABASE_URL=postgres://localhost/redekorate_test npm test -w server
// Without TEST_DATABASE_URL every test here is skipped. The database name must end in "_test": its tables are emptied.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

let server: Server, base = "", cookie = "";
let closePool = async () => {};
let pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
async function call(method: string, path: string, body?: unknown, lang = "es") {
  const res = await fetch(`${base}/api${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { cookie, "content-type": "application/json", "x-requested-with": "redekorate", "x-lang": lang },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, db, { migrate }, auth, { projects }, { studies }, { dashboard }, { publicApi }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"),
    import("./projects.js"), import("./studies.js"), import("./dashboard.js"), import("./public.js"), import("../lib/http.js"),
  ]);
  pool = db.pool;
  closePool = () => db.pool.end();
  await migrate();
  await db.pool.query("truncate users cascade");
  const { rows: [u] } = await db.pool.query("insert into users(email, name, password_hash, onboarded_at) values ('owner@ui.test','owner','x', now()) returning id, email, name");
  auth.signSession({ cookie: (n: string, v: string) => { cookie = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/projects", projects);
  app.use("/api/studies", studies);
  app.use("/api/dashboard", dashboard);
  app.use("/api/public", publicApi);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); });

const blocks = [{ id: "w", type: "welcome", title: "Hi", buttonLabel: "Go" }, { id: "q", type: "open_question", title: "Why?", multiline: false, required: false }];

test("the Studies page lists every status; a duplicate's suffix follows the request language", { skip }, async () => {
  const project = (await call("POST", "/projects", { name: "UI" })).body.project.id;
  const draft = (await call("POST", "/studies", { project_id: project, title: "Draft", method: "survey", blocks })).body.study;
  const live = (await call("POST", "/studies", { project_id: project, title: "Live", method: "survey", blocks })).body.study;
  const closed = (await call("POST", "/studies", { project_id: project, title: "Closed", method: "survey", blocks })).body.study;
  assert.equal((await call("POST", `/studies/${live.id}/status`, { status: "live" })).status, 200);
  await call("POST", `/studies/${closed.id}/status`, { status: "live" });
  await call("POST", `/studies/${closed.id}/status`, { status: "closed" });

  const list = (await call("GET", "/dashboard/studies")).body.studies;
  assert.deepEqual(list.map((s: any) => s.status).sort(), ["closed", "draft", "live"]);
  assert.ok(list.every((s: any) => "updated_at" in s && "published_at" in s && "last_response_at" in s));

  assert.equal((await call("POST", `/studies/${draft.id}/duplicate`, {}, "en")).body.study.title, "Draft (copy)");
  assert.equal((await call("POST", `/studies/${draft.id}/duplicate`, {}, "es")).body.study.title, "Draft (copia)");
});

test("a session's clock starts when its first screen showed, capped at three hours", { skip }, async () => {
  const project = (await call("POST", "/projects", { name: "Clock" })).body.project.id;
  const s = (await call("POST", "/studies", { project_id: project, title: "Timed", method: "survey", blocks })).body.study;
  await call("POST", `/studies/${s.id}/status`, { status: "live" });
  const started = async (elapsed_ms?: number) => {
    const sid = (await call("POST", `/public/studies/${s.public_slug}/sessions`, { participant: {}, elapsed_ms })).body.session_id;
    const { rows: [r] } = await pool.query("select extract(epoch from now() - started_at) * 1000 as ago from sessions where id = $1", [sid]);
    return Number(r.ago);
  };
  const ago = await started(90_000);
  assert.ok(ago >= 89_000 && ago < 120_000, `started ${ago} ms ago`);
  assert.ok((await started()) < 5_000);
  assert.ok((await started(10 * 3600_000)) <= 3 * 3600_000 + 5_000);
});
