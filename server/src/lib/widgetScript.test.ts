// The widget script is plain JavaScript served as a file; its pure helpers are loaded here the way a CommonJS consumer would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../widget/widget.js");
const mod: { exports: any } = { exports: {} };
new Function("module", readFileSync(file, "utf8"))(mod);
const w = mod.exports;

test("both languages have exactly the same texts", () => {
  assert.deepEqual(Object.keys(w.TEXT.es).sort(), Object.keys(w.TEXT.en).sort());
  for (const lang of ["en", "es"]) for (const [k, v] of Object.entries(w.TEXT[lang])) assert.ok(typeof v === "string" && v.length > 0, `${lang}.${k}`);
});

test("the language follows the setting, then the page, then the browser", () => {
  assert.equal(w.pickLang("es", "en", "en-US"), "es");
  assert.equal(w.pickLang("auto", "es-MX", "en-US"), "es");
  assert.equal(w.pickLang("auto", "", "es-HN"), "es");
  assert.equal(w.pickLang("auto", "fr", "fr-FR"), "en");
  assert.equal(w.pickLang(undefined, undefined, undefined), "en");
});

test("the greeting uses the first name and reads well without one", () => {
  const t = w.TEXT.en;
  assert.equal(w.greeting("", "Mike Jones", t), "Hi Mike, how can we help?");
  assert.equal(w.greeting("", null, t), "How can we help?");
  assert.equal(w.greeting("Hey {name}, what's up?", "Mike Jones", t), "Hey Mike, what's up?");
  assert.equal(w.greeting("Hey {name}, what's up?", "", t), "Hey, what's up?");
  assert.equal(w.greeting("{name}, tell us", "", t), "tell us");
});

test("system and browser are named from the user agent", () => {
  assert.deepEqual(w.parseUA("Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"), { os: "Android 12", browser: "Chrome 130.0" });
  assert.deepEqual(w.parseUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"), { os: "macOS 10.15", browser: "Safari 17.4" });
  assert.deepEqual(w.parseUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0"), { os: "Windows 10/11", browser: "Edge 130.0" });
  assert.deepEqual(w.parseUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"), { os: "iOS 17.5", browser: "Safari 17.5" });
  assert.deepEqual(w.parseUA("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"), { os: "Linux", browser: "Firefox 131.0" });
  assert.deepEqual(w.parseUA(""), { os: "", browser: "" });
});

test("private fields are scaled to the capture and clipped to the viewport", () => {
  assert.deepEqual(w.scaleRects([{ x: 100, y: 50, w: 200, h: 40 }], 1000, 500, 2000, 1000), [{ x: 200, y: 100, w: 400, h: 80 }]);
  assert.deepEqual(w.scaleRects([{ x: -50, y: 480, w: 100, h: 100 }], 1000, 500, 1000, 500), [{ x: 0, y: 480, w: 50, h: 20 }]);
  assert.deepEqual(w.scaleRects([{ x: 1200, y: 0, w: 50, h: 50 }, { x: 0, y: -80, w: 50, h: 50 }], 1000, 500, 1000, 500), [], "fields scrolled out of view leave nothing to hide");
});

test("a capture counts as this page only when it has the viewport's shape", () => {
  assert.ok(w.sameShape(1440, 900, 2880, 1800));
  assert.ok(w.sameShape(1440, 900, 1280, 800));
  assert.ok(!w.sameShape(1440, 900, 1920, 1080), "a whole screen is a different shape");
  assert.ok(!w.sameShape(0, 900, 1440, 900));
});

test("small helpers", () => {
  assert.equal(w.clock(0), "0:00");
  assert.equal(w.clock(75.9), "1:15");
  assert.deepEqual([w.sizeText(300), w.sizeText(52 * 1024), w.sizeText(2.5 * 1048576)], ["1 KB", "52 KB", "2.5 MB"]);
  const log: string[] = [];
  for (let i = 0; i < 25; i++) w.pushError(log, `e${i}`, 20);
  assert.deepEqual([log.length, log[0], log[19]], [20, "e5", "e24"]);
  assert.equal(w.pushError([], "x".repeat(900), 20)[0].length, 400);
  assert.ok(w.validEmail("mike@acme.com") && !w.validEmail("mike@acme") && !w.validEmail(""));
  const cfg = w.withDefaults({ allow: { console: true }, look: { accent: "#0D9488", label: null } });
  assert.deepEqual([cfg.allow.console, cfg.allow.files, cfg.look.accent, cfg.look.label, cfg.privacy.ask_email], [true, true, "#0D9488", "", true]);
});

test("page details describe the window without touching anything private", () => {
  const d = w.collectDetails({
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 12) Chrome/130.0.0.0", language: "es-HN" }, screen: { width: 412, height: 915, colorDepth: 24 }, devicePixelRatio: 2.625,
    innerWidth: 412, innerHeight: 800, location: { href: "https://app.acme.com/caja/cierre?fecha=2026-11-11" }, document: { title: "Cierre de caja", cookie: "session=secret" },
  });
  assert.deepEqual([d.page_url, d.page_title, d.os, d.browser, d.window_size, d.screen_resolution, d.pixel_ratio, d.color_depth, d.language],
    ["https://app.acme.com/caja/cierre?fecha=2026-11-11", "Cierre de caja", "Android 12", "Chrome 130.0", "412 × 800", "1082 × 2402", 2.625, "24-bit", "es-HN"]);
  assert.ok(!JSON.stringify(d).includes("secret"));
});

test("a refused send says why: too large, too many, blocked by the security scan, scanner down", () => {
  const t = w.TEXT.en;
  assert.equal(w.failText(413, "too_large", t), t.failBig);
  assert.equal(w.failText(429, "rate_limited", t), t.failRate);
  assert.equal(w.failText(422, "blocked", t), t.failBlocked);
  assert.equal(w.failText(415, "bad_file", t), t.failBlocked);
  assert.equal(w.failText(503, "scan_unavailable", t), t.failScan);
  assert.equal(w.failText(500, undefined, t), t.fail);
});

test("marks on a screenshot can be taken back one by one or all at once", () => {
  const marks = [{ tool: "highlight" }, { tool: "arrow" }, { tool: "hide" }];
  assert.deepEqual(w.removeMark(marks, "last"), marks.slice(0, 2));
  assert.deepEqual(w.removeMark(marks, "all"), []);
  assert.deepEqual(w.removeMark([], "last"), []);
  assert.equal(marks.length, 3, "the original list is not changed (Cancel restores it)");
});

test("the attach bar says attachments are optional", () => {
  assert.match(w.TEXT.en.paste, /^Optional\./);
  assert.match(w.TEXT.es.paste, /^Opcional\./);
});
