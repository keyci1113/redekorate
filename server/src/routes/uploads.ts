import { Router } from "express";
import multer from "multer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { customAlphabet } from "nanoid";
import { one } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import { uploadLimiter } from "../lib/security.js";

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

uploads.post("/", requireAuth, uploadLimiter, (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") return next(new HttpError(413, `La imagen supera ${MAX_MB} MB`));
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
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
