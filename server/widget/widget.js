/*!
 * Redekorate feedback widget. Load it on any site with one tag:
 *   <script src="https://YOUR-REDEKORATE/widget.js" data-key="rk_pub_…" async></script>
 * Plain JavaScript, no dependencies. Everything it draws lives in a shadow root, so the page's styles
 * and the widget's never touch. Docs: docs/widget.md in the Redekorate repository.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;   // tests
  else api.boot(root);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ── Pure helpers (exported for tests) ─────────────────────────
  var TEXT = {
    en: {
      launcher: "Feedback", open: "Send feedback", hi: "Hi {name}, how can we help?", hiAnon: "How can we help?", sub: "Your message goes straight to the product team.",
      minimize: "Minimize feedback", close: "Close feedback", about: "What’s this about?", broken: "Something’s broken", idea: "Idea", question: "Question",
      more: "Tell us more", morePh: "What happened? What did you expect?", email: "Your email", emailPh: "name@company.com", emailHint: "So the team can reply. We won’t use it for anything else.",
      attach: "Attach", shot: "Screenshot", record: "Record screen", file: "File", doShot: "Take a screenshot", doRec: "Record the screen", doFile: "Attach a file", paste: "Optional. You can also paste an image.", optional: "Optional", auto: "{x} hidden automatically", noMarks: "No marks yet", details: "Page and browser details are included", whats: "What’s sent?",
      whatsBody: "The page address and title, your browser and system, the window and screen size, language and time zone. No passwords, cookies or keystrokes.",
      whatsConsole: " Also the last errors the page logged.", send: "Send feedback", sending: "Sending…", powered: "Powered by",
      edit: "Edit", remove: "Remove {what}", marks: "{h} highlighted · {x} hidden", recording: "Screen recording", stop: "Stop recording", recTime: "Recording {t}",
      needMsg: "Write a message first.", needKind: "Choose what this is about.", badEmail: "That email doesn’t look right.", tooBig: "{name} is larger than {mb} MB.",
      thanks: "Thanks, {name}. We got it.", thanksAnon: "Thanks. We got it.", next: "The product team will look at it.", reply: " If they need more details, they’ll write to {email}.",
      ref: "Reference:", closeBtn: "Close", again: "Send more", failTitle: "Unable to send.", fail: "Check your connection and try again. Your message is saved here.",
      failBig: "An attachment is too large. Remove it and try again.", failRate: "Too many messages in a short time. Try again in a few minutes.",
      failBlocked: "An attachment didn’t pass the security check (for example, a PDF with scripts). Remove it and try again.", failScan: "We couldn’t check your attachments right now. Try again in a few minutes, or send without them.",
      markup: "Mark up the screenshot", retake: "Retake", tools: "Markup tools", highlight: "Highlight", hide: "Hide", arrow: "Arrow", text: "Text", textAsk: "Text to add",
      markupHint: "Use Hide on anything private. Fields the team marks as private are hidden automatically.", cancel: "Cancel", use: "Use screenshot", undo: "Undo", clearMarks: "Clear marks",
      noCapture: "This browser can’t capture the screen. Attach a file instead.", canvasLabel: "Screenshot. Drag to mark an area."
    },
    es: {
      launcher: "Comentarios", open: "Enviar comentarios", hi: "Hola {name}, ¿cómo podemos ayudarte?", hiAnon: "¿Cómo podemos ayudarte?", sub: "Tu mensaje llega directo al equipo de producto.",
      minimize: "Minimizar", close: "Cerrar", about: "¿De qué se trata?", broken: "Algo no funciona", idea: "Idea", question: "Pregunta",
      more: "Cuéntanos más", morePh: "¿Qué pasó? ¿Qué esperabas?", email: "Tu correo", emailPh: "nombre@empresa.com", emailHint: "Para que el equipo pueda responderte. No lo usaremos para nada más.",
      attach: "Adjuntar", shot: "Captura", record: "Grabar pantalla", file: "Archivo", doShot: "Tomar una captura", doRec: "Grabar la pantalla", doFile: "Adjuntar un archivo", paste: "Opcional. También puedes pegar una imagen.", optional: "Opcional", auto: "{x} ocultos automáticamente", noMarks: "Sin marcas todavía", details: "Se incluyen datos de la página y del navegador", whats: "¿Qué se envía?",
      whatsBody: "La dirección y el título de la página, tu navegador y sistema, el tamaño de la ventana y de la pantalla, el idioma y la zona horaria. Nunca contraseñas, cookies ni lo que escribes.",
      whatsConsole: " También los últimos errores que registró la página.", send: "Enviar comentarios", sending: "Enviando…", powered: "Hecho con",
      edit: "Editar", remove: "Quitar {what}", marks: "{h} resaltados · {x} ocultos", recording: "Grabación de pantalla", stop: "Detener grabación", recTime: "Grabando {t}",
      needMsg: "Escribe un mensaje primero.", needKind: "Elige de qué se trata.", badEmail: "Ese correo no parece correcto.", tooBig: "{name} pesa más de {mb} MB.",
      thanks: "Gracias, {name}. Lo recibimos.", thanksAnon: "Gracias. Lo recibimos.", next: "El equipo de producto lo va a revisar.", reply: " Si necesitan más detalles, te escribirán a {email}.",
      ref: "Referencia:", closeBtn: "Cerrar", again: "Enviar otro", failTitle: "No se pudo enviar.", fail: "Revisa tu conexión e inténtalo de nuevo. Tu mensaje sigue aquí.",
      failBig: "Un adjunto es demasiado grande. Quítalo e inténtalo de nuevo.", failRate: "Demasiados mensajes en poco tiempo. Inténtalo en unos minutos.",
      failBlocked: "Un adjunto no pasó la revisión de seguridad (por ejemplo, un PDF con scripts). Quítalo e inténtalo de nuevo.", failScan: "No pudimos revisar tus adjuntos en este momento. Inténtalo en unos minutos o envía sin ellos.",
      markup: "Marca la captura", retake: "Repetir", tools: "Herramientas", highlight: "Resaltar", hide: "Ocultar", arrow: "Flecha", text: "Texto", textAsk: "Texto para agregar",
      markupHint: "Usa Ocultar sobre cualquier dato privado. Los campos que el equipo marca como privados se ocultan solos.", cancel: "Cancelar", use: "Usar captura", undo: "Deshacer", clearMarks: "Borrar marcas",
      noCapture: "Este navegador no puede capturar la pantalla. Adjunta un archivo.", canvasLabel: "Captura de pantalla. Arrastra para marcar un área."
    }
  };

  /** The widget language: the configured one, or the page's (Spanish when the page is in Spanish, English otherwise). */
  function pickLang(configured, pageLang, browserLang) {
    if (configured === "en" || configured === "es") return configured;
    var l = String(pageLang || browserLang || "en").toLowerCase();
    return l.indexOf("es") === 0 ? "es" : "en";
  }
  /** What to tell the visitor when the server refuses a feedback (status and short error code from the server). */
  function failText(status, code, x) {
    if (status === 413) return x.failBig;
    if (status === 429) return x.failRate;
    if (code === "blocked" || code === "bad_file") return x.failBlocked;
    if (code === "scan_unavailable") return x.failScan;
    return x.fail;
  }
  /** The marks left after taking back the last one, or all of them. The private fields hidden automatically are part of the capture itself, so they always stay. */
  function removeMark(shapes, which) { return which === "all" ? [] : shapes.slice(0, -1); }
  function fill(s, vars) { return s.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? String(vars[k]) : ""; }); }
  function firstName(name) { return String(name || "").trim().split(/\s+/)[0] || ""; }
  /** The headline: the project's own greeting when it has one, otherwise ours; {name} is the first name and disappears cleanly when unknown. */
  function greeting(custom, name, t) {
    var first = firstName(name);
    if (custom) return fill(custom, { name: first }).replace(/\s+([,.!?])/g, "$1").replace(/^[\s,]+/, "").replace(/\s{2,}/g, " ").trim();
    return first ? fill(t.hi, { name: first }) : t.hiAnon;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim()); }

  /** System and browser from a user-agent string, as people would name them. */
  function parseUA(ua) {
    ua = String(ua || "");
    var m, os = "", browser = "";
    if ((m = /Android (\d+(?:\.\d+)?)/.exec(ua))) os = "Android " + m[1];
    else if ((m = /(?:iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/.exec(ua))) os = "iOS " + m[1] + "." + m[2];
    else if ((m = /Windows NT (\d+\.\d+)/.exec(ua))) os = "Windows " + ({ "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" }[m[1]] || m[1]);
    else if ((m = /Mac OS X (\d+)[_.](\d+)/.exec(ua))) os = "macOS " + m[1] + "." + m[2];
    else if (/CrOS/.test(ua)) os = "ChromeOS";
    else if (/Linux/.test(ua)) os = "Linux";
    if ((m = /Edg(?:e|A|iOS)?\/(\d+(?:\.\d+)?)/.exec(ua))) browser = "Edge " + m[1];
    else if ((m = /OPR\/(\d+(?:\.\d+)?)/.exec(ua))) browser = "Opera " + m[1];
    else if ((m = /Firefox\/(\d+(?:\.\d+)?)/.exec(ua))) browser = "Firefox " + m[1];
    else if ((m = /(?:Chrome|CriOS)\/(\d+(?:\.\d+)?)/.exec(ua))) browser = "Chrome " + m[1];
    else if ((m = /Version\/(\d+(?:\.\d+)?).*Safari/.exec(ua))) browser = "Safari " + m[1];
    return { os: os, browser: browser };
  }

  /** Rectangles measured in the viewport, converted to the pixels of a capture of that viewport. */
  function scaleRects(rects, viewportW, viewportH, imageW, imageH) {
    var sx = imageW / viewportW, sy = imageH / viewportH, out = [];
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i], x = Math.max(0, r.x), y = Math.max(0, r.y), w = Math.min(viewportW, r.x + r.w) - x, h = Math.min(viewportH, r.y + r.h) - y;
      if (w > 0 && h > 0) out.push({ x: Math.floor(x * sx), y: Math.floor(y * sy), w: Math.ceil(w * sx), h: Math.ceil(h * sy) });
    }
    return out;
  }
  /** Whether a capture is of this very page: same shape as the viewport (a different window or screen would not line up with the private fields). */
  function sameShape(viewportW, viewportH, imageW, imageH) {
    if (!viewportW || !viewportH || !imageW || !imageH) return false;
    return Math.abs(imageW / imageH - viewportW / viewportH) < 0.02;
  }
  function sizeText(bytes) { return bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (Math.round(bytes / 104857.6) / 10) + " MB"; }
  function clock(seconds) { var s = Math.max(0, Math.floor(seconds)); return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60); }
  /** Keeps the newest `max` entries of a log, each cut to a sane length. */
  function pushError(list, text, max) { list.push(String(text).slice(0, 400)); while (list.length > max) list.shift(); return list; }

  /** What accompanies a message when the project has page and browser details turned on. */
  function collectDetails(w) {
    var ua = parseUA(w.navigator && w.navigator.userAgent), s = w.screen || {}, dpr = w.devicePixelRatio || 1, tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* no Intl */ }
    return {
      page_url: String(w.location && w.location.href || "").slice(0, 2000), page_title: String(w.document && w.document.title || "").slice(0, 300),
      os: ua.os, browser: ua.browser, window_size: w.innerWidth + " × " + w.innerHeight,
      screen_resolution: Math.round((s.width || 0) * dpr) + " × " + Math.round((s.height || 0) * dpr), pixel_ratio: Math.round(dpr * 1000) / 1000,
      color_depth: (s.colorDepth || 24) + "-bit", language: String(w.navigator && w.navigator.language || ""), timezone: tz
    };
  }

  var CSS = [
    ":host{all:initial}", "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    ".l{position:fixed;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 18px;border:0;border-radius:999px;background:var(--a);color:#fff;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(26,21,35,.24)}",
    ".l.br{right:20px;bottom:20px}.l.bl{left:20px;bottom:20px}.l.er{right:0;top:50%;border-radius:10px 10px 0 0;transform:rotate(-90deg) translate(50%,-50%);transform-origin:right top;min-height:40px}",
    ".p{position:fixed;z-index:2147483001;right:20px;bottom:20px;width:380px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#1A1523;border:1px solid #E7E4EE;border-radius:18px;box-shadow:0 24px 64px rgba(26,21,35,.24);font-size:14px;line-height:1.45}",
    ".p.bl{right:auto;left:20px}.p.in{position:static;width:100%;max-width:380px;max-height:none;box-shadow:0 8px 24px rgba(26,21,35,.12)}",
    ".p.wide{width:720px}", ".h{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:18px 18px 0}", "h2{margin:0;font-size:17px;font-weight:700;line-height:1.3}",
    ".s{margin:2px 0 0;font-size:13px;color:#5F5A6B}", ".b{display:flex;flex-direction:column;gap:14px;padding:16px 18px}", ".ic{width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:#4A4656;cursor:pointer;font-size:18px;line-height:1}",
    ".ic:hover,.g:hover{background:#F3F1F7}", "fieldset{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}", "legend,.lb{padding:0;font-size:13px;font-weight:600}",
    ".k{display:flex;gap:6px}", ".k label{flex:1 1 auto;display:flex;align-items:center;justify-content:center;text-align:center;min-height:40px;padding:6px 8px;border:1px solid #DAD6E2;border-radius:10px;font-size:13px;font-weight:500;line-height:1.2;cursor:pointer}",
    ".k label:hover{background:#FAF8FD}", ".k label:has(:checked){border-color:var(--a);background:color-mix(in srgb,var(--a) 9%,#fff);color:var(--a);font-weight:600;box-shadow:inset 0 0 0 1px var(--a)}", ".k label:has(:focus-visible){outline:2px solid var(--a);outline-offset:2px}",
    ".box{border:1px solid #CFC9DA;border-radius:12px;background:#fff;overflow:hidden}.box:focus-within{border-color:var(--a);box-shadow:0 0 0 3px color-mix(in srgb,var(--a) 18%,transparent)}",
    ".box textarea{display:block;border:0;border-radius:0;min-height:84px;resize:none;outline:none}", ".bar{display:flex;align-items:center;gap:2px;padding:4px 6px 6px}",
    ".ib{width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:9px;background:transparent;color:#4A4656;cursor:pointer}.ib:hover{background:#F3F1F7;color:var(--a)}",
    ".bar .hint{margin-left:auto;padding-right:6px}", ".th{width:52px;height:38px;flex:none;object-fit:cover;border:1px solid #DAD6E2;border-radius:7px;background:#fff}", ".at .m{display:flex;align-items:center;gap:10px;min-width:0}.at .m div{min-width:0}.at b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}", "input[type=radio],input[type=checkbox]{accent-color:var(--a);margin:0}",
    ".f{display:flex;flex-direction:column;gap:6px}", "textarea,input[type=email],input[type=text]{width:100%;padding:9px 11px;border:1px solid #CFC9DA;border-radius:10px;background:#fff;color:#1A1523;font-size:14px}",
    "textarea{min-height:88px;resize:vertical}", ".hint{font-size:12px;color:#5F5A6B}", ".g:disabled{opacity:.45;cursor:default}", ".row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}",
    ".g{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 10px;border:1px solid #DAD6E2;border-radius:10px;background:#fff;color:#1A1523;font-size:13px;font-weight:500;cursor:pointer}",
    ".g[aria-pressed=true]{border-color:var(--a);background:color-mix(in srgb,var(--a) 9%,#fff)}", ".at{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid #E7E4EE;border-radius:10px;background:#FAF8FD;font-size:13px}",
    ".at b{display:block;font-weight:600}.at span{color:#5F5A6B;font-size:12px}", ".lk{border:0;background:none;padding:0;color:var(--a);font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline}",
    ".pr{min-height:44px;border:0;border-radius:10px;background:var(--a);color:#fff;font-size:15px;font-weight:600;cursor:pointer}.pr[disabled]{opacity:.6;cursor:default}",
    ".ft{padding:0 18px 14px;font-size:12px;color:#5F5A6B;text-align:center}.ft b{color:#1A1523}", ".er2{padding:10px 12px;border-radius:10px;background:#FDE8E8;color:#B42318;font-size:13px}.er2 b{display:block}",
    ".ok{width:44px;height:44px;border-radius:50%;background:#DCFCE7;color:#166534;display:flex;align-items:center;justify-content:center;font-size:22px}", ".ref{font-variant-numeric:tabular-nums;font-weight:700}",
    ".cv{width:100%;border:1px solid #E7E4EE;border-radius:10px;touch-action:none;cursor:crosshair;display:block}", ".rec{position:fixed;z-index:2147483002;left:50%;bottom:20px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:8px 8px 8px 14px;border-radius:999px;background:#1A1523;color:#fff;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(26,21,35,.3)}",
    ".rec button{min-height:36px;padding:0 12px;border:0;border-radius:999px;background:#fff;color:#1A1523;font-size:13px;font-weight:600;cursor:pointer}", ".dot{width:9px;height:9px;border-radius:50%;background:#EF4444}",
    ":focus-visible{outline:2px solid var(--a);outline-offset:2px}", ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}",
    "@media (prefers-reduced-motion:no-preference){.p{animation:i .15s ease-out}}@keyframes i{from{opacity:0;transform:translateY(6px)}}"
  ].join("");

  function svg(d) { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>"; }
  var ICON = {
    clip: svg('<path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.7-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.7 8.6a1.8 1.8 0 0 1-2.6-2.6l8-7.9"/>'),
    camera: svg('<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.2"/>'),
    video: svg('<rect x="3" y="6.5" width="12" height="11" rx="2"/><path d="m15 11 6-3.5v9L15 13"/>')
  };

  var DEFAULTS = {
    allow: { screenshot: true, recording: true, files: true, details: true, console: false }, privacy: { hide_private: true, ask_email: true },
    look: { accent: "#5B21B6", position: "bottom-right", label: "", language: "auto", greeting: "" }
  };
  function withDefaults(cfg) {
    cfg = cfg || {};
    function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in (b || {})) if (b[k] !== undefined && b[k] !== null) o[k] = b[k]; return o; }
    return { allow: merge(DEFAULTS.allow, cfg.allow), privacy: merge(DEFAULTS.privacy, cfg.privacy), look: merge(DEFAULTS.look, cfg.look) };
  }
  var MAX_FILE_MB = 10, MAX_FILES = 3, MAX_RECORD_S = 120;

  // ── The widget ────────────────────────────────────────────────
  /**
   * Creates a widget inside `mount`. `opts.preview` renders the open form in place and never talks to a server
   * (the settings page uses it); otherwise it floats over the page and sends to `opts.base` with `opts.key`.
   */
  function create(win, mount, opts) {
    var doc = win.document, cfg = withDefaults(opts.config), user = opts.user || null, errors = opts.errors || [];
    var st = { open: !!opts.preview, view: "form", kind: "", message: "", email: "", whats: false, error: "", fail: "", sending: false, ref: "", shot: null, rec: null, files: [], recording: null, sentEmail: "" };
    var shadow = mount.shadowRoot || mount.attachShadow({ mode: "open" });
    var draftKey = "rk_draft_" + (opts.key || "preview");
    if (!opts.preview) try { var d = JSON.parse(win.sessionStorage.getItem(draftKey) || "null"); if (d) { st.kind = d.kind || ""; st.message = d.message || ""; st.email = d.email || ""; } } catch (e) { /* no storage */ }
    function lang() { return pickLang(cfg.look.language, doc.documentElement && doc.documentElement.lang, win.navigator && win.navigator.language); }
    function t() { return TEXT[lang()]; }
    function saveDraft() { if (opts.preview) return; try { win.sessionStorage.setItem(draftKey, JSON.stringify({ kind: st.kind, message: st.message, email: st.email })); } catch (e) { /* no storage */ } }
    function clearDraft() { try { win.sessionStorage.removeItem(draftKey); } catch (e) { /* no storage */ } }
    function $(sel) { return shadow.querySelector(sel); }
    function on(sel, ev, fn) { var els = shadow.querySelectorAll(sel); for (var i = 0; i < els.length; i++) els[i].addEventListener(ev, fn); }
    function posClass() { return cfg.look.position === "bottom-left" ? "bl" : cfg.look.position === "edge-right" ? "er" : "br"; }
    function askEmail() { return !(user && user.email) && cfg.privacy.ask_email; }

    function iconBtn(action, label, svg) { return '<button type="button" class="ib" data-a="' + action + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + svg + "</button>"; }
    function shotSummary(shot, x) { return shot.highlights || shot.hidden ? fill(x.marks, { h: shot.highlights, x: shot.hidden }) : x.noMarks; }

    function formHtml() {
      var x = t(), kinds = ["broken", "idea", "question"], h = "";
      h += '<div class="h"><div><h2 id="rk-t">' + esc(greeting(cfg.look.greeting, user && user.name, x)) + '</h2><p class="s">' + esc(x.sub) + "</p></div>";
      h += '<div class="row" style="gap:0;flex-wrap:nowrap"><button type="button" class="ic" data-a="min" aria-label="' + esc(x.minimize) + '">&#8211;</button><button type="button" class="ic" data-a="close" aria-label="' + esc(x.close) + '">&#215;</button></div></div>';
      h += '<form class="b" novalidate><fieldset><legend>' + esc(x.about) + '</legend><div class="k">';
      for (var i = 0; i < kinds.length; i++) h += '<label><input type="radio" class="sr" name="rk-k" value="' + kinds[i] + '"' + (st.kind === kinds[i] ? " checked" : "") + ">" + esc(x[kinds[i]]) + "</label>";
      h += '</div></fieldset><div class="f"><label class="lb" for="rk-m">' + esc(x.more) + '</label><div class="box"><textarea id="rk-m" maxlength="5000" placeholder="' + esc(x.morePh) + '">' + esc(st.message) + "</textarea>";
      if (cfg.allow.screenshot || cfg.allow.recording || cfg.allow.files) {
        h += '<div class="bar" role="group" aria-label="' + esc(x.attach) + '">';
        if (cfg.allow.files) h += iconBtn("file", x.doFile, ICON.clip) + '<input type="file" id="rk-f" class="sr" tabindex="-1" multiple accept="image/*,application/pdf,video/mp4,video/webm">';
        if (cfg.allow.screenshot) h += iconBtn("shot", x.doShot, ICON.camera);
        if (cfg.allow.recording) h += iconBtn("rec", x.doRec, ICON.video);
        h += '<span class="hint">' + esc(cfg.allow.files ? x.paste : x.optional) + "</span>";   // attachments are never required
        h += "</div>";
      }
      h += "</div></div>";
      if (askEmail()) h += '<div class="f"><label class="lb" for="rk-e">' + esc(x.email) + '</label><input id="rk-e" type="email" autocomplete="email" placeholder="' + esc(x.emailPh) + '" value="' + esc(st.email) + '"><span class="hint">' + esc(x.emailHint) + "</span></div>";
      if (st.shot) h += '<div class="at"><div class="m">' + (st.shot.url ? '<img class="th" alt="" src="' + esc(st.shot.url) + '">' : "") + "<div><b>" + esc(x.shot) + "</b><span>" + esc(shotSummary(st.shot, x)) + '</span></div></div><div class="row" style="flex-wrap:nowrap"><button type="button" class="lk" data-a="shot-edit">' + esc(x.edit) + '</button><button type="button" class="ic" data-a="shot-rm" aria-label="' + esc(fill(x.remove, { what: x.shot })) + '">&#215;</button></div></div>';
      if (st.rec) h += '<div class="at"><div><b>' + esc(x.recording) + "</b><span>" + esc(clock(st.rec.seconds)) + '</span></div><button type="button" class="ic" data-a="rec-rm" aria-label="' + esc(fill(x.remove, { what: x.recording })) + '">&#215;</button></div>';
      for (var j = 0; j < st.files.length; j++) h += '<div class="at"><div><b>' + esc(st.files[j].name) + "</b><span>" + esc(sizeText(st.files[j].size)) + '</span></div><button type="button" class="ic" data-a="file-rm" data-i="' + j + '" aria-label="' + esc(fill(x.remove, { what: st.files[j].name })) + '">&#215;</button></div>';
      if (cfg.allow.details) {
        h += '<div class="row" style="justify-content:space-between"><span class="hint">' + esc(x.details) + '</span><button type="button" class="lk" data-a="whats" aria-expanded="' + st.whats + '">' + esc(x.whats) + "</button></div>";
        if (st.whats) h += '<p class="hint" style="margin:0">' + esc(x.whatsBody + (cfg.allow.console ? x.whatsConsole : "")) + "</p>";
      }
      if (st.error) h += '<p class="er2" role="alert" style="margin:0">' + esc(st.error) + "</p>";
      if (st.fail) h += '<div class="er2" role="alert"><b>' + esc(x.failTitle) + "</b>" + esc(st.fail) + "</div>";
      h += '<button type="submit" class="pr"' + (st.sending ? " disabled" : "") + ">" + esc(st.sending ? x.sending : x.send) + "</button></form>";
      return h + '<p class="ft">' + esc(x.powered) + " <b>Redekorate</b></p>";
    }
    function sentHtml() {
      var x = t(), name = firstName(user && user.name);
      return '<div class="b" role="status" style="align-items:flex-start"><div class="ok" aria-hidden="true">&#10003;</div><h2 id="rk-t">' + esc(name ? fill(x.thanks, { name: name }) : x.thanksAnon) + '</h2><p style="margin:0">' + esc(x.next + (st.sentEmail ? fill(x.reply, { email: st.sentEmail }) : "")) +
        '</p><p style="margin:0" class="hint">' + esc(x.ref) + ' <span class="ref">' + esc(st.ref) + '</span></p><div class="row"><button type="button" class="g" data-a="close">' + esc(x.closeBtn) + '</button><button type="button" class="g" data-a="again">' + esc(x.again) + '</button></div></div><p class="ft">' + esc(x.powered) + " <b>Redekorate</b></p>";
    }
    function markupHtml() {
      var x = t(), tools = ["highlight", "hide", "arrow", "text"], h = '<div class="h"><h2 id="rk-t">' + esc(x.markup) + '</h2><button type="button" class="g" data-a="retake">' + esc(x.retake) + '</button></div><div class="b">';
      h += '<canvas class="cv" role="img" aria-label="' + esc(x.canvasLabel) + '"></canvas><div class="row" role="toolbar" aria-label="' + esc(x.tools) + '">';
      for (var i = 0; i < tools.length; i++) h += '<button type="button" class="g" data-tool="' + tools[i] + '" aria-pressed="' + (st.tool === tools[i]) + '">' + esc(x[tools[i]]) + "</button>";
      var none = st.shot && st.shot.shapes.length ? "" : " disabled";   // marks can be taken back one by one or all at once
      h += '<button type="button" class="g" style="margin-left:auto" data-a="mk-undo"' + none + ">" + esc(x.undo) + '</button><button type="button" class="g" data-a="mk-clear"' + none + ">" + esc(x.clearMarks) + "</button>";
      return h + '</div><p class="hint" style="margin:0">' + esc(x.markupHint) + '</p><div class="row" style="justify-content:flex-end"><button type="button" class="g" data-a="mk-cancel">' + esc(x.cancel) + '</button><button type="button" class="pr" style="padding:0 16px" data-a="mk-use">' + esc(x.use) + "</button></div></div>";
    }

    function render(focus) {
      var x = t(), html = "<style>" + CSS + "</style>", accent = /^#[0-9a-fA-F]{6}$/.test(cfg.look.accent) ? cfg.look.accent : DEFAULTS.look.accent;
      if (st.recording) html += '<div class="rec" role="status"><span class="dot" aria-hidden="true"></span><span id="rk-rt">' + esc(fill(x.recTime, { t: clock(0) })) + '</span><button type="button" data-a="rec-stop">' + esc(x.stop) + "</button></div>";
      else if (st.open) html += '<section class="p ' + (opts.preview ? "in" : posClass()) + (st.view === "markup" ? " wide" : "") + '" role="dialog" aria-labelledby="rk-t">' + (st.view === "sent" ? sentHtml() : st.view === "markup" ? markupHtml() : formHtml()) + "</section>";
      if (!st.recording && (!st.open || opts.preview) && cfg.look.position !== "hidden") {
        html += '<button type="button" class="l ' + (opts.preview ? "" : posClass()) + '"' + (opts.preview ? ' style="position:static;margin-top:12px"' : "") + ' data-a="open" aria-label="' + esc(x.open) + '">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>' + esc(cfg.look.label || x.launcher) + "</button>";
      }
      shadow.innerHTML = html;
      mount.style.setProperty("--a", accent);
      bind();
      if (st.view === "markup" && st.open) paintMarkup();
      if (focus && !opts.preview) { var f = $(focus); if (f) f.focus(); }
    }

    function readForm() {
      var k = $('input[name="rk-k"]:checked'), m = $("#rk-m"), e = $("#rk-e");
      if (k) st.kind = k.value; if (m) st.message = m.value; if (e) st.email = e.value;
      saveDraft();
    }
    function bind() {
      on("[data-a]", "click", function (ev) { act(ev.currentTarget.getAttribute("data-a"), ev.currentTarget); });
      on("[data-tool]", "click", function (ev) { st.tool = ev.currentTarget.getAttribute("data-tool"); var b = shadow.querySelectorAll("[data-tool]"); for (var i = 0; i < b.length; i++) b[i].setAttribute("aria-pressed", String(b[i] === ev.currentTarget)); });
      on("form", "submit", function (ev) { ev.preventDefault(); readForm(); send(); });
      on("textarea,input", "input", readForm); on("input", "change", readForm);
      var f = $("#rk-f"); if (f) f.addEventListener("change", function () { addFiles(f.files); });
      var m = $("#rk-m"); if (m && cfg.allow.files && !opts.preview) m.addEventListener("paste", function (ev) {
        var items = ev.clipboardData && ev.clipboardData.files, images = [];
        for (var i = 0; items && i < items.length; i++) if (/^image\//.test(items[i].type)) images.push(items[i]);
        if (images.length) { ev.preventDefault(); readForm(); addFiles(images); }
      });
      var p = $(".p"); if (p) p.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !opts.preview) { ev.stopPropagation(); if (st.view === "markup") act("mk-cancel"); else act("close"); }
        else if (st.view === "markup" && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey && String(ev.key).toLowerCase() === "z") { ev.preventDefault(); act("mk-undo"); } });
    }
    function addFiles(list) {
      var x = t(); st.error = "";
      for (var i = 0; i < list.length && st.files.length < MAX_FILES; i++) {
        if (list[i].size > MAX_FILE_MB * 1048576) { st.error = fill(x.tooBig, { name: list[i].name, mb: MAX_FILE_MB }); continue; }
        st.files.push(list[i]);
      }
      render();
    }
    function act(a, el) {
      if (opts.preview && a !== "whats") return;   // the preview shows the form; it does not capture, attach or send
      if (a !== "open" && a !== "again") readForm();
      if (a === "open") { st.open = true; st.fail = ""; render("#rk-m"); }
      else if (a === "min") { st.open = false; render(".l"); }
      else if (a === "close") { st.open = false; if (st.view === "sent") reset(); render(".l"); }
      else if (a === "again") { reset(); st.open = true; render("#rk-m"); }
      else if (a === "whats") { st.whats = !st.whats; render('[data-a="whats"]'); }
      else if (a === "file") { var f = $("#rk-f"); if (f) f.click(); }
      else if (a === "file-rm") { st.files.splice(Number(el.getAttribute("data-i")), 1); render('[data-a="file"]'); }
      else if (a === "shot" || a === "retake") capture();
      else if (a === "shot-edit") { st.shot.before = st.shot.shapes.slice(); st.view = "markup"; render('[data-tool="' + st.tool + '"]'); }
      else if (a === "shot-rm") { dropShot(); render('[data-a="shot"]'); }
      else if (a === "mk-cancel") { st.shot.shapes = st.shot.before; st.view = "form"; render('[data-a="shot-edit"]'); }   // the screenshot stays as it was before this edit
      else if (a === "mk-use") useMarkup();
      else if (a === "mk-undo") { st.shot.shapes = removeMark(st.shot.shapes, "last"); paintMarkup(); }
      else if (a === "mk-clear") { st.shot.shapes = removeMark(st.shot.shapes, "all"); paintMarkup(); }
      else if (a === "rec") record();
      else if (a === "rec-stop") { if (st.recording) st.recording.stop(); }
      else if (a === "rec-rm") { st.rec = null; render('[data-a="rec"]'); }
    }
    function reset() { dropShot(); st.view = "form"; st.kind = ""; st.message = ""; st.error = ""; st.fail = ""; st.rec = null; st.files = []; st.ref = ""; clearDraft(); }

    // Private fields: what the host marked with data-rk-private, as rectangles of the viewport.
    function privateRects() {
      if (!cfg.privacy.hide_private) return [];
      var els = doc.querySelectorAll("[data-rk-private]"), out = [];
      for (var i = 0; i < els.length; i++) { var r = els[i].getBoundingClientRect(); out.push({ x: r.left, y: r.top, w: r.width, h: r.height }); }
      return out;
    }
    function displayMedia() {
      var md = win.navigator.mediaDevices;
      if (!md || !md.getDisplayMedia) return Promise.reject(new Error("unsupported"));
      return md.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true, selfBrowserSurface: "include" });
    }
    function settle() { return new Promise(function (ok) { win.setTimeout(ok, 350); }); }

    // Screenshot: one frame of the tab the visitor shares, with private fields blacked out before anyone sees it.
    function capture() {
      var x = t(); st.error = "";
      mount.style.display = "none";   // the widget itself stays out of the picture
      displayMedia().then(function (stream) {
        var video = doc.createElement("video"); video.srcObject = stream; video.muted = true;
        return video.play().then(settle).then(function () {
          var w = video.videoWidth, h = video.videoHeight, c = doc.createElement("canvas"); c.width = w; c.height = h;
          var g = c.getContext("2d"); g.drawImage(video, 0, 0, w, h);
          var hidden = 0;
          if (sameShape(win.innerWidth, win.innerHeight, w, h)) { var rs = scaleRects(privateRects(), win.innerWidth, win.innerHeight, w, h); g.fillStyle = "#111"; for (var i = 0; i < rs.length; i++) g.fillRect(rs[i].x, rs[i].y, rs[i].w, rs[i].h); hidden = rs.length; }
          stream.getTracks().forEach(function (tr) { tr.stop(); });
          var editing = st.view === "markup";   // "Retake" from the editor stays in the editor
          dropShot();
          st.shot = { base: c, shapes: [], before: [], auto: hidden, highlights: 0, hidden: hidden, blob: null, url: "" };
          st.tool = st.tool || "highlight"; st.open = true;
          return bake().then(function () { if (!editing) st.view = "form"; });
        });
      }).catch(function (e) { if (e && e.message === "unsupported") st.error = x.noCapture; }).then(function () { mount.style.display = ""; render(st.view === "markup" ? '[data-tool="' + st.tool + '"]' : '[data-a="shot-edit"]'); });
    }
    function drawShapes(g, shapes, scale) {
      for (var i = 0; i < shapes.length; i++) {
        var s = shapes[i];
        if (s.tool === "highlight") { g.fillStyle = "rgba(250,204,21,.35)"; g.strokeStyle = "#CA8A04"; g.lineWidth = 3 * scale; g.fillRect(s.x, s.y, s.w, s.h); g.strokeRect(s.x, s.y, s.w, s.h); }
        else if (s.tool === "hide") { g.fillStyle = "#111"; g.fillRect(s.x, s.y, s.w, s.h); }
        else if (s.tool === "arrow") {
          var x2 = s.x + s.w, y2 = s.y + s.h, a = Math.atan2(s.h, s.w), n = 16 * scale;
          g.strokeStyle = g.fillStyle = "#DC2626"; g.lineWidth = 4 * scale; g.lineCap = "round"; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(x2, y2); g.stroke();
          g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - n * Math.cos(a - 0.45), y2 - n * Math.sin(a - 0.45)); g.lineTo(x2 - n * Math.cos(a + 0.45), y2 - n * Math.sin(a + 0.45)); g.closePath(); g.fill();
        } else if (s.tool === "text") {
          g.font = "600 " + Math.round(18 * scale) + "px system-ui, sans-serif"; var tw = g.measureText(s.text).width, pad = 6 * scale, th = 24 * scale;
          g.fillStyle = "#DC2626"; g.fillRect(s.x, s.y - th, tw + pad * 2, th + pad); g.fillStyle = "#fff"; g.fillText(s.text, s.x + pad, s.y - pad / 2);
        }
      }
    }
    function paintMarkup(live) {
      var cv = $(".cv"), s = st.shot; if (!cv || !s) return;
      if (cv.width !== s.base.width) { cv.width = s.base.width; cv.height = s.base.height; attachMarkup(cv); }
      var g = cv.getContext("2d"); g.drawImage(s.base, 0, 0); drawShapes(g, live ? s.shapes.concat([live]) : s.shapes, cv.width / Math.max(1, cv.getBoundingClientRect().width));
      var undo = shadow.querySelectorAll('[data-a="mk-undo"],[data-a="mk-clear"]');
      for (var i = 0; i < undo.length; i++) undo[i].disabled = !s.shapes.length;
    }
    function attachMarkup(cv) {
      var start = null;
      function at(ev) { var r = cv.getBoundingClientRect(), k = cv.width / r.width; return { x: (ev.clientX - r.left) * k, y: (ev.clientY - r.top) * k }; }
      cv.addEventListener("pointerdown", function (ev) {
        var p = at(ev);
        if (st.tool === "text") { var text = win.prompt(t().textAsk, ""); if (text) { st.shot.shapes.push({ tool: "text", x: p.x, y: p.y, w: 0, h: 0, text: text.slice(0, 80) }); paintMarkup(); } return; }
        start = p; cv.setPointerCapture(ev.pointerId);
      });
      cv.addEventListener("pointermove", function (ev) { if (!start) return; var p = at(ev); paintMarkup({ tool: st.tool, x: start.x, y: start.y, w: p.x - start.x, h: p.y - start.y }); });
      cv.addEventListener("pointerup", function (ev) {
        if (!start) return; var p = at(ev), w = p.x - start.x, h = p.y - start.y;
        if (Math.abs(w) > 4 || Math.abs(h) > 4) st.shot.shapes.push(st.tool === "arrow" ? { tool: "arrow", x: start.x, y: start.y, w: w, h: h } : { tool: st.tool, x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(w), h: Math.abs(h) });
        start = null; paintMarkup();
      });
    }
    function dropShot() { if (st.shot && st.shot.url && win.URL && win.URL.revokeObjectURL) win.URL.revokeObjectURL(st.shot.url); st.shot = null; }
    /** Flattens the capture and its marks into the image that will be sent, and a small preview of it. */
    function bake() {
      var s = st.shot, c = doc.createElement("canvas"); c.width = s.base.width; c.height = s.base.height;
      var g = c.getContext("2d"); g.drawImage(s.base, 0, 0); drawShapes(g, s.shapes, 1);
      s.highlights = s.shapes.filter(function (q) { return q.tool === "highlight"; }).length;
      s.hidden = s.auto + s.shapes.filter(function (q) { return q.tool === "hide"; }).length;
      return new Promise(function (done) {
        c.toBlob(function (blob) {
          if (s.url && win.URL && win.URL.revokeObjectURL) win.URL.revokeObjectURL(s.url);
          s.blob = blob; s.url = blob && win.URL && win.URL.createObjectURL ? win.URL.createObjectURL(blob) : ""; done();
        }, "image/jpeg", 0.85);
      });
    }
    function useMarkup() { bake().then(function () { st.view = "form"; render('[data-a="shot-edit"]'); }); }

    // Recording: the shared tab is redrawn frame by frame on a canvas, so private fields stay blacked out in the video too.
    function record() {
      var x = t(); st.error = "";
      if (!win.MediaRecorder) { st.error = x.noCapture; render(); return; }
      displayMedia().then(function (stream) {
        var video = doc.createElement("video"); video.srcObject = stream; video.muted = true;
        return video.play().then(function () {
          var c = doc.createElement("canvas"), g = c.getContext("2d"), started = Date.now(), chunks = [], stopped = false, timer;
          var k = Math.min(1, 1280 / video.videoWidth); c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
          function frame() {
            if (stopped) return;
            g.drawImage(video, 0, 0, c.width, c.height);
            if (sameShape(win.innerWidth, win.innerHeight, c.width, c.height)) { var rs = scaleRects(privateRects(), win.innerWidth, win.innerHeight, c.width, c.height); g.fillStyle = "#111"; for (var i = 0; i < rs.length; i++) g.fillRect(rs[i].x, rs[i].y, rs[i].w, rs[i].h); }
            var el = $("#rk-rt"), secs = (Date.now() - started) / 1000; if (el) el.textContent = fill(t().recTime, { t: clock(secs) });
            if (secs >= MAX_RECORD_S) { stop(); return; }
            timer = win.setTimeout(frame, 66);
          }
          var type = win.MediaRecorder.isTypeSupported && win.MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
          var mr = new win.MediaRecorder(c.captureStream(15), { mimeType: type, videoBitsPerSecond: 1200000 });
          mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
          mr.onstop = function () {
            stream.getTracks().forEach(function (tr) { tr.stop(); });
            st.rec = { blob: new Blob(chunks, { type: "video/webm" }), seconds: (Date.now() - started) / 1000 }; st.recording = null; st.open = true; render('[data-a="rec"]');
          };
          function stop() { if (stopped) return; stopped = true; win.clearTimeout(timer); if (mr.state !== "inactive") mr.stop(); }
          stream.getVideoTracks()[0].addEventListener("ended", stop);   // the browser's own "stop sharing"
          st.recording = { stop: stop }; st.open = false; render('[data-a="rec-stop"]');
          mr.start(1000); frame();
        });
      }).catch(function (e) { if (e && e.message === "unsupported") { st.error = x.noCapture; render(); } });
    }

    function send() {
      var x = t(); st.error = ""; st.fail = "";
      if (!st.kind) { st.error = x.needKind; render('input[name="rk-k"]'); return; }
      if (!st.message.trim()) { st.error = x.needMsg; render("#rk-m"); return; }
      if (askEmail() && st.email.trim() && !validEmail(st.email)) { st.error = x.badEmail; render("#rk-e"); return; }
      var email = user && user.email ? user.email : st.email.trim();
      var payload = { kind: st.kind, message: st.message.trim() };
      if (email && !(user && user.email)) payload.email = email;
      if (user) payload.user = { id: user.id != null ? String(user.id) : undefined, name: user.name, email: user.email, hash: user.hash, meta: user.meta };
      if (cfg.allow.details) { payload.details = collectDetails(win); if (cfg.allow.console && errors.length) payload.details.console_errors = errors.slice(-20); }
      var body = new win.FormData(); body.append("payload", JSON.stringify(payload));
      if (st.shot && st.shot.blob) body.append("screenshot", st.shot.blob, "screenshot.jpg");
      if (st.rec) body.append("recording", st.rec.blob, "recording.webm");
      for (var i = 0; i < st.files.length; i++) body.append("files", st.files[i], st.files[i].name);
      st.sending = true; render();
      win.fetch(opts.base + "/api/widget/" + encodeURIComponent(opts.key) + "/feedback", { method: "POST", body: body, credentials: "omit" }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          st.sending = false;
          if (res.ok && data.ref) { st.ref = data.ref; st.sentEmail = email; st.view = "sent"; clearDraft(); render('[data-a="close"]'); }
          else { st.fail = failText(res.status, data.error, x); render(".pr"); }
        });
      }).catch(function () { st.sending = false; st.fail = x.fail; render(".pr"); });
    }

    render();
    return {
      setUser: function (u) { user = u || null; render(); },
      setConfig: function (c) { cfg = withDefaults(c); render(); },
      open: function () { if (!st.open) act("open"); },
      close: function () { if (st.open) act("close"); },
      destroy: function () { shadow.innerHTML = ""; }
    };
  }

  // ── Loading on a host page ────────────────────────────────────
  function boot(win) {
    var doc = win && win.document;
    if (!doc || (win.Redekorate && win.Redekorate.version)) return;
    var script = doc.currentScript || doc.querySelector("script[data-key][src*='widget.js']");
    var key = script && script.getAttribute("data-key"), base = "";
    try { base = new URL(script.src, win.location.href).origin; } catch (e) { /* inline */ }
    var user = win.RedekorateUser || null, instance = null, errors = [], wantOpen = false;
    // Errors are collected from the start and only ever sent if the project enabled it together with page and browser details.
    win.addEventListener("error", function (e) { pushError(errors, e.message || "error", 20); });
    win.addEventListener("unhandledrejection", function (e) { pushError(errors, "Unhandled rejection: " + (e.reason && e.reason.message || e.reason), 20); });
    win.Redekorate = {
      version: "1",
      /** Tells the widget who is signed in: { id, name, email, hash?, meta? }. Call it again with null on sign-out. */
      identify: function (u) { user = u || null; if (instance) instance.setUser(user); },
      open: function () { wantOpen = true; if (instance) instance.open(); },
      close: function () { wantOpen = false; if (instance) instance.close(); },
      /** Renders the form inside `el` with the given settings and never sends anything. Used by the settings page. */
      preview: function (el, config, previewUser) { return create(win, el, { preview: true, config: config, user: previewUser || null }); }
    };
    if (!key) return;   // loaded only for preview()
    win.fetch(base + "/api/widget/" + encodeURIComponent(key) + "/config", { credentials: "omit" }).then(function (res) {
      return res.json().then(function (cfg) {
        if (!res.ok) { if (win.console) win.console.info("[Redekorate] Feedback widget not shown: " + (cfg && cfg.error === "domain_not_allowed" ? "this domain is not in the widget's allowed domains." : "unknown widget key.")); return; }
        if (cfg.paused) return;
        function mountIt() {
          var host = doc.createElement("div"); host.id = "redekorate-widget"; doc.body.appendChild(host);
          instance = create(win, host, { key: key, base: base, config: cfg, user: user, errors: errors });
          if (wantOpen) instance.open();
        }
        if (doc.body) mountIt(); else doc.addEventListener("DOMContentLoaded", mountIt);
      });
    }).catch(function () { /* offline or blocked: the page works as if the widget were not there */ });
  }

  return { boot: boot, create: create, pickLang: pickLang, greeting: greeting, firstName: firstName, parseUA: parseUA, scaleRects: scaleRects, sameShape: sameShape, clock: clock, sizeText: sizeText, pushError: pushError, collectDetails: collectDetails, validEmail: validEmail, withDefaults: withDefaults, failText: failText, removeMark: removeMark, TEXT: TEXT };
});
