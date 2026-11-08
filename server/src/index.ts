import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { auth } from "./routes/auth.js";
import { projects } from "./routes/projects.js";
import { studies } from "./routes/studies.js";
import { insights } from "./routes/insights.js";
import { participants } from "./routes/participants.js";
import { publicApi } from "./routes/public.js";
import { dashboard } from "./routes/dashboard.js";
import { documents } from "./routes/documents.js";
import { uploads, UPLOAD_DIR } from "./routes/uploads.js";
import { errorHandler } from "./lib/http.js";
import { csrfGuard, publicLimiter, securityHeaders } from "./lib/security.js";
import { migrate } from "./migrate.js";
import { translate } from "./lib/i18n.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
app.use(securityHeaders);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// API
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use("/api", csrfGuard);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", auth);
app.use("/api/dashboard", dashboard);
app.use("/api/projects", projects);
app.use("/api/studies", studies);
app.use("/api/insights", insights);
app.use("/api/participants", participants);
app.use("/api/documents", documents);
app.use("/api/uploads", uploads);
app.use("/api/public", publicLimiter, publicApi);
app.use("/api", (req, res) => res.status(404).json({ error: translate("Ruta no encontrada", req.get("x-lang")) }));

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
    res.set("Content-Security-Policy", file.endsWith(".html") ? PROTOTYPE_CSP : "default-src 'none'");
  },
}));

// Frontend compilado
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist, { index: false, maxAge: "1h" }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
migrate()
  .then(() => app.listen(port, () => console.log(`Redekorate en http://localhost:${port}`)))
  .catch((e) => { console.error("No se pudo migrar la base de datos", e); process.exit(1); });
