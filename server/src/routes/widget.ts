// Feedback widget.
//   Team side (signed in):   /api/projects/:id/widget          settings, key rotation, test feedback
//   Other sites (public):    /api/widget/:key/config|feedback  called by /widget.js from the allowed domains
import { Router, type Request, type Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, parse } from "../lib/http.js";
import { atLeast, projectIn } from "../lib/access.js";

const requireProject = projectIn("tickets");
import { KINDS, Settings, cleanDomain, domainAllowed, identityVerified, newPublicKey, newSecret, normalizeSettings, publicConfig, titleFrom, type Kind, type WidgetSettings } from "../lib/widget.js";
import { insertTicket, projectPeople, tx } from "../services/tickets.js";
import { UPLOAD_DIR, sniff } from "./uploads.js";
import { FileRejected, scanUpload } from "../lib/fileScan.js";

interface WidgetRow { project_id: string; public_key: string; secret: string; paused: boolean; allowed_domains: string[]; settings: unknown; seq: number }
const fileId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 24);
const pid = (req: Request) => (req.params as { id: string }).id;

/** The project's widget, created with fresh keys the first time anyone looks at it. */
async function widgetOf(projectId: string): Promise<WidgetRow> {
  const w = await one<WidgetRow>(
    `insert into feedback_widgets(project_id, public_key, secret) values ($1,$2,$3)
     on conflict (project_id) do update set project_id = excluded.project_id returning *`, [projectId, newPublicKey(), newSecret()]);
  return w!;
}

// ── Team side ───────────────────────────────────────────────────
export const widget = Router({ mergeParams: true });
widget.use(requireAuth);

async function view(projectId: string, canEdit: boolean) {
  const w = await widgetOf(projectId);
  const [stats, people] = await Promise.all([
    one<{ week: number; last_at: string | null; last_url: string | null }>(
      `select count(*) filter (where r.created_at > now() - interval '7 days')::int as week, max(r.created_at) as last_at,
         (select x.metadata->>'page_url' from ticket_reporters x join tickets tx on tx.id = x.ticket_id where tx.project_id = $1 order by x.created_at desc limit 1) as last_url
       from ticket_reporters r join tickets t on t.id = r.ticket_id where t.project_id = $1`, [projectId]),
    projectPeople(projectId),
  ]);
  let last_host: string | null = null;
  try { last_host = stats?.last_url ? new URL(stats.last_url).host : null; } catch { /* not a URL */ }
  return {
    public_key: w.public_key, secret: canEdit ? w.secret : null, paused: w.paused, allowed_domains: w.allowed_domains, settings: normalizeSettings(w.settings),
    stats: { week: stats?.week ?? 0, last_at: stats?.last_at ?? null, last_host },
    people: people.map(({ id, name, avatar }) => ({ id, name, avatar })),
  };
}

widget.get("/", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id);
  res.json({ widget: await view(p.id, atLeast(p.role, "editor")), role: p.role, project: { id: p.id, name: p.name } });
});

widget.put("/", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const b = parse(z.object({ settings: Settings.optional(), allowed_domains: z.array(z.string().max(200)).max(50).optional(), paused: z.boolean().optional() }), req.body);
  await widgetOf(p.id);
  let domains: string[] | null = null;
  if (b.allowed_domains) {
    domains = [];
    for (const raw of b.allowed_domains) {
      const d = cleanDomain(raw);
      if (!d) throw new HttpError(400, "Uno de los dominios no es válido. Escribe solo el dominio, por ejemplo app.acme.com o *.acme.com");
      if (!domains.includes(d)) domains.push(d);
    }
  }
  if (b.settings?.assignee_id && !(await projectPeople(p.id)).some((x) => x.id === b.settings!.assignee_id)) throw new HttpError(400, "Solo se puede asignar o etiquetar a colaboradores del proyecto");
  await query(
    `update feedback_widgets set settings = coalesce($2, settings), allowed_domains = coalesce($3, allowed_domains), paused = coalesce($4, paused), updated_at = now() where project_id = $1`,
    [p.id, b.settings ? JSON.stringify(b.settings) : null, domains, b.paused ?? null]);
  res.json({ widget: await view(p.id, true) });
});

/** A new public key: the old one stops working at once, so every site must update its snippet. */
widget.post("/rotate-key", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  await widgetOf(p.id);
  await query("update feedback_widgets set public_key = $2, updated_at = now() where project_id = $1", [p.id, newPublicKey()]);
  res.json({ widget: await view(p.id, true) });
});

