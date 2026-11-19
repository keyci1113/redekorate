import express from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { auth } from "./routes/auth.js";
import { oauth } from "./routes/oauth.js";
import { projects } from "./routes/projects.js";
import { studies } from "./routes/studies.js";
import { insights } from "./routes/insights.js";
import { participants } from "./routes/participants.js";
import { publicApi } from "./routes/public.js";
import { purgeOldRecordings } from "./lib/recordings.js";
import { dashboard } from "./routes/dashboard.js";
import { documents } from "./routes/documents.js";
import { uploads, UPLOAD_DIR } from "./routes/uploads.js";
import { files } from "./routes/files.js";
import { admin } from "./routes/admin.js";
import { orgs } from "./routes/orgs.js";
import { errorHandler } from "./lib/http.js";
import { csrfGuard, publicLimiter, securityHeaders } from "./lib/security.js";
import { migrate } from "./migrate.js";
import { translate } from "./lib/i18n.js";
import { TRACKER, TRACKER_PATH } from "./lib/protoTracker.js";
import { indexingEnabled, publicBaseUrl, renderIndexHtml, robotsDirective, robotsTxt, sitemapXml } from "./lib/seo.js";
import { linkPreview } from "./lib/linkPreview.js";
import { connectApi, oauthServer, openCors } from "./routes/apiAccess.js";
import { mcpRouter } from "./mcp/server.js";
import { mcpLimiter } from "./lib/security.js";
import { getMaintenance, maintenanceGate } from "./lib/maintenance.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
app.use(securityHeaders);
// Gzip/Brotli for JSON and static assets; the reverse proxy is not assumed to compress
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
// Maintenance mode: answers 503 to the API and MCP for everyone but admins while an admin has it on.
app.use(maintenanceGate);

const port = Number(process.env.PORT ?? 4000);
const baseUrl = (req: express.Request) => publicBaseUrl(process.env.APP_URL, req.protocol, req.get("host"));

// Outside access: OAuth for MCP clients, and the MCP endpoint (bearer tokens only, never the session cookie).
app.use(oauthServer(baseUrl));
app.use("/mcp", openCors, mcpLimiter, mcpRouter({ apiBase: `http://127.0.0.1:${port}/api`, baseUrl }));

// API
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use("/api", csrfGuard);
// The web app's maintenance screen polls this until the app is back (after a deploy) or maintenance is off.
app.get("/api/health", async (_req, res) => {
  const m = await getMaintenance();
  res.json({ ok: true, maintenance: m.on ? { message: m.message, since: m.since } : null });
});
app.use("/api/auth/oauth", oauth);
app.use("/api/auth", auth);
app.use("/api/dashboard", dashboard);
app.use("/api/projects/:id/files", files);
app.use("/api/projects", projects);
app.use("/api/studies", studies);
app.use("/api/insights", insights);
app.use("/api/participants", participants);
app.use("/api/documents", documents);
app.use("/api/uploads", uploads);
app.use("/api/admin", admin);
app.use("/api/orgs", orgs);
app.use("/api/connect", connectApi(baseUrl));
app.use("/api/public", publicLimiter, publicApi);
app.use("/api", (req, res) => res.status(404).json({ error: translate("Ruta no encontrada", req.get("x-lang")) }));

// Script de seguimiento de los prototipos HTML (lo cargan desde su sandbox). Sin caché larga: cambia con cada deploy.
app.get(TRACKER_PATH, (_req, res) => {
  // El prototipo corre en un sandbox con origen opaco: sin CORP "cross-origin" el navegador bloquearía este script.
  res.type("application/javascript").set({ "Cache-Control": "no-cache", "Cross-Origin-Resource-Policy": "cross-origin" }).send(TRACKER);
});

// Archivos subidos: nombres aleatorios, sin listado de directorio.
// Las imágenes no ejecutan nada. Los prototipos HTML corren en un sandbox con origen opaco
// (sin acceso a cookies, almacenamiento ni a la API) y solo se pueden incrustar desde la app.
const PROTOTYPE_CSP = [
  "sandbox allow-scripts allow-forms allow-modals allow-popups",
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  "frame-ancestors 'self'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");
app.use("/uploads", express.static(UPLOAD_DIR, {
  index: false, dotfiles: "deny", maxAge: "30d", immutable: true,
  setHeaders: (res, file) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Robots-Tag", "noindex, nofollow");  // participant uploads never belong in search results
    res.set("Content-Security-Policy", file.endsWith(".html") ? PROTOTYPE_CSP : "default-src 'none'");
  },
}));

// Search engines: robots.txt and the sitemap depend on APP_URL, so they are generated, not static files.
app.get("/robots.txt", (req, res) => res.type("text/plain").set("Cache-Control", "public, max-age=3600").send(robotsTxt(baseUrl(req))));
app.get("/sitemap.xml", (req, res) => res.type("application/xml").set("Cache-Control", "public, max-age=3600").send(sitemapXml(baseUrl(req))));

// Frontend compilado
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  // Vite hashes everything under /assets, so those files can be cached forever.
  // A file that is not there must be a real 404, never index.html: an old tab asking for a page file from the
  // build before a deploy would otherwise get HTML, fail with a confusing MIME error and render a blank page.
  app.use("/assets", express.static(path.join(webDist, "assets"), { index: false, immutable: true, maxAge: "1y" }));
  app.use("/assets", (_req, res) => res.status(404).set("Cache-Control", "no-store").type("text/plain").send("Not found"));
  // The raw template has placeholders and no robots tag; send it through the rendered route instead.
  app.get("/index.html", (_req, res) => res.redirect(301, "/"));
  app.use(express.static(webDist, { index: false, maxAge: "1h" }));
  // index.html must always be revalidated or users keep an old asset manifest after a deploy.
  // It is filled in per request: absolute URLs for link previews, and noindex on every private page.
  const indexHtml = readFileSync(path.join(webDist, "index.html"), "utf8");
  app.get(/.*/, async (req, res) => {
    // A failed lookup must never break the page: fall back to the generic card.
    const preview = await linkPreview(req.path).catch((e) => { console.error("link preview", e); return null; });
    res.set({ "Cache-Control": "no-cache", "X-Robots-Tag": robotsDirective(req.path) })
      .type("html").send(renderIndexHtml(indexHtml, baseUrl(req), req.path, indexingEnabled(), preview));
  });
}

app.use(errorHandler);

migrate()
  .then(() => {
    // Old session recordings are deleted once a day (and at start).
    const purge = () => purgeOldRecordings().then((n) => { if (n) console.log(`Deleted ${n} session recordings past their retention time`); }).catch((e) => console.warn("[recordings] purge failed:", e.message));
    void purge(); setInterval(purge, 24 * 3600 * 1000).unref();
  })
  .then(() => app.listen(port, () => console.log(`Redekorate en http://localhost:${port}`)))
  .catch((e) => { console.error("No se pudo migrar la base de datos", e); process.exit(1); });
