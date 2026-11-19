// Session recordings against a real PostgreSQL: set TEST_DATABASE_URL to a database whose name ends in _test.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

let server: Server, base = "", study = "", plain = "";
const cookie = {} as Record<"owner" | "viewer" | "outsider", string>;
let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; end: () => Promise<void> };
let purge: (days?: number) => Promise<number>;

async function call(as: keyof typeof cookie | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { ...(as ? { cookie: cookie[as] } : {}), "content-type": "application/json", "x-lang": "en" } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const session = async (studyId: string) => (await db.query("insert into sessions(study_id) values ($1) returning id", [studyId])).rows[0].id as string;
const ev = (type: number, timestamp: number) => ({ type, timestamp, data: { note: "x" } });

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, { studies }, { publicApi }, { errorHandler }, rec] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"),
    import("./studies.js"), import("./public.js"), import("../lib/http.js"), import("../lib/recordings.js"),
  ]);
  db = pool; purge = rec.purgeOldRecordings;
  await migrate();
  await pool.query("truncate users cascade");
  const ids = {} as Record<string, string>;
  for (const who of ["owner", "viewer", "outsider"] as const) {
    const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ($1,$2,'x', now()) returning id, email, name", [`${who}@test.local`, who]);
    ids[who] = u.id;
    auth.signSession({ cookie: (n: string, v: string) => { cookie[who] = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  }
  const project = (await pool.query("insert into projects(owner_id, name) values ($1,'P') returning id", [ids.owner])).rows[0].id;
  await pool.query("insert into project_members(project_id, user_id, role) values ($1,$2,'viewer')", [project, ids.viewer]);
  const make = async (settings: object, slug: string) => (await pool.query(
    "insert into studies(project_id, owner_id, title, method, status, blocks, settings, public_slug) values ($1,$2,'S','survey','live','[]',$3,$4) returning id", [project, ids.owner, JSON.stringify(settings), slug])).rows[0].id;
  study = await make({ recording: true }, "recorded01");
  plain = await make({}, "plain00001");

  const app = express();
  app.use(express.json({ limit: "2mb" }), cookieParser());
  app.use("/api/public", publicApi);
  app.use("/api/studies", studies);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => { server?.close(); await db?.end(); });

test("a recording is only accepted for a study that records, and only well-formed events", { skip }, async () => {
  const off = await session(plain), on = await session(study);
  assert.equal((await call(null, "POST", `/api/public/sessions/${off}/recording`, { seq: 0, events: [ev(4, 1000)] })).status, 403);
  assert.equal((await call(null, "POST", `/api/public/sessions/${on}/recording`, { seq: 0, events: [] })).status, 400);
  assert.equal((await call(null, "POST", `/api/public/sessions/${on}/recording`, { seq: 0, events: [{ type: "x" }] })).status, 400);
  assert.equal((await call(null, "POST", `/api/public/sessions/${on}/recording`, { seq: -1, events: [ev(4, 1)] })).status, 400);
  assert.equal((await call(null, "POST", `/api/public/sessions/not-a-session/recording`, { seq: 0, events: [ev(4, 1)] })).status, 404);
  assert.equal((await db.query("select 1 from session_recording_chunks")).rows.length, 0);
});

test("pieces are stored once each and come back in order, whatever order they arrived in", { skip }, async () => {
  const s = await session(study), path = `/api/public/sessions/${s}/recording`;
  assert.equal((await call(null, "POST", path, { seq: 1, events: [ev(3, 5000), ev(3, 9000)] })).status, 200);
  assert.equal((await call(null, "POST", path, { seq: 0, events: [ev(4, 1000), ev(2, 1100)] })).status, 200);
  // A retry of the same piece changes nothing.
  assert.equal((await call(null, "POST", path, { seq: 1, events: [ev(3, 5000), ev(3, 9000)] })).status, 200);

  const results = await call("viewer", "GET", `/api/studies/${study}/results`);
  assert.deepEqual(results.body.recordings.find((r: any) => r.session_id === s), { session_id: s, events: 4, bytes: results.body.recordings.find((r: any) => r.session_id === s).bytes, duration_ms: 8000 });
  const played = await call("viewer", "GET", `/api/studies/${study}/recordings/${s}`);
  assert.deepEqual(played.body.events.map((e: any) => e.timestamp), [1000, 1100, 5000, 9000]);
});

test("a finished session takes its last piece for a moment, then no more", { skip }, async () => {
  const s = await session(study), path = `/api/public/sessions/${s}/recording`;
  await db.query("update sessions set completed_at = now() where id = $1", [s]);
  assert.equal((await call(null, "POST", path, { seq: 0, events: [ev(4, 1)] })).status, 200);
  await db.query("update sessions set completed_at = now() - interval '10 minutes' where id = $1", [s]);
  assert.equal((await call(null, "POST", path, { seq: 1, events: [ev(3, 2)] })).status, 409);
});

test("only the project's people can watch, only editors can delete, and deleting keeps the session", { skip }, async () => {
  const s = await session(study);
  await call(null, "POST", `/api/public/sessions/${s}/recording`, { seq: 0, events: [ev(4, 1), ev(2, 2)] });
  const one = `/api/studies/${study}/recordings/${s}`;
  assert.equal((await call(null, "GET", one)).status, 401);
  assert.equal((await call("outsider", "GET", one)).status, 404);
  assert.equal((await call("viewer", "GET", one)).status, 200);
  assert.equal((await call("viewer", "DELETE", one)).status, 403);
  assert.equal((await call("owner", "DELETE", one)).status, 200);
  assert.equal((await call("viewer", "GET", one)).status, 404);
  assert.equal((await db.query("select 1 from sessions where id = $1", [s])).rows.length, 1);
  assert.equal((await db.query("select 1 from session_recording_chunks where session_id = $1", [s])).rows.length, 0);
});

test("old recordings are deleted after the retention time; deleting a session deletes its recording", { skip }, async () => {
  const old = await session(study), fresh = await session(study);
  for (const s of [old, fresh]) await call(null, "POST", `/api/public/sessions/${s}/recording`, { seq: 0, events: [ev(4, 1), ev(2, 2)] });
  await db.query("update session_recordings set created_at = now() - interval '100 days' where session_id = $1", [old]);
  assert.equal(await purge(90), 1);
  assert.equal(await purge(0), 0, "0 keeps recordings forever");
  assert.equal((await db.query("select 1 from session_recordings where session_id = $1", [fresh])).rows.length, 1);
  await db.query("delete from sessions where id = $1", [fresh]);
  assert.equal((await db.query("select 1 from session_recording_chunks where session_id = $1", [fresh])).rows.length, 0);
});
