import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, disposition, fileKind } from "./projectFiles.js";

const pdf = Buffer.from("%PDF-1.7\n…"), zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), text = Buffer.from("# Título\n\nHola");

test("accepts the allowed formats when the content matches", () => {
  assert.equal(fileKind("Plan.PDF", pdf)?.ext, "pdf");
  assert.equal(fileKind("notas.md", text)?.mime, "text/markdown; charset=utf-8");
  assert.equal(fileKind("brief.docx", zip)?.ext, "docx");
  assert.equal(fileKind("datos.xlsx", zip)?.inline, false);
  assert.equal(fileKind("viejo.doc", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))?.ext, "doc");
});

test("refuses other formats and content that does not match the extension", () => {
  assert.equal(fileKind("page.html", Buffer.from("<script>alert(1)</script>")), null);
  assert.equal(fileKind("logo.svg", Buffer.from("<svg/>")), null);
  assert.equal(fileKind("run.exe", zip), null);
  assert.equal(fileKind("fake.pdf", text), null, "a text file renamed to .pdf");
  assert.equal(fileKind("fake.docx", pdf), null);
  assert.equal(fileKind("binary.md", Buffer.from([0x23, 0x00, 0x41])), null, "text files cannot hold NUL bytes");
  assert.equal(fileKind("empty.md", Buffer.alloc(0)), null);
  assert.equal(fileKind("noextension", text), null);
});

test("cleans names without losing the extension", () => {
  assert.equal(cleanName("../../etc/passwd.md"), "passwd.md");
  assert.equal(cleanName("C:\\Users\\me\\Plan  final.docx"), "Plan final.docx");
  assert.equal(cleanName("a\u0000b<c>.pdf"), "abc.pdf");
  assert.equal(cleanName(".hidden.md"), "hidden.md");
  const long = cleanName("x".repeat(300) + ".pdf");
  assert.equal(long.length, 160);
  assert.ok(long.endsWith(".pdf"));
});

test("download headers survive quotes and accents", () => {
  assert.equal(disposition('Guía "v2".pdf', false), `attachment; filename="Gu_a _v2_.pdf"; filename*=UTF-8''Gu%C3%ADa%20%22v2%22.pdf`);
  assert.ok(disposition("a.pdf", true).startsWith("inline;"));
});
