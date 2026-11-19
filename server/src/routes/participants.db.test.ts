// Participant routes against a real PostgreSQL (see research.db.test.ts for the database it needs).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

let server: Server, base = "", project = "", cookie = "";
let db: typeof import("../lib/db.js");
let closePool = async () => {};

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/participants${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { cookie, "content-type": "application/json", "x-lang": "en" },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, dbm, { migrate }, auth, { participants }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"),
    import("./participants.js"), import("../lib/http.js"),
  ]);
  db = dbm;
  closePool = () => dbm.pool.end();
  await migrate();
  await dbm.query("truncate users cascade");
  const u = (await dbm.one<{ id: string; email: string; name: string }>(
    "insert into users(email, name, password_hash, onboarded_at) values ('owner@participants.test','The owner','x', now()) returning id, email, name"))!;
  auth.signSession({ cookie: (n: string, v: string) => { cookie = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  project = (await dbm.one<{ id: string }>("insert into projects(owner_id, name) values ($1,'Recruiting') returning id", [u.id]))!.id;
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/participants", participants);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => { server?.close(); await closePool(); });

test("contact details are only saved with informed consent, on create and on every edit", { skip }, async () => {
  const refused = await call("POST", "/", { project_id: project, name: "Ana", email: "ana@example.com" });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error, "To keep the phone or email, tick that they gave informed consent");
  assert.equal((await call("POST", "/", { project_id: project, name: "Ana", phone: "555 0100" })).status, 400);

  // A name alone needs no consent.
  const bare = await call("POST", "/", { project_id: project, name: "Luis" });
  assert.equal(bare.status, 201);
  assert.equal((await call("PATCH", `/${bare.body.participant.id}`, { phone: "555 0101" })).status, 400);
  assert.equal((await call("PATCH", `/${bare.body.participant.id}`, { phone: "555 0101", consent: true })).status, 200);

  const ok = await call("POST", "/", { project_id: project, name: "Ana", email: "ana@example.com", consent: true });
  assert.equal(ok.status, 201);
  // Taking consent back while the email is still there is refused; taking both away is fine.
  assert.equal((await call("PATCH", `/${ok.body.participant.id}`, { consent: false })).status, 400);
  const cleared = await call("PATCH", `/${ok.body.participant.id}`, { consent: false, email: "" });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.participant.consent, false);

  const rows = await db.query<{ name: string; email: string; phone: string; consent: boolean }>(
    "select name, email, phone, consent from participants where project_id = $1 order by name", [project]);
  assert.ok(rows.every((r) => r.consent || (!r.email && !r.phone)), "nobody without consent keeps contact details");
});

test("the list counts, per study, the responses whose link said who answered — never previews, never the values", { skip }, async () => {
  const owner = (await db.one<{ owner_id: string }>("select owner_id from projects where id = $1", [project]))!.owner_id;
  const study = (await db.one<{ id: string }>("insert into studies(project_id, owner_id, title, method, public_slug) values ($1,$2,'Survey','survey','participants-test') returning id", [project, owner]))!.id;
  for (const p of [{ name: "Ana", email: "ana@example.com" }, { pid: "42" }, {}, { consent: "aceptado" }, { preview: "1", name: "Me" }])
    await db.query("insert into sessions(study_id, participant) values ($1,$2)", [study, JSON.stringify(p)]);
  const r = await call("GET", `/?project_id=${project}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.identified_responses, [{ study_id: study, title: "Survey", count: 2 }]);
});
