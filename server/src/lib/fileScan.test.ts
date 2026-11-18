import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { deflateSync } from "node:zlib";
import { translate } from "./i18n.js";
import { FileRejected, SCAN_MESSAGES, clamConfig, clamScan, inspect, magicType, pdfActiveContent, scanUpload, scriptedMarkup, type ClamConfig } from "./fileScan.js";

const pdf = (body: string) => Buffer.from(`%PDF-1.7\n%\xe2\xe3\xcf\xd3\n${body}\ntrailer << /Root 1 0 R >>\n%%EOF\n`, "latin1");
const CLEAN_PDF = pdf("1 0 obj << /Type /Catalog /Pages 2 0 R /OpenAction [3 0 R /Fit] >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n4 0 obj << /Length 8 >>\nstream\n/JS /AA \nendstream\nendobj");
const zip = (...names: string[]) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), ...names.map((n) => Buffer.from(`\0\0\0\0${n}\0\0`))]);
const NO_AV = { clam: null };

async function rejection(p: Promise<unknown>): Promise<FileRejected> {
  try { await p; } catch (e) { assert.ok(e instanceof FileRejected, String(e)); return e; }
  assert.fail("expected the upload to be rejected");
}

test("a clean PDF passes, even with an /OpenAction that only opens a page and odd bytes inside its streams", async () => {
  assert.deepEqual(pdfActiveContent(CLEAN_PDF), []);
  await scanUpload(CLEAN_PDF, "pdf", "test", NO_AV);
});

test("PDFs with active content are rejected with 422", async () => {
  const js = pdf("1 0 obj << /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj");
  assert.deepEqual(pdfActiveContent(js), ["JS", "JavaScript"]);
  const e = await rejection(scanUpload(js, "pdf", "test", NO_AV));
  assert.equal(e.status, 422);
  assert.equal(e.reason, "pdf_active");
  assert.match(e.message, /PDF/);
  for (const [body, name] of [
    ["1 0 obj << /S /Launch /F (cmd.exe) >> endobj", "Launch"],
    ["1 0 obj << /Names << /EmbeddedFiles 2 0 R >> >> endobj", "EmbeddedFiles"],
    ["1 0 obj << /Type /Annot /AA << /O 2 0 R >> >> endobj", "AA"],
    ["1 0 obj << /AcroForm << /XFA 5 0 R >> >> endobj", "XFA"],
    ["1 0 obj << /Subtype /RichMedia >> endobj", "RichMedia"],
    ["1 0 obj << /S /J#61vaScript /J#53 (x) >> endobj", "JavaScript"],   // hex-escaped names
  ]) assert.ok(pdfActiveContent(pdf(body)).includes(name), name);
});

test("active content hidden in a compressed object stream is found", () => {
  const inner = deflateSync(Buffer.from("5 0 << /S /JavaScript /JS (this.print()) >>"));
  const body = Buffer.concat([
    Buffer.from("1 0 obj << /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length " + inner.length + " >>\nstream\n", "latin1"), inner, Buffer.from("\nendstream\nendobj", "latin1")]);
  const file = Buffer.concat([Buffer.from("%PDF-1.7\n"), body, Buffer.from("\n%%EOF\n")]);
  assert.deepEqual(pdfActiveContent(file), ["JS", "JavaScript"]);
});

test("the real type must match the extension", async () => {
  const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 0x90)]);
  assert.equal(magicType(exe), "exe");
  const e = await rejection(scanUpload(exe, "pdf", "test", NO_AV));
  assert.equal(e.status, 422);
  assert.equal(e.reason, "mismatch");
  assert.equal(inspect(CLEAN_PDF, "docx")?.reason, "mismatch");
  assert.equal(inspect(Buffer.from("plain text"), "pdf")?.reason, "mismatch");
  assert.equal(inspect(zip("evil.exe"), "docx")?.reason, "mismatch", "any zip renamed .docx");
  assert.equal(inspect(zip("[Content_Types].xml", "xl/workbook.xml"), "docx")?.reason, "mismatch", "a spreadsheet renamed .docx");
  assert.equal(inspect(Buffer.from("x"), "exe")?.reason, "mismatch", "an extension that is never accepted");
});

test("Office files with macros are rejected; plain ones pass", () => {
  assert.equal(inspect(zip("[Content_Types].xml", "word/document.xml"), "docx"), null);
  assert.equal(inspect(zip("[Content_Types].xml", "word/document.xml", "word/vbaProject.bin"), "docx")?.reason, "macros");
  assert.equal(inspect(zip("[Content_Types].xml", "xl/workbook.xml", "xl/macrosheets/sheet1.xml"), "xlsx")?.reason, "macros");
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  assert.equal(inspect(ole, "doc"), null);
  assert.equal(inspect(Buffer.concat([ole, Buffer.from("_VBA_PROJECT", "utf16le")]), "doc")?.reason, "macros");
});

