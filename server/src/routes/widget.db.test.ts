// The feedback widget against a real PostgreSQL: settings by role, and what other sites may and may not do.
// Needs TEST_DATABASE_URL (a database whose name ends in _test).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readdirSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;
const uploadDir = mkdtempSync(path.join(os.tmpdir(), "rk-widget-"));
let server: Server, base = "", project = "", key = "", secret = "";
const cookie: Record<string, string> = {}, ids: Record<string, string> = {};
let closePool = async () => {};
let sql: (text: string, params?: unknown[]) => Promise<any[]> = async () => [];
let sign: (secret: string, id: string) => string = () => "";
const SITE = "https://app.acme.com";

async function team(as: string, method: string, path = "", body?: unknown) {
  const res = await fetch(`${base}/api/projects/${project}/widget${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { cookie: cookie[as], "content-type": "application/json", "x-lang": "en" } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
/** A feedback sent the way the script does: multipart, no cookies, with the site's Origin. */
async function send(payload: unknown, opts: { origin?: string | null; key?: string; files?: [string, Buffer, string][] } = {}) {
  const form = new FormData();
  form.append("payload", typeof payload === "string" ? payload : JSON.stringify(payload));
  for (const [field, buf, name] of opts.files ?? []) form.append(field, new Blob([buf]), name);
  const origin = opts.origin === undefined ? SITE : opts.origin;
  const res = await fetch(`${base}/api/widget/${opts.key ?? key}/feedback`, { method: "POST", body: form, headers: origin ? { origin } : {} });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any, headers: res.headers };
}
const config = async (origin: string | null, k = key) => { const res = await fetch(`${base}/api/widget/${k}/config`, { headers: origin ? { origin } : {} }); return { status: res.status, body: (await res.json()) as any, headers: res.headers }; };
const lastReporter = async () => (await sql("select r.*, t.title, t.type, t.status, t.source, t.number, t.id as tid from ticket_reporters r join tickets t on t.id = r.ticket_id order by r.created_at desc limit 1"))[0];
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url; process.env.UPLOAD_DIR = uploadDir; process.env.WIDGET_PER_IP_10MIN = "1000";
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, w, lib, { errorHandler }, { csrfGuard }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"), import("./widget.js"), import("../lib/widget.js"), import("../lib/http.js"), import("../lib/security.js"),
  ]);
  closePool = () => pool.end(); sign = lib.identitySignature;
  sql = async (text, params) => (await pool.query(text, params)).rows;
  await migrate();
  await pool.query("truncate users cascade");
  for (const who of ["owner", "editor", "viewer", "stranger"]) {
    const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ($1,$2,'x', now()) returning id, email, name", [`${who}@widget.local`, who]);
    ids[who] = u.id;
    auth.signSession({ cookie: (n: string, v: string) => { cookie[who] = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  }
  project = (await sql("insert into projects(owner_id, name) values ($1,'Fintech') returning id", [ids.owner]))[0].id;
  for (const who of ["editor", "viewer"]) await sql("insert into project_members(project_id, user_id, role) values ($1,$2,$3)", [project, ids[who], who]);
  // Same order as the real server: the widget's public routes sit before the same-origin guard.
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/widget", w.widgetPublic);
  app.use("/api", csrfGuard);
  app.use("/api/projects/:id/widget", w.widget);
  app.use("/api/projects/:id/tickets", (await import("./tickets.js")).tickets);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); });

test("settings follow the project roles; the secret is only shown to editors", { skip }, async () => {
  const H = { "x-requested-with": "redekorate" };
  const get = async (as: string) => { const r = await fetch(`${base}/api/projects/${project}/widget`, { headers: { cookie: cookie[as] } }); return { status: r.status, body: (await r.json()) as any }; };
  assert.equal((await get("stranger")).status, 404);
  const viewer = await get("viewer"), editor = await get("editor");
  assert.equal(viewer.body.widget.secret, null);
  assert.match(editor.body.widget.secret, /^rk_sec_/);
  assert.equal(viewer.body.widget.public_key, editor.body.widget.public_key, "looking at it twice does not create a second widget");
  key = editor.body.widget.public_key; secret = editor.body.widget.secret;
  const put = (as: string, body: unknown) => fetch(`${base}/api/projects/${project}/widget`, { method: "PUT", body: JSON.stringify(body), headers: { ...H, cookie: cookie[as], "content-type": "application/json" } });
  assert.equal((await put("viewer", { paused: true })).status, 403);
  assert.equal((await put("editor", { allowed_domains: ["https://App.Acme.com/caja", "app.acme.com", "*.staging.acme.com"] })).status, 200);
  assert.deepEqual((await get("editor")).body.widget.allowed_domains, ["app.acme.com", "*.staging.acme.com"], "cleaned and de-duplicated");
  assert.equal((await put("editor", { allowed_domains: ["not a domain"] })).status, 400);
  assert.equal((await put("editor", { settings: { look: { accent: "red" } } })).status, 400);
  assert.equal((await put("editor", { settings: { assignee_id: ids.stranger } })).status, 400, "tickets can only go to someone with access");
  assert.equal((await team("editor", "PUT", "", { paused: true })).status, 403, "team routes still need the same-origin header");
});

test("only the allowed domains get the configuration, and it carries no keys or people", { skip }, async () => {
  const ok = await config(SITE);
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(ok.body).sort(), ["allow", "look", "paused", "privacy"]);
  assert.equal(ok.headers.get("access-control-allow-origin"), SITE);
  assert.equal(ok.headers.get("cross-origin-resource-policy"), "cross-origin");
  assert.equal((await config("https://pr-7.staging.acme.com")).status, 200);
  assert.deepEqual([(await config("https://evil.example")).status, (await config("https://app.acme.com.evil.example")).status, (await config(null)).status], [403, 403, 403]);
  assert.equal((await config(SITE, "rk_pub_unknownkey0")).status, 404);
  assert.ok(!JSON.stringify(ok.body).includes("rk_sec_"));
});

test("a feedback becomes a ticket with who sent it and from where", { skip }, async () => {
  const r = await send({ kind: "broken", message: "El total del cierre no coincide con el POS. Me da 120 de diferencia.",
    user: { id: "u_1842", name: "Mike Jones", email: "Mike@Acme.com", meta: { plan: "Pro", nested: { no: 1 }, big: "x".repeat(900) } },
    details: { page_url: "https://app.acme.com/caja/cierre?fecha=2026-11-11", page_title: "Cierre", os: "Android 12", browser: "Chrome 130.0", console_errors: ["TypeError: x is undefined"] } });
  assert.equal(r.status, 201);
  assert.match(r.body.ref, /^FB-\d+$/);
  assert.deepEqual(Object.keys(r.body), ["ref"], "the site learns the reference and nothing else");
  const rep = await lastReporter();
  assert.deepEqual([rep.title, rep.type, rep.status, rep.source, rep.ref], ["El total del cierre no coincide con el POS", "bug", "todo", "widget", r.body.ref]);
  assert.deepEqual([rep.name, rep.email, rep.external_user_id, rep.verified, rep.reports_count], ["Mike Jones", "mike@acme.com", "u_1842", false, 1]);
  assert.equal(rep.metadata.kind, "broken");
  assert.equal(rep.metadata.console_errors, undefined, "console errors are off by default, so they are dropped even if a page sends them");
  assert.deepEqual(rep.custom_data, { plan: "Pro", big: "x".repeat(200) }, "custom data is kept small and flat");
  assert.deepEqual((await sql("select label from ticket_labels where ticket_id = $1", [rep.tid])).map((x) => x.label), ["feedback"]);
});

test("a user is verified only with a signature made with the secret", { skip }, async () => {
  await send({ kind: "idea", message: "Exportar a Excel", user: { id: "u_1842", name: "Mike Jones", email: "mike@acme.com", hash: sign(secret, "u_1842") } });
  let rep = await lastReporter();
  assert.deepEqual([rep.verified, rep.reports_count, rep.type], [true, 2, "design_change"], "second report from the same person");
  await send({ kind: "idea", message: "Soy otro", user: { id: "u_9999", name: "Mike Jones", hash: sign(secret, "u_1842") } });
  rep = await lastReporter();
  assert.equal(rep.verified, false, "a signature for another id proves nothing");
  await send({ kind: "question", message: "¿Cómo exporto?", email: "ana@example.com" });
  rep = await lastReporter();
  assert.deepEqual([rep.name, rep.email, rep.external_user_id, rep.verified, rep.type], [null, "ana@example.com", null, false, "task"]);
});

test("requests from elsewhere, bad payloads and bad files are refused", { skip }, async () => {
  const count = async () => (await sql("select count(*)::int as n from tickets"))[0].n;
  const before = await count();
  assert.equal((await send({ kind: "idea", message: "x" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await send({ kind: "idea", message: "x" }, { origin: null })).status, 403);
  assert.equal((await send({ kind: "idea", message: "x" }, { key: "rk_pub_unknownkey0" })).status, 404);
  assert.equal((await send({ kind: "rant", message: "x" })).status, 400);
  assert.equal((await send({ kind: "idea", message: "   " })).status, 400);
  assert.equal((await send("{not json")).status, 400);
  assert.equal((await send({ kind: "idea", message: "x", email: "nope" })).status, 400);
  const html = Buffer.from("<html><script>alert(1)</script></html>     ");
  assert.equal((await send({ kind: "idea", message: "x" }, { files: [["files", html, "page.html"]] })).status, 415, "only images, PDF and video, by content");
  assert.equal((await send({ kind: "idea", message: "x" }, { files: [["screenshot", Buffer.from("%PDF-1.4 not an image, padded"), "shot.png"]] })).status, 415, "a screenshot must be an image whatever its name");
  const infected = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog /OpenAction << /S /Launch /F (cmd.exe) >> >> endobj\n%%EOF");
  const blocked = await send({ kind: "idea", message: "x" }, { files: [["files", infected, "report.pdf"]] });
  assert.equal(blocked.status, 422, "a PDF with active content is refused by the security scan");
  assert.equal(blocked.body.error, "blocked");
  assert.equal(await count(), before, "none of them created a ticket");
});

test("attachments are stored under random names and only what the project allows is kept", { skip }, async () => {
  const pdf = Buffer.from("%PDF-1.4\n%%EOF padding padding");
  const r = await send({ kind: "broken", message: "Con adjuntos" }, { files: [["screenshot", PNG, "../../etc/passwd.png"], ["files", pdf, "../nota.pdf"]] });
  assert.equal(r.status, 201);
  let rep = await lastReporter();
  assert.match(rep.attachments.screenshot, /^\/uploads\/[a-z0-9]{24}\.png$/);
  assert.match(rep.attachments.files[0].url, /^\/uploads\/[a-z0-9]{24}\.pdf$/);
  assert.equal(rep.attachments.files[0].name, "nota.pdf", "the shown name has no path");
  assert.ok(readdirSync(uploadDir).every((f) => /^[a-z0-9]{24}\.(png|pdf)$/.test(f)));
  const H = { "x-requested-with": "redekorate", cookie: cookie.editor, "content-type": "application/json" };
  // An editor can take one attachment out of the report: it leaves the ticket and the disk, the rest stays.
  const fileUrl = rep.attachments.files[0].url as string;
  const removeAt = `${base}/api/projects/${project}/tickets/${rep.number}/attachments`;
  const removed = await fetch(removeAt, { method: "DELETE", headers: H, body: JSON.stringify({ url: fileUrl }) });
  assert.equal(removed.status, 200);
  rep = await lastReporter();
  assert.equal(rep.attachments.files, undefined);
  assert.match(rep.attachments.screenshot, /^\/uploads\//, "the screenshot stays");
  assert.ok(!readdirSync(uploadDir).includes(fileUrl.slice("/uploads/".length)), "the bytes are deleted");
  assert.equal((await fetch(removeAt, { method: "DELETE", headers: H, body: JSON.stringify({ url: fileUrl }) })).status, 404);
  assert.equal((await sql("select action, from_value from ticket_activity where ticket_id = $1 and action = 'attachment_removed'", [rep.tid]))[0]?.from_value, "nota.pdf");
  // Turn screenshots, files and details off: the same request now stores none of them.
  const s = (await (await fetch(`${base}/api/projects/${project}/widget`, { headers: H })).json() as any).widget.settings;
  await fetch(`${base}/api/projects/${project}/widget`, { method: "PUT", headers: H, body: JSON.stringify({ settings: { ...s, allow: { ...s.allow, screenshot: false, files: false, details: false }, assignee_id: ids.editor } }) });
  await send({ kind: "broken", message: "Sin adjuntos", details: { page_url: "https://app.acme.com/x" } }, { files: [["screenshot", PNG, "s.png"], ["files", pdf, "n.pdf"]] });
  rep = await lastReporter();
  assert.deepEqual(rep.attachments, {});
  assert.equal(rep.metadata.page_url, undefined);
  assert.deepEqual((await sql("select user_id from ticket_assignees where ticket_id = $1", [rep.tid])).map((x) => x.user_id), [ids.editor], "new tickets go to the chosen person");
});

test("pausing stops everything; rotating the key kills the old one", { skip }, async () => {
  const H = { "x-requested-with": "redekorate", cookie: cookie.editor, "content-type": "application/json" };
  const W = `${base}/api/projects/${project}/widget`;
  await fetch(W, { method: "PUT", headers: H, body: JSON.stringify({ paused: true }) });
  assert.deepEqual((await config(SITE)).body, { paused: true });
  assert.equal((await send({ kind: "idea", message: "x" })).status, 403);
  await fetch(W, { method: "PUT", headers: H, body: JSON.stringify({ paused: false }) });
  assert.equal((await fetch(`${W}/rotate-key`, { method: "POST", headers: { ...H, cookie: cookie.viewer } })).status, 403);
  const rotated = (await (await fetch(`${W}/rotate-key`, { method: "POST", headers: H })).json() as any).widget.public_key;
  assert.notEqual(rotated, key);
  assert.equal((await send({ kind: "idea", message: "x" })).status, 404, "the old key no longer works");
  assert.equal((await send({ kind: "idea", message: "con la clave nueva" }, { key: rotated })).status, 201);
  const t = await fetch(`${W}/test`, { method: "POST", headers: H });
  assert.equal(t.status, 201);
  const rep = await lastReporter();
  assert.deepEqual([rep.name, rep.verified, rep.source], ["editor", true, "widget"], "the test feedback is sent as the signed-in person");
});
