// A document shared by email, against a real PostgreSQL (see tickets.db.test.ts for the database it needs).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

type Who = "owner" | "viewer" | "commenter" | "editor" | "teamViewer" | "stranger";
let server: Server, base = "", project = "", doc = "", other = "", study = "";
const cookie = {} as Record<Who, string>, ids = {} as Record<Who, string>;
let closePool = async () => {};
let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
let acceptInvite: (inviteId: string, userId: string) => Promise<void>;

async function call(as: Who, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { cookie: cookie[as], "content-type": "application/json", "x-lang": "en" } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const status = async (as: Who, method: string, path: string, body?: unknown) => (await call(as, method, path, body)).status;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, authRoutes, { projects }, { documents }, { studies }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"), import("./auth.js"),
    import("./projects.js"), import("./documents.js"), import("./studies.js"), import("../lib/http.js"),
  ]);
  db = pool; acceptInvite = authRoutes.acceptInvite;
  closePool = () => pool.end();
  await migrate();
  await pool.query("truncate users cascade");
  for (const who of ["owner", "viewer", "commenter", "editor", "teamViewer", "stranger"] as Who[]) {
    const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ($1,$2,'x', now()) returning id, email, name", [`${who.toLowerCase()}@test.local`, who]);
    ids[who] = u.id;
    auth.signSession({ cookie: (n: string, v: string) => { cookie[who] = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  }
  project = (await pool.query("insert into projects(owner_id, name) values ($1,'Alpha') returning id", [ids.owner])).rows[0].id;
  doc = (await pool.query("insert into documents(project_id, owner_id, kind, title, language, data) values ($1,$2,'diagram','Flow','en','{}') returning id", [project, ids.owner])).rows[0].id;
  other = (await pool.query("insert into documents(project_id, owner_id, kind, title, language, data) values ($1,$2,'text','Other','en','{}') returning id", [project, ids.owner])).rows[0].id;
  study = (await pool.query("insert into studies(project_id, owner_id, title, method, public_slug) values ($1,$2,'Survey','survey','slug-share') returning id", [project, ids.owner])).rows[0].id;
  await pool.query("insert into project_members(project_id, user_id, role) values ($1,$2,'viewer')", [project, ids.teamViewer]);

  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/projects", projects);
  app.use("/api/documents", documents);
  app.use("/api/studies", studies);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); });

