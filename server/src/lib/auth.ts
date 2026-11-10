import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { HttpError } from "./http.js";
import { one } from "./db.js";

const DEFAULT_SECRET = "dev-secret-change-me";
const SECRET = process.env.JWT_SECRET ?? DEFAULT_SECRET;
export const COOKIE = "rk_session";
const MAX_AGE_DAYS = 14;

if (process.env.NODE_ENV === "production" && (SECRET === DEFAULT_SECRET || SECRET.length < 32)) {
  console.error("✗ JWT_SECRET debe tener al menos 32 caracteres en producción. Genera uno con: openssl rand -hex 32");
  process.exit(1);
}

export type Role = "admin" | "member";
export interface AuthUser { id: string; email: string; name: string; role: Role; avatar: string | null; onboarded_at: string | null }
interface TokenPayload extends AuthUser { tv: number }

declare global {
  namespace Express { interface Request { user?: AuthUser } }
}

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
  path: "/",
});

export function signSession(res: Response, user: AuthUser, tokenVersion: number) {
  const token = jwt.sign({ ...user, tv: tokenVersion } satisfies TokenPayload, SECRET, { expiresIn: `${MAX_AGE_DAYS}d`, algorithm: "HS256" });
  res.cookie(COOKIE, token, { ...cookieOpts(), maxAge: MAX_AGE_DAYS * 24 * 3600 * 1000 });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, cookieOpts());
}

function decode(req: Request): TokenPayload | null {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try { return jwt.verify(token, SECRET, { algorithms: ["HS256"] }) as TokenPayload; } catch { return null; }
}

/** Verifica el token y que no haya sido revocado (cambio de contraseña, "cerrar todas las sesiones"). */
export async function readUser(req: Request): Promise<AuthUser | null> {
  const t = decode(req);
  if (!t) return null;
  const row = await one<{ id: string; email: string; name: string; role: Role; avatar: string | null; onboarded_at: string | null; token_version: number; disabled_at: string | null }>(
    "select id, email, name, role, avatar, onboarded_at, token_version, disabled_at from users where id = $1", [t.id]);
  if (!row || row.token_version !== t.tv || row.disabled_at) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, avatar: row.avatar, onboarded_at: row.onboarded_at };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await readUser(req);
  if (!user) return next(new HttpError(401, "No autenticado"));
  req.user = user;
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return next(new HttpError(403, "Solo para administradores"));
  next();
}
