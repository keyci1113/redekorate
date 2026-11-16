import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { docPreview, previewImage, projectReportPreview, reportPreview, studyPreview } from "./linkPreview.js";
import { renderIndexHtml } from "./seo.js";

const BASE = "https://ux.redekorate.com";
const html = readFileSync(new URL("../../../web/index.html", import.meta.url), "utf8");
const meta = (out: string, attr: string, key: string) => out.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];

test("a study link shows the study's name, in the study's language", () => {
  const p = studyPreview({ title: "Checkout test", status: "live", settings: { language: "en", brand: { logo: "/uploads/logo.png", color: "#2563EB" } }, org_logo: null, org_color: null });
  assert.equal(p.title, "Checkout test");
  assert.match(p.description, /invited to take part/);
  assert.equal(p.image, "/uploads/logo.png");
  assert.equal(p.color, "#2563EB");
  const es = studyPreview({ title: "Prueba", status: "closed", settings: {}, org_logo: null, org_color: "#059669" });
  assert.match(es.description, /ya no recibe respuestas/);
  assert.equal(es.color, "#059669");
});

test("reports, project reports and docs get their own titles", () => {
  assert.equal(reportPreview({ title: "SUS Q3", settings: { language: "en" }, project_name: "App", project_color: null, org_name: "Acme", org_logo: null }).title, "Report: SUS Q3");
  assert.match(projectReportPreview({ name: "App", color: null, org_name: null, org_logo: null, studies: 3, language: "es" }).description, /3 estudios/);
  assert.equal(docPreview({ title: "Persona: Ana", language: "es", project_name: "App", project_color: null, org_logo: null }).title, "Persona: Ana");
});

test("only images every chat app renders become the preview image", () => {
  assert.equal(previewImage("/uploads/a.webp", "/uploads/b.jpg"), "/uploads/b.jpg");
  assert.equal(previewImage("/uploads/a.svg", null, undefined), null);
  assert.equal(previewImage("https://evil.example/x.png"), null);
  assert.equal(previewImage("/uploads/../x.png"), null);
});

test("the rendered page carries the preview, escaped", () => {
  const p = studyPreview({ title: `Test "<script>" & co`, status: "live", settings: { language: "en", brand: { logo: "/uploads/l.png", color: "#2563EB" } }, org_logo: null, org_color: null });
  const out = renderIndexHtml(html, BASE, "/s/abc123", true, p);
  assert.ok(!out.includes("<script>\""), "study title is escaped");
  assert.equal(meta(out, "property", "og:title"), "Test &quot;&lt;script&gt;&quot; &amp; co · redekorate");
  assert.match(out, /<title>Test &quot;&lt;script&gt;&quot; &amp; co · redekorate<\/title>/);
  assert.equal(meta(out, "property", "og:url"), `${BASE}/s/abc123`);
  assert.equal(meta(out, "property", "og:image"), `${BASE}/uploads/l.png`);
  assert.equal(meta(out, "name", "twitter:card"), "summary");
  assert.doesNotMatch(out, /og:image:width/);
  assert.equal(out.match(/name="theme-color"/g)?.length, 1);
  assert.equal(meta(out, "name", "theme-color"), "#2563EB");
  assert.equal(meta(out, "name", "robots"), "noindex, nofollow");
});

test("without a logo the default share card stays", () => {
  const p = docPreview({ title: "Journey map", language: "en", project_name: "App", project_color: null, org_logo: null });
  const out = renderIndexHtml(html, BASE, "/d/abc", true, p);
  assert.equal(meta(out, "property", "og:image"), `${BASE}/og-image.png`);
  assert.equal(meta(out, "name", "twitter:card"), "summary_large_image");
  assert.equal(meta(out, "property", "og:title"), "Journey map · redekorate");
});