test("text files that are HTML or SVG pages with scripts are rejected, unless scripts are allowed", () => {
  assert.equal(scriptedMarkup("# Notes\n\nUse `<script>` tags carefully."), false, "Markdown that mentions a tag");
  assert.equal(scriptedMarkup("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>"), true);
  assert.equal(scriptedMarkup("﻿  <!DOCTYPE html><html><script>alert(1)</script></html>"), true);
  assert.equal(scriptedMarkup("<html><body>Just a page</body></html>"), false);
  const page = Buffer.from("<html><script>steal()</script></html>");
  assert.equal(inspect(page, "md")?.reason, "script");
  assert.equal(inspect(page, "html", { allowScripts: true }), null, "HTML prototypes are meant to run (sandboxed)");
  assert.equal(inspect(Buffer.from("a,b\n1,2\n"), "csv"), null);
});

test("clamConfig reads the environment", () => {
  assert.equal(clamConfig({}), null);
  assert.deepEqual(clamConfig({ CLAMAV_HOST: "clamav" }), { host: "clamav", port: 3310, timeoutMs: 30_000, failOpen: false });
  assert.deepEqual(clamConfig({ CLAMAV_HOST: "av", CLAMAV_PORT: "3311", CLAMAV_TIMEOUT_MS: "500", CLAMAV_FAIL_OPEN: "true" }), { host: "av", port: 3311, timeoutMs: 500, failOpen: true });
});

/** A fake clamd: reads one INSTREAM upload and answers with the verdict for its bytes (or never answers). */
async function fakeClamd(answer: (bytes: Buffer) => string | null): Promise<{ cfg: ClamConfig; received: Buffer[]; close: () => Promise<void> }> {
  const received: Buffer[] = [];
  const server = net.createServer((sock) => {
    let data = Buffer.alloc(0);
    sock.on("data", (d) => {
      data = Buffer.concat([data, d]);
      const cmd = "zINSTREAM\0";
      if (data.length < cmd.length) return;
      assert.equal(data.toString("latin1", 0, cmd.length), cmd);
      const parts: Buffer[] = [];
      let at = cmd.length;
      while (at + 4 <= data.length) {
        const len = data.readUInt32BE(at);
        if (len === 0) {
          const bytes = Buffer.concat(parts);
          received.push(bytes);
          const reply = answer(bytes);
          if (reply !== null) sock.end(reply + "\0");
          return;
        }
        if (at + 4 + len > data.length) return;
        parts.push(data.subarray(at + 4, at + 4 + len));
        at += 4 + len;
      }
    });
    sock.on("error", () => {});
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  return { cfg: { host: "127.0.0.1", port, timeoutMs: 2_000, failOpen: false }, received, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) };
}

test("clamd: OK lets the file through, FOUND rejects it with 422", async () => {
  const av = await fakeClamd((b) => (b.includes("EICAR") ? "stream: Eicar-Test-Signature FOUND" : "stream: OK"));
  try {
    const big = pdf("1 0 obj << /Type /Catalog >> endobj\n%" + "x".repeat(200_000));   // several INSTREAM chunks
    await scanUpload(big, "pdf", "test", { clam: av.cfg });
    assert.deepEqual(av.received[0], big, "clamd received exactly the file's bytes");
    assert.deepEqual(await clamScan(Buffer.from("hello"), av.cfg), { status: "clean" });
    const e = await rejection(scanUpload(Buffer.from("X5O!P%@AP EICAR test file"), "txt", "test", { clam: av.cfg }));
    assert.equal(e.status, 422);
    assert.equal(e.reason, "malware");
    assert.equal(e.detail, "Eicar-Test-Signature");
  } finally { await av.close(); }
});

test("clamd unreachable or silent: fail closed with 503, or let the file through with CLAMAV_FAIL_OPEN", async () => {
  const closed = await fakeClamd(() => "stream: OK");
  const cfg = closed.cfg;
  await closed.close();   // nothing listens on that port any more
  const e = await rejection(scanUpload(Buffer.from("notes"), "txt", "test", { clam: cfg }));
  assert.equal(e.status, 503);
  assert.equal(e.reason, "unavailable");
  await scanUpload(Buffer.from("notes"), "txt", "test", { clam: { ...cfg, failOpen: true } });

  const silent = await fakeClamd(() => null);
  try {
    const r = await clamScan(Buffer.from("notes"), { ...silent.cfg, timeoutMs: 150 });
    assert.equal(r.status, "error");
    assert.match((r as { detail: string }).detail, /did not answer/);
  } finally { await silent.close(); }

  const failing = await fakeClamd(() => "INSTREAM size limit exceeded. ERROR");
  try { assert.equal((await rejection(scanUpload(Buffer.from("notes"), "txt", "test", { clam: failing.cfg }))).reason, "unavailable"); }
  finally { await failing.close(); }
});

test("the built-in checks run before the antivirus is asked", async () => {
  const av = await fakeClamd(() => "stream: OK");
  try {
    await rejection(scanUpload(Buffer.from("MZ" + "\0".repeat(20), "latin1"), "pdf", "test", { clam: av.cfg }));
    assert.equal(av.received.length, 0);
  } finally { await av.close(); }
});

test("every rejection message has an English translation", () => {
  for (const m of Object.values(SCAN_MESSAGES)) assert.notEqual(translate(m, "en"), m, m);
});

test("a Latin-1 HTML prototype is still text", () => {
  assert.equal(inspect(Buffer.from("<html><body><p>Caf\xe9 y se\xf1al</p><script>go()</script></body></html>", "latin1"), "html", { allowScripts: true }), null);
});
