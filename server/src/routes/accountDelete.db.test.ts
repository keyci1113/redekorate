// Deleting an account against a real PostgreSQL (see research.db.test.ts for the database it needs).
// It pins what My account's "Delete account" section tells people, so the copy cannot drift from the cascade.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

let server: Server, base = "", cookie = "";
let db: typeof import("../lib/db.js");
let closePool = async () => {};

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, dbm, { migrate }, { auth }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"),
    import("./auth.js"), import("../lib/http.js"),
  ]);
  db = dbm;
  closePool = () => dbm.pool.end();
  await migrate();
  await dbm.query("truncate users cascade");
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/auth", auth);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => { server?.close(); await closePool(); });

test("deleting an account: owned projects go (org and shared ones too), own work in others' projects goes, tickets and comments stay without author", { skip }, async () => {
  const { signSession } = await import("../lib/auth.js");
  const user = async (email: string) => (await db.one<{ id: string; email: string; name: string }>(
    "insert into users(email, name, onboarded_at) values ($1, $1, now()) returning id, email, name", [email]))!;
  const gone = await user("leaving@delete.test"), stays = await user("stays@delete.test");
  signSession({ cookie: (n: string, v: string) => { cookie = `${n}=${v}`; } } as any, { ...gone, role: "member", avatar: null, onboarded_at: null }, 0);

  const org = (await db.one<{ id: string }>("insert into organizations(name, created_by) values ('Acme', $1) returning id", [stays.id]))!.id;
  await db.query("insert into organization_members(organization_id, user_id, role) values ($1,$2,'owner'), ($1,$3,'admin')", [org, stays.id, gone.id]);
  const owned = (await db.one<{ id: string }>("insert into projects(owner_id, name, organization_id) values ($1,'Mine, in the org',$2) returning id", [gone.id, org]))!.id;
  await db.query("insert into project_members(project_id, user_id, role) values ($1,$2,'editor')", [owned, stays.id]);
  const theirs = (await db.one<{ id: string }>("insert into projects(owner_id, name) values ($1,'Theirs') returning id", [stays.id]))!.id;
  await db.query("insert into project_members(project_id, user_id, role) values ($1,$2,'editor')", [theirs, gone.id]);
  await db.query("insert into studies(project_id, owner_id, title, method, public_slug) values ($1,$2,'My study','survey','del-1'), ($1,$3,'Their study','survey','del-2')", [theirs, gone.id, stays.id]);
  await db.query("insert into insights(project_id, created_by, title) values ($1,$2,'My insight')", [theirs, gone.id]);
  await db.query("insert into documents(project_id, owner_id, kind, title) values ($1,$2,'persona','My doc')", [theirs, gone.id]);
  await db.query("insert into tickets(project_id, number, title, created_by) values ($1, 1, 'My ticket', $2)", [theirs, gone.id]);
  await db.query("insert into comments(project_id, user_id, body) values ($1,$2,'My comment')", [theirs, gone.id]);

  const res = await fetch(`${base}/api/auth/me`, { method: "DELETE", body: JSON.stringify({ confirm: gone.email }), headers: { cookie, "content-type": "application/json" } });
  assert.equal(res.status, 200);

  const count = async (sql: string, p: unknown[]) => (await db.one<{ n: number }>(`select count(*)::int as n from ${sql}`, p))!.n;
  assert.equal(await count("projects where id = $1", [owned]), 0, "an owned project goes, even inside an organization and shared");
  assert.equal(await count("projects where id = $1", [theirs]), 1);
  assert.equal(await count("organizations where id = $1", [org]), 1, "the organization stays");
  assert.deepEqual((await db.query<{ title: string }>("select title from studies where project_id = $1", [theirs])).map((r) => r.title), ["Their study"]);
  assert.equal(await count("insights where project_id = $1", [theirs]), 0);
  assert.equal(await count("documents where project_id = $1", [theirs]), 0);
  assert.equal((await db.one<{ created_by: string | null }>("select created_by from tickets where project_id = $1", [theirs]))!.created_by, null);
  assert.equal((await db.one<{ user_id: string | null }>("select user_id from comments where project_id = $1", [theirs]))!.user_id, null);
});
