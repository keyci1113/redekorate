// Files of a project (the "Documents" tab): a small shared drive for PDFs, Word, Markdown and similar.
// Everyone in the project sees and downloads them; editors and up add, rename and delete.
// The bytes are kept under UPLOAD_DIR/.files, which the public /uploads route refuses to serve, and only leave through here.
import { Router, type Request, type RequestHandler } from "express";
import multer from "multer";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { requireProject } from "../lib/access.js";
import { uploadLimiter } from "../lib/security.js";
import { FILE_EXTENSIONS, cleanName, disposition, fileKind } from "../lib/projectFiles.js";
import { scanUpload } from "../lib/fileScan.js";
import { UPLOAD_DIR } from "./uploads.js";

export const FILES_DIR = path.join(UPLOAD_DIR, ".files");
const MAX_MB = Number(process.env.FILES_MAX_MB ?? 25);
const storedId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 32);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 } });
const receive: RequestHandler = (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") return next(new HttpError(413, `El archivo supera ${MAX_MB} MB`));
    next(err);
  });
};

export const files = Router({ mergeParams: true });
files.use(requireAuth);
const pid = (req: Request) => (req.params as { id: string }).id;

const LIST_SQL = `select f.id, f.name, f.mime, f.size, f.created_at, f.uploaded_by, u.name as uploaded_by_name
  from project_files f left join users u on u.id = f.uploaded_by where f.project_id = $1 order by f.created_at desc`;
const list = (projectId: string) => query(LIST_SQL, [projectId]);
const stored = async (projectId: string, fileId: string) => {
  if (!z.string().uuid().safeParse(fileId).success) throw notFound("Archivo");
  const f = await one<{ id: string; name: string; mime: string; stored: string }>("select id, name, mime, stored from project_files where id = $1 and project_id = $2", [fileId, projectId]);
  if (!f) throw notFound("Archivo");
  return f;
};

/** Removes the bytes of deleted rows. A file already gone is not an error. */
export const removeStored = (names: string[]) => Promise.all(names.map((n) => unlink(path.join(FILES_DIR, n)).catch(() => {})));

files.get("/", async (req, res) => {
  await requireProject(pid(req), req.user!.id);
  res.json({ files: await list(pid(req)), max_mb: MAX_MB, extensions: FILE_EXTENSIONS });
});

files.post("/", uploadLimiter, receive, async (req, res) => {
  await requireProject(pid(req), req.user!.id, "editor");
  const f = req.file;
  if (!f) throw new HttpError(400, "No se recibió ningún archivo");
  // Browsers send the name as latin1 bytes; read it back as the UTF-8 it really is.
  const name = cleanName(Buffer.from(f.originalname, "latin1").toString("utf8"));
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  const notAllowed = () => new HttpError(415, "Formato no permitido. Sube PDF, Word, Excel, PowerPoint, Markdown, texto o CSV.");
  if (!FILE_EXTENSIONS.includes(ext) || f.size === 0) throw notAllowed();
  // Security scan before anything is kept: real type, active content, macros, antivirus (422/503 with the reason).
  await scanUpload(f.buffer, ext, "files");
  const kind = fileKind(name, f.buffer);
  if (!kind) throw notAllowed();
  await mkdir(FILES_DIR, { recursive: true });
  const disk = `${storedId()}.${kind.ext}`;
  await writeFile(path.join(FILES_DIR, disk), f.buffer, { mode: 0o640 });
  await query("insert into project_files(project_id, name, mime, size, stored, uploaded_by) values ($1,$2,$3,$4,$5,$6)", [pid(req), name, kind.mime, f.size, disk, req.user!.id]);
  res.status(201).json({ files: await list(pid(req)) });
});

/** The file itself. `?view=1` shows PDFs and text in the browser; everything else, and every other request, downloads. */
files.get("/:fileId", async (req, res) => {
  await requireProject(pid(req), req.user!.id);
  const f = await stored(pid(req), (req.params as { fileId: string }).fileId);
  const viewable = f.mime === "application/pdf" || f.mime.startsWith("text/markdown") || f.mime.startsWith("text/plain");
  const inline = req.query.view === "1" && viewable;
  res.set({
    // Markdown is shown as plain text: nothing a person uploads is ever run or rendered as a page on this origin.
    "Content-Type": inline && f.mime.startsWith("text/") ? "text/plain; charset=utf-8" : f.mime,
    "Content-Disposition": disposition(f.name, inline),
    "X-Content-Type-Options": "nosniff",
    // A sandboxed response cannot start the browser's PDF viewer, so an inline PDF goes without it; a PDF is never run as a page.
    ...(inline && f.mime === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; sandbox" }),
    "Cache-Control": "private, no-store",
  });
  res.sendFile(f.stored, { root: FILES_DIR, dotfiles: "allow" }, (err) => { if (err && !res.headersSent) res.status(404).json({ error: "Archivo no encontrado" }); });
});

files.patch("/:fileId", async (req, res) => {
  await requireProject(pid(req), req.user!.id, "editor");
  const f = await stored(pid(req), (req.params as { fileId: string }).fileId);
  const b = parse(z.object({ name: z.string().trim().min(1).max(200) }), req.body);
  // The extension says what the file is, so a rename keeps it.
  const ext = /\.[a-z0-9]+$/i.exec(f.name)?.[0] ?? "";
  const base = cleanName(b.name).replace(new RegExp(`${ext.replace(".", "\\.")}$`, "i"), "").trim();
  if (!base) throw new HttpError(400, "Escribe un nombre para el archivo");
  await query("update project_files set name = $2 where id = $1", [f.id, cleanName(base + ext)]);
  res.json({ files: await list(pid(req)) });
});

files.delete("/:fileId", async (req, res) => {
  await requireProject(pid(req), req.user!.id, "editor");
  const f = await stored(pid(req), (req.params as { fileId: string }).fileId);
  await query("delete from project_files where id = $1", [f.id]);
  await removeStored([f.stored]);
  res.json({ files: await list(pid(req)) });
});