/** Sends a feedback as the signed-in person, to see where it lands without installing anything. */
widget.post("/test", async (req, res) => {
  const p = await requireProject(pid(req), req.user!.id, "editor");
  const w = await widgetOf(p.id);
  const r = await ingest(w, {
    kind: "question", message: "Este es un feedback de prueba enviado desde la configuración del widget. Puedes eliminarlo.",
    user: { id: req.user!.id, name: req.user!.name, email: req.user!.email }, details: { page_title: "Redekorate" },
  }, {}, true);
  res.status(201).json(r);
});

// ── Ingestion ───────────────────────────────────────────────────
const short = (max: number) => z.string().trim().max(max);
const Details = z.object({
  page_url: short(2000), page_title: short(300), os: short(80), browser: short(80), window_size: short(40), screen_resolution: short(40),
  pixel_ratio: z.union([z.number(), short(12)]), color_depth: short(20), language: short(35), timezone: short(80),
  console_errors: z.array(short(400)).max(20),
}).partial();
const Feedback = z.object({
  kind: z.enum(KINDS),
  message: z.string().trim().min(1).max(5000),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  user: z.object({ id: short(120).optional(), name: short(120).optional(), email: z.string().trim().toLowerCase().email().max(254).optional(), hash: short(64).optional(), meta: z.record(z.string().max(60), z.unknown()).optional() }).optional(),
  details: Details.optional(),
});
type FeedbackInput = z.infer<typeof Feedback>;
interface Saved { screenshot?: string; recording?: string; files?: { url: string; name: string }[] }

/** Custom data from the host, kept small: at most 20 keys with short scalar values. */
function cleanMeta(meta: Record<string, unknown> | undefined) {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(meta ?? {}).slice(0, 20)) {
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 200);
  }
  return out;
}

/** Turns one feedback into a ticket of the widget's project, with who sent it and from where. */
async function ingest(w: WidgetRow, input: FeedbackInput, saved: Saved, verifiedBySession = false) {
  const s: WidgetSettings = normalizeSettings(w.settings);
  const people = await projectPeople(w.project_id);
  const u = input.user ?? {};
  const email = u.email ?? input.email ?? null;
  const verified = verifiedBySession || identityVerified(w.secret, u.id, u.hash);
  const { console_errors, ...details } = input.details ?? {};
  return tx(async (c) => {
    const { rows: [{ seq }] } = await c.query("update feedback_widgets set seq = seq + 1 where project_id = $1 returning seq", [w.project_id]);
    const ref = `FB-${seq}`;
    const t = await insertTicket(c, w.project_id, null, {
      title: titleFrom(input.message), description: input.message, type: s.types[input.kind as Kind], status: "todo", source: "widget", labels: ["feedback"],
      assignees: s.assignee_id && people.some((p) => p.id === s.assignee_id) ? [s.assignee_id] : [],
    }, people);
    // What we already know about this person in this project: when they first wrote and how many times.
    const { rows: [before] } = await c.query(
      `select count(*)::int as n, min(coalesce(r.first_seen, r.created_at)) as first from ticket_reporters r join tickets t on t.id = r.ticket_id
       where t.project_id = $1 and (($2::text is not null and r.external_user_id = $2) or ($3::text is not null and r.email = $3))`, [w.project_id, u.id ?? null, email]);
    await c.query(
      `insert into ticket_reporters(ticket_id, ref, name, email, external_user_id, verified, first_seen, last_seen, reports_count, metadata, custom_data, attachments)
       values ($1,$2,$3,$4,$5,$6, coalesce($7, now()), now(), $8, $9, $10, $11)`,
      [t.id, ref, u.name ?? null, email, u.id ?? null, verified, before.first, before.n + 1,
       JSON.stringify({ ...details, kind: input.kind, ...(console_errors?.length ? { console_errors } : {}), sent_at: new Date().toISOString() }),
       JSON.stringify(cleanMeta(u.meta)), JSON.stringify(saved)]);
    return { ref, number: t.number };
  });
}

// ── Other sites ─────────────────────────────────────────────────
const MB = 1024 * 1024;
const LIMITS = { screenshot: 8 * MB, recording: 25 * MB, files: 10 * MB };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.recording, files: 5, fields: 4, fieldSize: 200 * 1024 } })
  .fields([{ name: "screenshot", maxCount: 1 }, { name: "recording", maxCount: 1 }, { name: "files", maxCount: 3 }]);

