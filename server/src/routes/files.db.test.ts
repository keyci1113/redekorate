// Project files against a real PostgreSQL: set TEST_DATABASE_URL to a database whose name ends in _test.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

type Who = "owner" | "viewer" | "pm" | "outsider";
let server: Server, base = "", project = "", other = "", dir = "";
const cookie = {} as Record<Who, string>, ids = {} as Record<Who, string>;
let closePool = async () => {};

const PDF = Buffer.from("%PDF-1.4 test");
async function upload(as: Who, projectId: string, name: string, body: Buffer) {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(body)]), name);
  const res = await fetch(`${base}/api/projects/${projectId}/files`, { method: "POST", body: fd, headers: { cookie: cookie[as] } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const call = async (as: Who, method: string, p: string, body?: unknown) => {
  const res = await fetch(`${base}${p}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { cookie: cookie[as], "content-type": "application/json" } });
  return { status: res.status, headers: res.headers, text: await res.text() };
};
const onDisk = async () => (await readdir(path.join(dir, ".files")).catch(() => [])).length;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  dir = await mkdtemp(path.join(tmpdir(), "rk-files-"));
  process.env.UPLOAD_DIR = dir;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, { files }, { projects }, { errorHandler }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"), import("./files.js"), import("./projects.js"), import("../lib/http.js"),
  ]);
  closePool = () => pool.end();
  await migrate();
  await pool.query("truncate users cascade");
  for (const who of ["owner", "viewer", "pm", "outsider"] as Who[]) {
    const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ($1,$2,'x', now()) returning id, email, name", [`${who}@test.local`, who]);
    ids[who] = u.id;
    auth.signSession({ cookie: (n: string, v: string) => { cookie[who] = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  }
  project = (await pool.query("insert into projects(owner_id, name) values ($1,'Alpha') returning id", [ids.owner])).rows[0].id;
  other = (await pool.query("insert into projects(owner_id, name) values ($1,'Other') returning id", [ids.outsider])).rows[0].id;
  await pool.query("insert into project_members(project_id, user_id, role) values ($1,$2,'viewer')", [project, ids.viewer]);
  await pool.query("insert into project_members(project_id, user_id, role) values ($1,$2,'editor')", [project, ids.pm]);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/projects/:id/files", files);
  app.use("/api/projects", projects);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); if (dir) await rm(dir, { recursive: true, force: true }); });

test("editors upload, everyone in the project downloads, nobody else does", { skip }, async () => {
  const up = await upload("owner", project, "Guía de campo.pdf", PDF);
  assert.equal(up.status, 201);
  const [f] = up.body.files;
  assert.equal(f.name, "Guía de campo.pdf");
  assert.equal(f.uploaded_by_name, "owner");
  assert.equal(await onDisk(), 1);

  const got = await call("viewer", "GET", `/api/projects/${project}/files/${f.id}`);
  assert.equal(got.status, 200);
  assert.equal(got.text, "%PDF-1.4 test");
  assert.match(got.headers.get("content-disposition")!, /^attachment; .*filename\*=UTF-8''Gu%C3%ADa%20de%20campo\.pdf$/);
  assert.equal(got.headers.get("x-content-type-options"), "nosniff");
  assert.match((await call("viewer", "GET", `/api/projects/${project}/files/${f.id}?view=1`)).headers.get("content-disposition")!, /^inline/);

  // Any editor in the project can add files; a viewer can't.
  assert.equal((await upload("pm", project, "notes.md", Buffer.from("# Notes"))).status, 201);
  assert.equal((await upload("viewer", project, "x.md", Buffer.from("x"))).status, 403);
  assert.equal((await call("outsider", "GET", `/api/projects/${project}/files`)).status, 404);
  assert.equal((await call("outsider", "GET", `/api/projects/${project}/files/${f.id}`)).status, 404);
  // A file cannot be fetched through another project's address.
  assert.equal((await call("outsider", "GET", `/api/projects/${other}/files/${f.id}`)).status, 404);
});

test("only the allowed formats get in", { skip }, async () => {
  assert.equal((await upload("owner", project, "page.html", Buffer.from("<script>1</script>"))).status, 415);
  assert.equal((await upload("owner", project, "fake.pdf", Buffer.from("plain text"))).status, 422, "content that is not what the extension says");
  const infected = await upload("owner", project, "invoice.pdf", Buffer.from("%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n%%EOF"));
  assert.equal(infected.status, 422, "a PDF with JavaScript is refused by the security scan");
  assert.match(infected.body.error, /PDF/);
  assert.equal(await onDisk(), 2, "refused files leave nothing on disk");
});

test("text is shown as plain text, never as a page", { skip }, async () => {
  const { files } = JSON.parse((await call("owner", "GET", `/api/projects/${project}/files`)).text);
  const md = files.find((f: any) => f.name === "notes.md");
  const got = await call("owner", "GET", `/api/projects/${project}/files/${md.id}?view=1`);
  assert.equal(got.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.match(got.headers.get("content-security-policy")!, /sandbox/);
});

test("renaming keeps the extension; deleting removes the bytes", { skip }, async () => {
  const { files } = JSON.parse((await call("owner", "GET", `/api/projects/${project}/files`)).text);
  const pdf = files.find((f: any) => f.name.endsWith(".pdf"));
  assert.equal((await call("viewer", "PATCH", `/api/projects/${project}/files/${pdf.id}`, { name: "x" })).status, 403);
  const renamed = JSON.parse((await call("owner", "PATCH", `/api/projects/${project}/files/${pdf.id}`, { name: "Field guide.exe" })).text).files.find((f: any) => f.id === pdf.id);
  assert.equal(renamed.name, "Field guide.exe.pdf");
  assert.equal((await call("viewer", "DELETE", `/api/projects/${project}/files/${pdf.id}`)).status, 403);
  assert.equal((await call("owner", "DELETE", `/api/projects/${project}/files/${pdf.id}`)).status, 200);
  assert.equal(await onDisk(), 1);
});

test("deleting the project removes its files from disk", { skip }, async () => {
  assert.equal((await call("owner", "DELETE", `/api/projects/${project}`)).status, 200);
  assert.equal(await onDisk(), 0);
});
