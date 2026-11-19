// Sections and per-project access against a real PostgreSQL (see tickets.db.test.ts for the database it needs).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

type Who = "owner" | "designer" | "pm" | "scoped" | "everywhere";
let server: Server, base = "", org = "", alpha = "", beta = "", study = "";
const cookie = {} as Record<Who, string>, ids = {} as Record<Who, string>;
let closePool = async () => {};
let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
let acceptInvite: (inviteId: string, userId: string) => Promise<void>;

async function call(as: Who, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { cookie: cookie[as], "content-type": "application/json", "x-lang": "en" } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const status = async (as: Who, path: string) => (await call(as, "GET", path)).status;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, authRoutes, { tickets }, { milestones, roadmap, myWork }, { projects }, { studies }, { orgs }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"), import("./auth.js"),
    import("./tickets.js"), import("./roadmap.js"), import("./projects.js"), import("./studies.js"), import("./orgs.js"), import("../lib/http.js"),
  ]);
  db = pool; acceptInvite = authRoutes.acceptInvite;
  closePool = () => pool.end();
  await migrate();
  await pool.query("truncate users cascade");
  await pool.query("truncate organizations cascade");
  for (const who of ["owner", "designer", "pm", "scoped", "everywhere"] as Who[]) {
    const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ($1,$2,'x', now()) returning id, email, name", [`${who}@test.local`, who]);
    ids[who] = u.id;
    auth.signSession({ cookie: (n: string, v: string) => { cookie[who] = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  }
  org = (await pool.query("insert into organizations(name, created_by) values ('Acme', $1) returning id", [ids.owner])).rows[0].id;
  await pool.query("insert into organization_members(organization_id, user_id, role) values ($1,$2,'owner')", [org, ids.owner]);
  alpha = (await pool.query("insert into projects(owner_id, name, organization_id) values ($1,'Alpha',$2) returning id", [ids.owner, org])).rows[0].id;
  beta = (await pool.query("insert into projects(owner_id, name, organization_id) values ($1,'Beta',$2) returning id", [ids.owner, org])).rows[0].id;
  study = (await pool.query("insert into studies(project_id, owner_id, title, method, public_slug) values ($1,$2,'Survey','survey','slug-access') returning id", [alpha, ids.owner])).rows[0].id;

  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/projects/:id/tickets", tickets);
  app.use("/api/projects/:id/milestones", milestones);
  app.use("/api/projects/:id/roadmap", roadmap);
  app.use("/api/my-work", myWork);
  app.use("/api/projects", projects);
  app.use("/api/studies", studies);
  app.use("/api/orgs", orgs);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); });

test("a collaborator with only research cannot open tickets, and the other way round", { skip }, async () => {
  assert.equal((await call("owner", "POST", `/api/projects/${alpha}/members`, { email: "designer@test.local", role: "editor", areas: ["research"] })).status, 201);
  assert.equal((await call("owner", "POST", `/api/projects/${alpha}/members`, { email: "pm@test.local", role: "editor", areas: ["tickets"] })).status, 201);

  assert.deepEqual((await call("designer", "GET", `/api/projects/${alpha}`)).body.project.areas, ["research"]);
  assert.equal(await status("designer", `/api/projects/${alpha}/studies`), 200);
  assert.equal(await status("designer", `/api/studies/${study}`), 200);
  assert.equal(await status("designer", `/api/projects/${alpha}/tickets`), 403);
  assert.equal(await status("designer", `/api/projects/${alpha}/milestones`), 403);
  assert.equal((await call("designer", "POST", `/api/projects/${alpha}/tickets`, { title: "Nope" })).status, 403);

  assert.deepEqual((await call("pm", "GET", `/api/projects/${alpha}`)).body.project.areas, ["tickets"]);
  assert.equal(await status("pm", `/api/projects/${alpha}/tickets`), 200);
  assert.equal(await status("pm", `/api/projects/${alpha}/studies`), 403);
  assert.equal(await status("pm", `/api/projects/${alpha}/insights`), 403);
  assert.equal(await status("pm", `/api/studies/${study}`), 403);
  assert.equal((await call("pm", "PATCH", `/api/studies/${study}`, { title: "Hacked" })).status, 403);

  // Neither was added to Beta, so it does not exist for them.
  assert.equal(await status("designer", `/api/projects/${beta}`), 404);
});

test("tickets can only be assigned to people who can open tickets", { skip }, async () => {
  const people = (await call("owner", "GET", `/api/projects/${alpha}/tickets`)).body.people.map((p: any) => p.name).sort();
  assert.deepEqual(people, ["owner", "pm"]);
});