test("people with an account get the document at once, with the role chosen", { skip }, async () => {
  for (const who of ["viewer", "commenter", "editor"] as const) {
    const r = await call("owner", "POST", `/api/documents/${doc}/people`, { email: `${who}@test.local`, role: who });
    assert.equal(r.status, 201);
    assert.equal(r.body.added, "user");
  }
  const list = await call("owner", "GET", `/api/documents/${doc}/people`);
  assert.deepEqual(list.body.people.map((p: any) => p.role).sort(), ["commenter", "editor", "viewer"]);

  for (const who of ["viewer", "commenter", "editor"] as const) {
    const r = await call(who, "GET", `/api/documents/${doc}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.project.role, who);
    assert.equal(r.body.project.project_role, null);
  }
  const shared = await call("commenter", "GET", "/api/documents/shared");
  assert.deepEqual(shared.body.documents.map((d: any) => [d.title, d.role, d.project_name, d.shared_by]), [["Flow", "commenter", "Alpha", "owner"]]);
});

test("a share reaches that document only, never the project", { skip }, async () => {
  assert.equal(await status("editor", "GET", `/api/documents/${other}`), 404);
  assert.equal(await status("editor", "GET", `/api/projects/${project}`), 404);
  assert.equal(await status("editor", "GET", `/api/documents?project_id=${project}`), 404);
  assert.equal(await status("editor", "GET", `/api/studies/${study}`), 404);
  assert.equal(await status("editor", "GET", `/api/projects/${project}/comments`), 404);
  assert.equal(await status("stranger", "GET", `/api/documents/${doc}`), 404);
});

test("view reads, comment adds comments, edit changes the document; none of them delete, duplicate or share", { skip }, async () => {
  assert.equal(await status("viewer", "PATCH", `/api/documents/${doc}`, { title: "Nope" }), 403);
  assert.equal(await status("viewer", "POST", `/api/projects/${project}/comments`, { document_id: doc, body: "Hi" }), 403);
  assert.equal(await status("viewer", "GET", `/api/projects/${project}/comments?document_id=${doc}`), 200);

  assert.equal(await status("commenter", "PATCH", `/api/documents/${doc}`, { title: "Nope" }), 403);
  const c = await call("commenter", "POST", `/api/projects/${project}/comments`, { document_id: doc, body: "Looks good" });
  assert.equal(c.status, 201);
  // a document id from this project does not open comments on the study, nor on the project itself
  assert.equal(await status("commenter", "POST", `/api/projects/${project}/comments`, { study_id: study, body: "Hi" }), 404);
  assert.equal(await status("commenter", "POST", `/api/projects/${project}/comments`, { body: "Hi" }), 404);
  // their own comment can go; someone else's cannot
  const mine = c.body.comments.find((x: any) => x.body === "Looks good").id;
  const owners = (await call("owner", "POST", `/api/projects/${project}/comments`, { document_id: doc, body: "Thanks" })).body.comments.find((x: any) => x.body === "Thanks").id;
  assert.equal(await status("commenter", "DELETE", `/api/projects/${project}/comments/${owners}`), 403);
  assert.equal(await status("commenter", "DELETE", `/api/projects/${project}/comments/${mine}`), 200);

  const e = await call("editor", "PATCH", `/api/documents/${doc}`, { title: "Flow v2" });
  assert.equal(e.status, 200);
  assert.equal(e.body.document.title, "Flow v2");
  for (const [method, path] of [["DELETE", `/api/documents/${doc}`], ["POST", `/api/documents/${doc}/duplicate`], ["POST", `/api/documents/${doc}/share`],
    ["GET", `/api/documents/${doc}/people`], ["POST", `/api/documents/${doc}/people`]] as const) {
    assert.equal(await status("editor", method, path, method === "POST" && path.endsWith("people") ? { email: "stranger@test.local", role: "viewer" } : undefined), 403, `${method} ${path}`);
  }
  assert.ok((await db.query("select 1 from documents where id = $1", [doc])).rows.length);
});

test("a share lifts a lower project role on that document, and the higher one wins", { skip }, async () => {
  assert.equal((await call("teamViewer", "GET", `/api/documents/${doc}`)).body.project.role, "viewer");
  await call("owner", "POST", `/api/documents/${doc}/people`, { email: "teamviewer@test.local", role: "editor" });
  const r = await call("teamViewer", "GET", `/api/documents/${doc}`);
  assert.equal(r.body.project.role, "editor");
  assert.equal(r.body.project.project_role, "viewer");
  assert.equal(await status("teamViewer", "PATCH", `/api/documents/${doc}`, { title: "Flow v3" }), 200);
  assert.equal(await status("teamViewer", "DELETE", `/api/documents/${doc}`), 403);
  assert.equal(await status("teamViewer", "PATCH", `/api/documents/${other}`, { title: "Nope" }), 403);
});

test("changing the role and removing the person take effect at once", { skip }, async () => {
  assert.equal((await call("owner", "PATCH", `/api/documents/${doc}/people/${ids.editor}`, { role: "viewer" })).status, 200);
  assert.equal(await status("editor", "PATCH", `/api/documents/${doc}`, { title: "Nope" }), 403);
  assert.equal((await call("owner", "DELETE", `/api/documents/${doc}/people/${ids.editor}`)).status, 200);
  assert.equal(await status("editor", "GET", `/api/documents/${doc}`), 404);
  // a person can also take themselves off
  assert.equal(await status("viewer", "DELETE", `/api/documents/${doc}/people/${ids.viewer}`), 200);
  assert.equal(await status("viewer", "GET", `/api/documents/${doc}`), 404);
});

test("someone without an account gets an invitation that becomes the share when they sign up", { skip }, async () => {
  const r = await call("owner", "POST", `/api/documents/${doc}/people`, { email: "New.Person@test.local", role: "commenter" });
  assert.equal(r.status, 201);
  assert.equal(r.body.added, "invite");
  assert.match(r.body.link, /\/invite\?token=/);
  assert.deepEqual(r.body.invites.map((i: any) => [i.email, i.role]), [["new.person@test.local", "commenter"]]);
  const { rows: [row] } = await db.query("select id, document_id, doc_role, expires_at > now() + interval '6 days' as week from invites where email = 'new.person@test.local'");
  assert.equal(row.document_id, doc);
  assert.equal(row.doc_role, "commenter");
  assert.equal(row.week, true);

  const { rows: [u] } = await db.query("insert into users(email, name, password_hash) values ('new.person@test.local','New','x') returning id");
  await acceptInvite(row.id, u.id);
  const { rows: [share] } = await db.query("select role from document_shares where document_id = $1 and user_id = $2", [doc, u.id]);
  assert.equal(share.role, "commenter");
  assert.equal((await call("owner", "GET", `/api/documents/${doc}/people`)).body.invites.length, 0);
});

test("a cancelled invitation can no longer be used", { skip }, async () => {
  const r = await call("owner", "POST", `/api/documents/${doc}/people`, { email: "later@test.local", role: "viewer" });
  const id = r.body.invites[0].id;
  assert.equal((await call("owner", "DELETE", `/api/documents/${doc}/invites/${id}`)).body.invites.length, 0);
  const { rows: [row] } = await db.query("select expires_at <= now() as dead from invites where id = $1", [id]);
  assert.equal(row.dead, true);
});
