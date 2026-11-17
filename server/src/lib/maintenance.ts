// Maintenance mode: an admin switches it on while working on the instance. Everyone else gets a 503 with
// { maintenance: true } and the web app shows its maintenance screen; admins keep working. The state lives in
// app_settings so a deploy or restart does not turn it off, and is cached for a few seconds per process.
import type { NextFunction, Request, Response } from "express";
import { one, query } from "./db.js";
import { readUser } from "./auth.js";
import { translate } from "./i18n.js";

export interface Maintenance { on: boolean; message: string; since: string | null }
export const OFF: Maintenance = { on: false, message: "", since: null };

/** Paths that keep working during maintenance: the health check the screen polls, and signing in/out (so an admin can get in). */
const OPEN = [/^\/api\/health$/, /^\/api\/auth\/(login|logout|me|oauth\/.*)$/];

/** Pure: does maintenance stop this request? */
export function maintenanceBlocks(m: Maintenance, path: string, isAdmin: boolean): boolean {
  if (!m.on || isAdmin) return false;
  if (!path.startsWith("/api/") && !path.startsWith("/mcp")) return false;   // pages and assets load; the app then shows the screen
  return !OPEN.some((re) => re.test(path));
}

let cache: { at: number; value: Maintenance } | null = null;
const TTL_MS = 5000;

export async function getMaintenance(): Promise<Maintenance> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const row = await one<{ value: Partial<Maintenance> }>("select value from app_settings where key = 'maintenance'").catch(() => null);
  const v = row?.value;
  const value: Maintenance = v?.on ? { on: true, message: String(v.message ?? ""), since: v.since ?? null } : OFF;
  cache = { at: Date.now(), value };
  return value;
}

export async function setMaintenance(on: boolean, message: string, by: string): Promise<Maintenance> {
  const value = on ? { on: true, message, since: new Date().toISOString(), by } : { on: false, message, since: null, by };
  await query(
    `insert into app_settings(key, value, updated_at) values ('maintenance', $1, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(value)]);
  cache = null;
  return getMaintenance();
}

/** Express gate, mounted before every API route. */
export async function maintenanceGate(req: Request, res: Response, next: NextFunction) {
  try {
    const m = await getMaintenance();
    if (!m.on) return next();
    const path = req.originalUrl.split("?")[0];
    if (!maintenanceBlocks(m, path, false)) return next();
    const user = await readUser(req).catch(() => null);
    if (user?.role === "admin") return next();
    res.set("Retry-After", "60").status(503).json({ maintenance: true, message: m.message, error: translate("En mantenimiento. Vuelve en unos minutos.", req.get("x-lang")) });
  } catch (e) { next(e); }
}