test("cross-project pages only count the sections a person has", { skip }, async () => {
  await call("owner", "POST", `/api/projects/${alpha}/tickets`, { title: "Fix the total", assignees: [ids.pm] });
  assert.equal((await call("pm", "GET", "/api/my-work")).body.tickets.length, 1);
  assert.equal((await call("designer", "GET", "/api/my-work")).body.tickets.length, 0);
});

test("an organization member limited to chosen projects only reaches those", { skip }, async () => {
  const added = await call("owner", "POST", `/api/orgs/${org}/members`, { email: "scoped@test.local", role: "member", all_projects: false, project_role: "viewer", areas: ["tickets"], project_ids: [beta] });
  assert.equal(added.status, 201);
  const row = added.body.members.find((m: any) => m.user_id === ids.scoped);
  assert.equal(row.all_projects, false);
  assert.deepEqual(row.projects, [{ id: beta, role: "viewer", areas: ["tickets"] }]);

  assert.equal(await status("scoped", `/api/projects/${alpha}`), 404);
  assert.equal(await status("scoped", `/api/projects/${beta}/tickets`), 200);
  assert.equal(await status("scoped", `/api/projects/${beta}/studies`), 403);
  assert.equal((await call("scoped", "POST", `/api/projects/${beta}/tickets`, { title: "Viewer cannot write" })).status, 403);
  assert.deepEqual((await call("scoped", "GET", `/api/orgs/${org}/projects`)).body.projects.map((p: any) => p.name), ["Beta"]);

  // Moving the choice to Alpha takes Beta away.
  await call("owner", "PATCH", `/api/orgs/${org}/members/${ids.scoped}`, { project_ids: [alpha] });
  assert.equal(await status("scoped", `/api/projects/${beta}`), 404);
  assert.equal(await status("scoped", `/api/projects/${alpha}/tickets`), 200);
});

test("an organization member with every project gets the chosen role and sections everywhere", { skip }, async () => {
  await call("owner", "POST", `/api/orgs/${org}/members`, { email: "everywhere@test.local", role: "member", project_role: "editor", areas: ["research"] });
  for (const p of [alpha, beta]) {
    const got = (await call("everywhere", "GET", `/api/projects/${p}`)).body.project;
    assert.equal(got.role, "editor");
    assert.deepEqual(got.areas, ["research"]);
    assert.equal(await status("everywhere", `/api/projects/${p}/tickets`), 403);
  }
  // Shown on the project as reaching it through the organization.
  const via = (await call("owner", "GET", `/api/projects/${beta}/members`)).body.via_org;
  assert.deepEqual(via.map((v: any) => [v.name, v.role, v.areas]), [["everywhere", "editor", ["research"]]]);
  // Admins keep everything, whatever was stored for them.
  await call("owner", "PATCH", `/api/orgs/${org}/members/${ids.everywhere}`, { role: "admin" });
  assert.equal(await status("everywhere", `/api/projects/${alpha}/tickets`), 200);
});

test("only organization admins change access, and a project from elsewhere is ignored", { skip }, async () => {
  assert.equal((await call("scoped", "PATCH", `/api/orgs/${org}/members/${ids.scoped}`, { all_projects: true, project_role: "editor" })).status, 403);
  const foreign = (await db.query("insert into projects(owner_id, name) values ($1,'Personal') returning id", [ids.owner])).rows[0].id;
  await call("owner", "PATCH", `/api/orgs/${org}/members/${ids.scoped}`, { project_ids: [alpha, foreign] });
  assert.equal(await status("scoped", `/api/projects/${foreign}`), 404);
});

test("an invitation carries its access to the new account", { skip }, async () => {
  const sent = await call("owner", "POST", `/api/orgs/${org}/invites`, { email: "new@test.local", role: "member", all_projects: false, project_role: "commenter", areas: ["research"], project_ids: [beta] });
  assert.equal(sent.status, 201);
  assert.deepEqual(sent.body.invites[0].project_ids, [beta]);
  const { rows: [u] } = await db.query("insert into users(email, name, password_hash) values ('new@test.local','New','x') returning id");
  await acceptInvite(sent.body.invites[0].id, u.id);
  const { rows: [om] } = await db.query("select role, all_projects, project_role, areas from organization_members where user_id = $1", [u.id]);
  assert.deepEqual(om, { role: "member", all_projects: false, project_role: "commenter", areas: ["research"] });
  const { rows } = await db.query("select project_id, role, areas from project_members where user_id = $1", [u.id]);
  assert.deepEqual(rows, [{ project_id: beta, role: "commenter", areas: ["research"] }]);
});
