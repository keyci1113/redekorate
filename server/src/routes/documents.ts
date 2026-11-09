import { Router } from "express";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { notFound, parse } from "../lib/http.js";
import { ownProject } from "./projects.js";
import { projectRole, requireProject, type ProjectRole } from "../lib/access.js";

export const documents = Router();
documents.use(requireAuth);
const tokenId = customAlphabet("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 24);

const Lang = z.enum(["es", "en"]);
const Data = z.record(z.string(), z.unknown());

async function ownDoc(id: string, userId: string, min: ProjectRole = "viewer") {
  const d = await one("select * from documents where id = $1", [id]);
  if (!d) throw notFound("Documento");
  await requireProject(d.project_id, userId, min);
  return d;
}

documents.get("/", async (req, res) => {
  const { project_id } = parse(z.object({ project_id: z.string().uuid() }), req.query);
  await ownProject(project_id, req.user!.id);
  const rows = await query(
    "select id, kind, title, language, share_token, created_at, updated_at from documents where project_id = $1 order by updated_at desc",
    [project_id]);
  res.json({ documents: rows });
});

documents.post("/", async (req, res) => {
  const b = parse(z.object({ project_id: z.string().uuid(), kind: z.string().min(1).max(60), title: z.string().trim().min(1).max(200), language: Lang, data: Data.default({}) }), req.body);
  await ownProject(b.project_id, req.user!.id, "editor");
  const d = await one(
    "insert into documents(project_id, owner_id, kind, title, language, data) values ($1,$2,$3,$4,$5,$6) returning *",
    [b.project_id, req.user!.id, b.kind, b.title, b.language, JSON.stringify(b.data)]);
  await query("update projects set updated_at = now() where id = $1", [b.project_id]);
  res.status(201).json({ document: d });
});

documents.get("/:id", async (req, res) => {
  const d = await ownDoc(req.params.id, req.user!.id);
  const project = await one("select id, name, color from projects where id = $1", [d.project_id]);
  res.json({ document: d, project: { ...project, role: await projectRole(d.project_id, req.user!.id) } });
});

documents.patch("/:id", async (req, res) => {
  await ownDoc(req.params.id, req.user!.id, "editor");
  const b = parse(z.object({ title: z.string().trim().min(1).max(200).optional(), language: Lang.optional(), data: Data.optional() }), req.body);
  const d = await one(
    `update documents set title = coalesce($2, title), language = coalesce($3, language), data = coalesce($4, data), updated_at = now()
     where id = $1 returning *`,
    [req.params.id, b.title ?? null, b.language ?? null, b.data ? JSON.stringify(b.data) : null]);
  res.json({ document: d });
});

// Duplicar o "Guardar como": copia el documento (opcionalmente con otro nombre y en otro proyecto propio)
documents.post("/:id/duplicate", async (req, res) => {
  const d = await ownDoc(req.params.id, req.user!.id, "editor");
  const b = parse(z.object({ project_id: z.string().uuid().optional(), title: z.string().trim().min(1).max(200).optional() }), req.body ?? {});
  const projectId = b.project_id ?? d.project_id;
  if (b.project_id) await ownProject(b.project_id, req.user!.id, "editor");
  const title = b.title ?? `${d.title} (${d.language === "en" ? "copy" : "copia"})`;
  const copy = await one(
    "insert into documents(project_id, owner_id, kind, title, language, data) values ($1,$2,$3,$4,$5,$6) returning *",
    [projectId, req.user!.id, d.kind, title, d.language, JSON.stringify(d.data)]);
  await query("update projects set updated_at = now() where id = $1", [projectId]);
  res.status(201).json({ document: copy });
});

documents.delete("/:id", async (req, res) => {
  await ownDoc(req.params.id, req.user!.id, "editor");
  await query("delete from documents where id = $1", [req.params.id]);
  res.json({ ok: true });
});

documents.post("/:id/share", async (req, res) => {
  const d = await ownDoc(req.params.id, req.user!.id, "editor");
  const token = d.share_token ?? tokenId();
  await query("update documents set share_token = $2 where id = $1", [d.id, token]);
  res.json({ token });
});

documents.delete("/:id/share", async (req, res) => {
  await ownDoc(req.params.id, req.user!.id, "editor");
  await query("update documents set share_token = null where id = $1", [req.params.id]);
  res.json({ ok: true });
});
