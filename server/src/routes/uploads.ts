import { Router, type RequestHandler } from "express";
import multer from "multer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { customAlphabet } from "nanoid";
import { one } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import { uploadLimiter } from "../lib/security.js";
import { injectTracker, looksLikeHtml } from "../lib/protoTracker.js";
import { z } from "zod";
import { checkLink } from "../lib/linkCheck.js";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
const MAX_MB = Number(process.env.UPLOAD_MAX_MB ?? 10);
const fileId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 24);

// Solo formatos raster. SVG se rechaza porque puede contener scripts.
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { mime: "image/png", ext: "png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a") return { mime: "image/gif", ext: "gif" };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 } });

export const uploads = Router();

const receive = (what: string): RequestHandler => (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") return next(new HttpError(413, `${what} supera ${MAX_MB} MB`));
    if (err) return next(err);
    next();
  });
};

uploads.post("/", requireAuth, uploadLimiter, receive("La imagen"), async (req, res) => {
  const f = req.file;
  if (!f) throw new HttpError(400, "No se recibió ningún archivo");
  const kind = sniff(f.buffer);
  if (!kind) throw new HttpError(415, "Formato no permitido. Usa PNG, JPG, GIF o WEBP.");
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${fileId()}.${kind.ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), f.buffer, { mode: 0o640 });
  await one("insert into uploads(owner_id, filename, mime, size) values ($1,$2,$3,$4)", [req.user!.id, filename, kind.mime, f.size]);
  res.status(201).json({ url: `/uploads/${filename}` });
});

// Prototipos HTML (por ejemplo, descargados de Claude). Se guardan con el script de seguimiento
// ya inyectado y se sirven con CSP "sandbox" (origen opaco): no pueden leer cookies ni llamar a la API.
uploads.post("/prototype", requireAuth, uploadLimiter, receive("El archivo"), async (req, res) => {
  const f = req.file;
  if (!f) throw new HttpError(400, "No se recibió ningún archivo");
  if (!looksLikeHtml(f.buffer)) throw new HttpError(415, "El archivo no parece HTML. Descarga el prototipo como .html.");
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${fileId()}.html`;
  const html = injectTracker(f.buffer.toString("utf8").replace(/^﻿/, ""));
  await writeFile(path.join(UPLOAD_DIR, filename), html, { mode: 0o640 });
  await one("insert into uploads(owner_id, filename, mime, size) values ($1,$2,$3,$4)", [req.user!.id, filename, "text/html", Buffer.byteLength(html)]);
  res.status(201).json({ url: `/uploads/${filename}` });
});

// Prototipo publicado en otro sitio (Figma Make, un sitio desplegado…): se valida el link y se
// informa si el sitio permite mostrarse dentro de un iframe. claude.ai, por ejemplo, no lo permite.
const LinkBody = z.object({ url: z.string().min(8).max(2000) });
uploads.post("/link", requireAuth, uploadLimiter, async (req, res) => {
  const body = LinkBody.safeParse(req.body);
  if (!body.success) throw new HttpError(400, "El link no es válido.");
  const origin = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  res.json(await checkLink(body.data.url, origin));
});
