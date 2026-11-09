// Script que se inyecta en los prototipos HTML (por ejemplo, los que genera Claude).
// El HTML se sirve en un sandbox con origen opaco, así que la tarea no puede leer su DOM:
// este script le avisa por postMessage qué pantalla se está viendo y dónde hace clic el participante.
//
// Cómo se detecta la "pantalla" actual, en orden:
//   1. El último elemento visible con [data-screen="Nombre"] (la forma más precisa).
//   2. El hash de la URL (#/carrito → "carrito").
//   3. El primer <h1> visible.
//   4. El <title> del documento.
export const TRACKER = `(function () {
  if (window.parent === window) return;
  var P = window.parent, last = null, timer = 0, trail = [];   // trail: textos de los clics desde la carga (para volver a una pantalla)
  function mem() { var d = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; }, clear: function () { d = {}; }, key: function (i) { return Object.keys(d)[i] || null; }, get length() { return Object.keys(d).length; } }; }
  ["localStorage", "sessionStorage"].forEach(function (k) { try { window[k].length; } catch (e) { try { Object.defineProperty(window, k, { value: mem(), configurable: true }); } catch (e2) {} } });
  function send(m) { m.rk = 1; try { P.postMessage(m, "*"); } catch (e) {} }
  function visible(e) { return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== "hidden"; }
  function text(s) { return (s || "").replace(/\\s+/g, " ").trim().slice(0, 80); }
  function screen() {
    var els = document.querySelectorAll("[data-screen]");
    for (var i = els.length - 1; i >= 0; i--) if (visible(els[i])) return text(els[i].getAttribute("data-screen"));
    var h = location.hash.replace(/^#!?\\/?/, "");
    if (h) { try { h = decodeURIComponent(h); } catch (e) {} return text(h); }
    var hs = document.querySelectorAll("h1");
    for (var j = 0; j < hs.length; j++) if (visible(hs[j]) && text(hs[j].textContent)) return text(hs[j].textContent);
    return text(document.title) || "Inicio";
  }
  function check() { var s = screen(); if (s && s !== last) { last = s; send({ type: "screen", name: s, route: location.hash || null, trail: trail.slice(-12) }); } }
  // El padre puede pedir ir a una pantalla al empezar una tarea: primero por su ruta (#), si no, tocando el elemento con ese nombre.
  function clickByLabel(want) {
    var els = document.querySelectorAll(SEL), i, hitEl = null;
    for (i = 0; i < els.length; i++) { if (visible(els[i]) && text(els[i].innerText || els[i].getAttribute("aria-label")).toLowerCase() === want) { els[i].click(); return true; } }
    // Muchos prototipos (React) usan <div onClick> sin atributo: buscamos el elemento más profundo con ese texto exacto.
    var all = document.body.querySelectorAll("*");
    for (i = 0; i < all.length; i++) { var el = all[i]; if (el.children.length <= 3 && visible(el) && text(el.innerText || "").toLowerCase() === want) hitEl = el; }
    if (hitEl) { hitEl.click(); return true; }
    for (i = 0; i < els.length; i++) { if (visible(els[i]) && text(els[i].innerText || "").toLowerCase().indexOf(want) >= 0) { els[i].click(); return true; } }
    return false;
  }
  function at(name) { return text(screen()).toLowerCase() === text(name).toLowerCase(); }
  // Ir a una pantalla, en orden de fiabilidad: su ruta (#), un enlace visible con su nombre, los clics que llevaron a ella
  // la primera vez (replay), y por último #nombre. Se detiene en cuanto la pantalla actual coincide.
  function goto(name, route, trail) {
    var want = text(name).toLowerCase();
    var steps = [];
    if (route) steps.push(function () { location.hash = route; });
    steps.push(function () { clickByLabel(want); });
    (trail || []).forEach(function (lbl) { steps.push(function () { clickByLabel(text(lbl).toLowerCase()); }); });
    var slug = want.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (slug) { steps.push(function () { location.hash = "#" + slug; }); steps.push(function () { location.hash = "#" + encodeURIComponent(name); }); }
    var i = 0;
    (function next() { if (at(name)) { check(); return; } if (i >= steps.length) { check(); return; } steps[i++](); setTimeout(next, 160); })();
  }
  addEventListener("message", function (e) { var d = e.data; if (d && d.rk === 1 && d.type === "goto" && typeof d.name === "string") goto(d.name, typeof d.route === "string" ? d.route : null, Array.isArray(d.trail) ? d.trail.slice(0, 12) : []); });
  function soon() { clearTimeout(timer); timer = setTimeout(check, 120); }
  var SEL = "a,button,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=switch],[onclick],[contenteditable=true]";
  function interactive(el) {
    if (el.closest && el.closest(SEL)) return el.closest(SEL);
    for (var n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) if (getComputedStyle(n).cursor === "pointer") return n;
    return null;
  }
  function label(el) {
    return text(el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.value || el.getAttribute("alt") || el.getAttribute("placeholder")) || el.tagName.toLowerCase();
  }
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
    if (!t) return;
    check();
    var hit = interactive(t), d = document.documentElement;
    if (hit) trail.push(label(hit));
    send({ type: "click", screen: last, x: (e.clientX + scrollX) / Math.max(d.scrollWidth, 1), y: (e.clientY + scrollY) / Math.max(d.scrollHeight, 1), hit: !!hit, label: label(hit || t) });
    setTimeout(check, 60); setTimeout(check, 400);
  }, true);
  addEventListener("hashchange", check); addEventListener("popstate", check);
  function start() { check(); try { new MutationObserver(soon).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "data-screen"] }); } catch (e) {} send({ type: "ready" }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  addEventListener("load", check);
})();`;

// Se enlaza en vez de incrustarse: así cada mejora del tracker llega a todos los prototipos ya subidos.
export const TRACKER_PATH = "/proto-tracker.js";
const TAG = `<script src="${TRACKER_PATH}" data-redekorate-tracker></script>`;

/** Agrega el script lo más arriba posible para que corra antes que el código del prototipo. */
export function injectTracker(html: string): string {
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + TAG + html.slice(head.index + head[0].length);
  const root = /<html\b[^>]*>/i.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + `<head>${TAG}</head>` + html.slice(root.index + root[0].length);
  const doctype = /<!doctype[^>]*>/i.exec(html);
  if (doctype) return html.slice(0, doctype.index + doctype[0].length) + TAG + html.slice(doctype.index + doctype[0].length);
  return `<!doctype html><meta charset="utf-8">${TAG}${html}`;
}

/** ¿Parece un documento HTML de texto? (sin bytes nulos y con alguna etiqueta típica) */
export function looksLikeHtml(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  const head = buf.toString("utf8", 0, Math.min(buf.length, 4096)).toLowerCase();
  return /<!doctype html|<html|<head|<body|<script|<div|<main/.test(head);
}
