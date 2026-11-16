import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BASE_URL_TOKEN, indexingEnabled, isIndexable, publicBaseUrl, renderIndexHtml, robotsDirective, robotsTxt, sitemapXml } from "./seo.js";

const BASE = "https://research.example.com";
const webFile = (p: string) => readFileSync(new URL(`../../../web/${p}`, import.meta.url), "utf8");

test("only the public entry page is indexable", () => {
  assert.equal(isIndexable("/", true), true);
  assert.equal(isIndexable("/login", true), true);
  assert.equal(isIndexable("/login/", true), true);
  for (const p of ["/s/abc", "/r/tok", "/pr/tok", "/d/tok", "/reset", "/invite", "/forgot", "/projects", "/studies/1/results", "/admin/users"]) {
    assert.equal(isIndexable(p, true), false, p);
    assert.equal(robotsDirective(p, true), "noindex, nofollow", p);
  }
});

test("every route in the app except / and /login is noindex", () => {
  const routes = [...webFile("src/App.tsx").matchAll(/<Route path="([^"*]+)"/g)].map((m) => m[1].replace(/:\w+/g, "x"));
  assert.ok(routes.length > 15, "route list was parsed");
  assert.deepEqual(routes.filter((p) => isIndexable(p, true)).sort(), ["/", "/login"]);
});

test("SEO_INDEXING=off hides everything", () => {
  assert.equal(indexingEnabled({}), true);
  assert.equal(indexingEnabled({ SEO_INDEXING: "off" }), false);
  assert.equal(indexingEnabled({ SEO_INDEXING: "FALSE" }), false);
  assert.equal(isIndexable("/", false), false);
  assert.equal(robotsTxt(BASE, false), "User-agent: *\nDisallow: /\n");
});

test("robots.txt blocks the API and uploads, not the private-link pages, and points at the sitemap", () => {
  const txt = robotsTxt(BASE, true);
  assert.match(txt, /^Disallow: \/api\/$/m);
  assert.match(txt, /^Disallow: \/uploads\/$/m);
  assert.doesNotMatch(txt, /Disallow: \/(s|r|pr|d)\//);
  assert.match(txt, /^Sitemap: https:\/\/research\.example\.com\/sitemap\.xml$/m);
});

test("sitemap lists the canonical home URL", () => {
  assert.match(sitemapXml(BASE), /<loc>https:\/\/research\.example\.com\/<\/loc>/);
});

test("index.html is filled in per request", () => {
  const html = webFile("index.html");
  assert.ok(html.includes(BASE_URL_TOKEN), "index.html uses the base-URL placeholder");

  const home = renderIndexHtml(html, BASE, "/", true);
  assert.ok(!home.includes(BASE_URL_TOKEN));
  assert.match(home, /<meta property="og:image" content="https:\/\/research\.example\.com\/og-image\.png" \/>/);
  assert.match(home, /<link rel="canonical" href="https:\/\/research\.example\.com\/" \/>/);
  assert.match(home, /<meta name="robots" content="index, follow/);

  const runner = renderIndexHtml(html, BASE, "/s/secret-slug", true);
  assert.match(runner, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.doesNotMatch(runner, /rel="canonical"/);
  assert.ok(!runner.includes("secret-slug"), "the private path is never echoed into the page");
});

test("index.html has the tags link previews and search results need", () => {
  const html = webFile("index.html");
  for (const tag of ['name="description"', 'name="keywords"', 'property="og:title"', 'property="og:description"', 'property="og:image"', 'name="twitter:card"', 'rel="manifest"', 'rel="apple-touch-icon"', '"@type": "SoftwareApplication"']) {
    assert.ok(html.includes(tag), tag);
  }
  const description = html.match(/<meta name="description" content="([^"]+)"/)![1];
  assert.ok(description.length >= 70 && description.length <= 230, `description is ${description.length} chars`);
});

test("base URL comes from APP_URL, else the request", () => {
  assert.equal(publicBaseUrl("https://a.example/", "http", "ignored"), "https://a.example");
  assert.equal(publicBaseUrl("", "https", "b.example"), "https://b.example");
  assert.equal(publicBaseUrl(undefined, "http", "localhost:4000"), "http://localhost:4000");
});
