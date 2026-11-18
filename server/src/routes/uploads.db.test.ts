// Upload routes (images and HTML prototypes) against a real PostgreSQL. Needs a throwaway database:
//   createdb -O redekorate redekorate_test
//   TEST_DATABASE_URL=postgres://redekorate:redekorate@localhost:5432/redekorate_test npm test -w server
// Without TEST_DATABASE_URL every test here is skipped. The database name must end in "_test": its tables are emptied.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "set TEST_DATABASE_URL to run" : !/_test(\?|$)/.test(url) ? "TEST_DATABASE_URL must point to a database whose name ends in _test" : false;

let server: Server, base = "", dir = "", cookie = "";
let closePool = async () => {};

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
async function upload(route: "" | "/prototype", name: string, body: Buffer, lang = "es") {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(body)]), name);
  const res = await fetch(`${base}/api/uploads${route}`, { method: "POST", body: fd, headers: { cookie, "x-requested-with": "redekorate", "x-lang": lang } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const onDisk = async () => (await readdir(dir).catch(() => [])).length;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  dir = await mkdtemp(path.join(tmpdir(), "rk-uploads-"));
  process.env.UPLOAD_DIR = dir;
  delete process.env.CLAMAV_HOST;
  const [{ default: express }, { default: cookieParser }, { pool }, { migrate }, auth, { uploads }, { errorHandler }, { csrfGuard }] = await Promise.all([
    import("express"), import("cookie-parser"), import("../lib/db.js"), import("../migrate.js"), import("../lib/auth.js"), import("./uploads.js"), import("../lib/http.js"), import("../lib/security.js"),
  ]);
  closePool = () => pool.end();
  await migrate();
  await pool.query("truncate users cascade");
  const { rows: [u] } = await pool.query("insert into users(email, name, password_hash, onboarded_at) values ('owner@test.local','owner','x', now()) returning id, email, name");
  auth.signSession({ cookie: (n: string, v: string) => { cookie = `${n}=${v}`; } } as any, { ...u, role: "member", avatar: null, onboarded_at: null }, 0);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api", csrfGuard);
  app.use("/api/uploads", uploads);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await closePool(); if (dir) await rm(dir, { recursive: true, force: true }); });

test("images and prototypes that pass the scan are stored", { skip }, async () => {
  const img = await upload("", "photo.png", PNG);
  assert.equal(img.status, 201);
  assert.match(img.body.url, /^\/uploads\/[a-z0-9]{24}\.png$/);
  const proto = await upload("/prototype", "proto.html", Buffer.from("<!doctype html><html><body><script>go()</script></body></html>"));
  assert.equal(proto.status, 201, "a prototype may run scripts (it is sandboxed)");
  assert.equal(await onDisk(), 2);
});

test("files the security scan refuses leave nothing on disk", { skip }, async () => {
  const before = await onDisk();
  assert.equal((await upload("", "doc.pdf", Buffer.from("%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n%%EOF"))).status, 415, "only images, by content");
  // Valid HTML markers around binary bytes (null bytes are never in text): refused before anything is written.
  const binary = Buffer.concat([Buffer.from("<html><body>"), Buffer.from([0x00, 0x01, 0x02]), Buffer.from("</body></html>")]);
  assert.equal((await upload("/prototype", "proto.html", binary, "en")).status, 415);
  assert.equal(await onDisk(), before);
});

test("with CLAMAV_HOST set, a match is refused (422) and a scanner that cannot answer fails closed (503)", { skip }, async () => {
  const net = await import("node:net");
  // A stand-in clamd that reports every stream as infected.
  const clamd = net.createServer((s) => {
    let got = Buffer.alloc(0);
    s.on("data", (d) => {
      got = Buffer.concat([got, d]);
      if (got.subarray(-4).equals(Buffer.alloc(4))) s.end("stream: Eicar-Test-Signature FOUND\0");
    });
  });
  await new Promise<void>((r) => clamd.listen(0, "127.0.0.1", r));
  const before = await onDisk();
  try {
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String((clamd.address() as AddressInfo).port);
    const found = await upload("", "photo.png", PNG);
    assert.equal(found.status, 422);
    assert.match(found.body.error, /antivirus/);
    await new Promise<void>((r) => clamd.close(() => r()));
    const down = await upload("", "photo.png", PNG);
    assert.equal(down.status, 503, "clamd configured but unreachable: refused, not accepted unscanned");
    process.env.CLAMAV_FAIL_OPEN = "true";
    assert.equal((await upload("", "photo.png", PNG)).status, 201, "CLAMAV_FAIL_OPEN=true lets it through");
  } finally {
    if (clamd.listening) clamd.close();
    for (const k of ["CLAMAV_HOST", "CLAMAV_PORT", "CLAMAV_FAIL_OPEN"]) delete process.env[k];
  }
  assert.equal(await onDisk(), before + 1, "only the fail-open upload was kept");
});