/** Images, PDF and video, recognized by their first bytes (the name and the declared type are ignored). */
function sniffAttachment(buf: Buffer): { mime: string; ext: string } | null {
  const image = sniff(buf);
  if (image) return image;
  if (buf.length < 12) return null;
  if (buf.toString("ascii", 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { mime: "video/webm", ext: "webm" };
  if (buf.toString("ascii", 4, 8) === "ftyp") return { mime: "video/mp4", ext: "mp4" };
  return null;
}
async function store(buf: Buffer, ownerId: string, allow: (ext: string) => boolean): Promise<string> {
  const kind = sniffAttachment(buf);
  if (!kind || !allow(kind.ext)) throw new HttpError(415, "Formato no permitido");
  await scanUpload(buf, kind.ext, "widget");
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${fileId()}.${kind.ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), buf, { mode: 0o640 });
  await query("insert into uploads(owner_id, filename, mime, size) values ($1,$2,$3,$4)", [ownerId, filename, kind.mime, buf.length]);
  return `/uploads/${filename}`;
}

export const widgetPublic = Router();
const limiter = rateLimit({ windowMs: 10 * 60_000, limit: Number(process.env.WIDGET_PER_IP_10MIN ?? 30), standardHeaders: "draft-7", legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: "rate_limited" }) });

/** These endpoints are called from other sites. The answer is readable from anywhere (no cookies are involved); what is allowed is decided per request by the Origin. */
function cors(req: Request, res: Response) {
  res.set({ "Access-Control-Allow-Origin": req.get("origin") ?? "*", Vary: "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "600", "Cross-Origin-Resource-Policy": "cross-origin", "Cache-Control": "no-store" });
}
widgetPublic.use((req, res, next) => { cors(req, res); if (req.method === "OPTIONS") { res.status(204).end(); return; } next(); });

/** The widget for a key, when the request comes from one of its domains. Errors use short codes: the script decides what to tell the visitor. */
async function allowedWidget(req: Request, res: Response): Promise<WidgetRow | null> {
  const w = await one<WidgetRow>("select w.* from feedback_widgets w join projects p on p.id = w.project_id where w.public_key = $1 and not p.archived", [req.params.key]);
  if (!w) { res.status(404).json({ error: "unknown_key" }); return null; }
  if (!domainAllowed(req.get("origin"), w.allowed_domains)) { res.status(403).json({ error: "domain_not_allowed" }); return null; }
  return w;
}

widgetPublic.get("/:key/config", async (req, res) => {
  const w = await allowedWidget(req, res);
  if (!w) return;
  if (w.paused) { res.json({ paused: true }); return; }
  res.json({ paused: false, ...publicConfig(normalizeSettings(w.settings)) });
});

widgetPublic.post("/:key/feedback", limiter, (req, res, next) => {
  upload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) { res.status(413).json({ error: "too_large" }); return; }
    if (err) { next(err); return; }
    next();
  });
}, async (req, res) => {
  const w = await allowedWidget(req, res);
  if (!w) return;
  if (w.paused) { res.status(403).json({ error: "paused" }); return; }
  let input: FeedbackInput;
  try { input = Feedback.parse(JSON.parse(String((req.body as { payload?: string }).payload ?? ""))); }
  catch { res.status(400).json({ error: "invalid" }); return; }
  const s = normalizeSettings(w.settings);
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const owner = (await one<{ owner_id: string }>("select owner_id from projects where id = $1", [w.project_id]))!.owner_id;
  // What the project turned off is dropped here too, whatever the page sends.
  if (!s.allow.details) input = { ...input, details: undefined };
  else if (!s.allow.console && input.details) input = { ...input, details: { ...input.details, console_errors: undefined } };
  const saved: Saved = {};
  try {
    const shot = files.screenshot?.[0], rec = files.recording?.[0];
    if (shot && s.allow.screenshot) { if (shot.size > LIMITS.screenshot) throw new HttpError(413, "too_large"); saved.screenshot = await store(shot.buffer, owner, (e) => ["png", "jpg", "webp"].includes(e)); }
    if (rec && s.allow.recording) saved.recording = await store(rec.buffer, owner, (e) => ["webm", "mp4"].includes(e));
    if (s.allow.files) for (const f of files.files ?? []) {
      if (f.size > LIMITS.files) throw new HttpError(413, "too_large");
      (saved.files ??= []).push({ url: await store(f.buffer, owner, () => true), name: path.basename(f.originalname).slice(0, 120) });
    }
  } catch (e) {
    // Short codes: the widget script decides what to tell the visitor. "blocked" = refused by the security scan.
    if (e instanceof FileRejected) { res.status(e.status).json({ error: e.reason === "unavailable" ? "scan_unavailable" : "blocked" }); return; }
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.status === 413 ? "too_large" : "bad_file" }); return; }
    throw e;
  }
  const r = await ingest(w, input, saved);
  res.status(201).json({ ref: r.ref });
});

