// The AI operations over HTTP (/api/v1/tools) against a real PostgreSQL: a personal token runs the tools as its
// user, a read-only token gets only what reads, and input is strict.
//   TEST_DATABASE_URL=postgres://redekorate:redekorate@localhost:5432/redekorate_test npm test -w server
// Without TEST_DATABASE_URL every test here is skipped. The database name must end in "_test": its tables are emptied.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

let server: Server, base = "", writeToken = "", readToken = "";
let closePool = async () => {};

async function op(name: string, token: string, body: unknown = {}) {
  const res = await fetch(`${base}/api/v1/tools/${name}`, {
    method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, { auth }, { orgs }, { projects }, { errorHandler }, { toolsApi }, { createPat }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../routes/auth.js"),
    import("../routes/orgs.js"), import("../routes/projects.js"), import("../lib/http.js"), import("./rest.js"), import("../lib/apiAccess.js"),
  ]);
  closePool = () => pool.end();
  await migrate();
  await pool.query("truncate users cascade");
  const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ('owner@tools.test','Owner','x', now()) returning id");
  writeToken = (await createPat(u.id, "write", null)).token;
  readToken = (await createPat(u.id, "read", 30, "read")).token;

  const app = express();
  app.use(express.json(), cookieParser());
  const server0 = app.listen(0);
  const port = (server0.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
  app.use("/api/v1/tools", toolsApi({ apiBase: `${base}/api`, baseUrl: () => base }));
  app.use("/api/auth", auth);
  app.use("/api/orgs", orgs);
  app.use("/api/projects/:id/tickets", (await import("../routes/tickets.js")).tickets);
  app.use("/api/projects", projects);
  app.use(errorHandler);
  server = server0;
});
after(async () => { server?.close(); await closePool(); });

test("a personal token runs the tools as its user", { skip }, async () => {
  const me = await op("whoami", writeToken);
  assert.equal(me.status, 200);
  assert.equal(me.body.email, "owner@tools.test");
  assert.deepEqual(me.body.organizations, []);
  const made = await op("create_project", writeToken, { name: "From a script" });
  assert.equal(made.status, 200);
  assert.equal(made.body.name, "From a script");
});

test("a read-only token reads, and gets 403 on anything that writes", { skip }, async () => {
  assert.equal((await op("whoami", readToken)).status, 200);
  assert.equal((await op("list_projects", readToken)).status, 200);
  const write = await op("create_project", readToken, { name: "Nope" });
  assert.equal(write.status, 403);
  assert.equal(write.body.error, "This token is read-only");
  const list = await op("list_projects", writeToken);
  assert.ok(!JSON.stringify(list.body).includes("Nope"));
});

test("input is strict: a misspelled field is refused by name", { skip }, async () => {
  const r = await op("create_project", writeToken, { name: "X", colour: "#ff0000" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "Invalid input");
  assert.ok(r.body.issues.some((i: any) => /colour/.test(i.message)));
});

test("a revoked token is refused", { skip }, async () => {
  const { pool } = await import("../lib/db.js");
  await pool.query("update api_tokens set revoked_at = now() where name = 'read'");
  assert.equal((await op("whoami", readToken)).status, 401);
});

test("ticket tools run over HTTP, and a replaced description can be put back", { skip }, async () => {
  const { createPat } = await import("../lib/apiAccess.js");
  const { pool } = await import("../lib/db.js");
  const owner = (await pool.query("select id from users where email = 'owner@tools.test'")).rows[0].id;
  const reader = (await createPat(owner, "read again", 30, "read")).token;
  const project = (await op("create_project", writeToken, { name: "Tickets" })).body.id;
  const made = await op("create_ticket", writeToken, { project_id: project, title: "Broken", description: "First", column: "To do" });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const read = await op("get_ticket", writeToken, { project_id: project, number: made.body.number });
  assert.equal(read.body.from_feedback_widget, false);
  assert.equal((await op("update_ticket", writeToken, { project_id: project, number: 1, description: "Second" })).status, 400, "base_updated_at is required");
  assert.equal((await op("update_ticket", writeToken, { project_id: project, number: 1, description: "Second", base_updated_at: read.body.updated_at })).status, 200);
  const versions = (await op("list_versions", writeToken, { of: "ticket", project_id: project, number: 1 })).body;
  assert.equal(versions.length, 1);
  assert.equal((await op("restore_version", reader, { of: "ticket", project_id: project, number: 1, version_id: versions[0].id })).status, 403);
  const list = await op("list_tickets", reader, { project_id: project, query: "brok" });
  assert.deepEqual([list.status, list.body.total, list.body.tickets[0].column], [200, 1, "To do"]);
  const shot = await op("get_ticket_screenshot", writeToken, { project_id: project, number: 1 });
  assert.deepEqual([shot.status, shot.body.error], [404, "Image not found"]);
});
