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
import { dashboard } from "./routes/dashboard.js";
import { documents } from "./routes/documents.js";
import { uploads, UPLOAD_DIR } from "./routes/uploads.js";
import { admin } from "./routes/admin.js";
import { orgs } from "./routes/orgs.js";
import { errorHandler } from "./lib/http.js";
import { csrfGuard, publicLimiter, securityHeaders } from "./lib/security.js";
import { migrate } from "./migrate.js";
import { translate } from "./lib/i18n.js";
import { TRACKER, TRACKER_PATH } from "./lib/protoTracker.js";
import { publicBaseUrl, renderIndexHtml, robotsDirective, robotsTxt, sitemapXml } from "./lib/seo.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
app.use(securityHeaders);
// Gzip/Brotli for JSON and static assets; the reverse proxy is not assumed to compress
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// API
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use("/api", csrfGuard);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth/oauth", oauth);
app.use("/api/auth", auth);
app.use("/api/dashboard", dashboard);
app.use("/api/projects", projects);
app.use("/api/studies", studies);
app.use("/api/insights", insights);
app.use("/api/participants", participants);
app.use("/api/documents", documents);
app.use("/api/uploads", uploads);
app.use("/api/admin", admin);
app.use("/api/orgs", orgs);
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
const baseUrl = (req: express.Request) => publicBaseUrl(process.env.APP_URL, req.protocol, req.get("host"));
app.get("/robots.txt", (req, res) => res.type("text/plain").set("Cache-Control", "public, max-age=3600").send(robotsTxt(baseUrl(req))));
app.get("/sitemap.xml", (req, res) => res.type("application/xml").set("Cache-Control", "public, max-age=3600").send(sitemapXml(baseUrl(req))));

// Frontend compilado
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  // Vite hashes everything under /assets, so those files can be cached forever.
  app.use("/assets", express.static(path.join(webDist, "assets"), { index: false, immutable: true, maxAge: "1y" }));
  // The raw template has placeholders and no robots tag; send it through the rendered route instead.
  app.get("/index.html", (_req, res) => res.redirect(301, "/"));
  app.use(express.static(webDist, { index: false, maxAge: "1h" }));
  // index.html must always be revalidated or users keep an old asset manifest after a deploy.
  // It is filled in per request: absolute URLs for link previews, and noindex on every private page.
  const indexHtml = readFileSync(path.join(webDist, "index.html"), "utf8");
  app.get(/.*/, (req, res) => {
    res.set({ "Cache-Control": "no-cache", "X-Robots-Tag": robotsDirective(req.path) })
      .type("html").send(renderIndexHtml(indexHtml, baseUrl(req), req.path));
  });
}

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
migrate()
  .then(() => app.listen(port, () => console.log(`Redekorate en http://localhost:${port}`)))
  .catch((e) => { console.error("No se pudo migrar la base de datos", e); process.exit(1); });
