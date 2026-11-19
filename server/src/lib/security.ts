import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import helmet from "helmet";
import { HttpError } from "./http.js";
import { translate } from "./i18n.js";
import { verifyBearer } from "./apiAccess.js";
import { brokenPasswordRule, type PasswordRuleId } from "./passwordRules.js";

const prod = process.env.NODE_ENV === "production";

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "frame-src": ["'self'", "https:"],   // prototipos por link (Figma Make, sitios publicados) se muestran en un iframe
      "frame-ancestors": ["'none'"],
      "form-action": ["'self'"],
      "object-src": ["'none'"],
      "upgrade-insecure-requests": prod ? [] : null,
    },
  },
  hsts: prod ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  crossOriginEmbedderPolicy: false,
});

/**
 * Protección CSRF: toda petición que modifica datos debe traer el encabezado
 * X-Requested-With (los formularios de otros sitios no pueden enviarlo sin CORS)
 * y, si el navegador envía Origin, debe coincidir con nuestro host.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-requested-with") !== "redekorate") return next(new HttpError(403, "Solicitud no permitida"));
  const origin = req.get("origin");
  if (origin) {
    const host = req.get("x-forwarded-host") ?? req.get("host");
    try { if (new URL(origin).host !== host) return next(new HttpError(403, "Origen no permitido")); }
    catch { return next(new HttpError(403, "Origen no permitido")); }
  }
  next();
}

const limiter = (windowMin: number, limit: number, message: string) =>
  rateLimit({ windowMs: windowMin * 60_000, limit, standardHeaders: "draft-7", legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: translate(message, req.get("x-lang")) }) });

export const authLimiter = limiter(15, 20, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
export const resetLimiter = limiter(60, 5, "Demasiadas solicitudes de recuperación. Inténtalo más tarde.");
export const publicLimiter = limiter(1, 120, "Demasiadas solicitudes. Espera un momento.");
export const sessionCreateLimiter = limiter(60, Number(process.env.SESSIONS_PER_IP_HOUR ?? 300), "Límite de participaciones alcanzado desde esta red.");
export const uploadLimiter = limiter(10, 200, "Demasiadas subidas. Espera un momento.");
// Outside access (OAuth for MCP clients and the MCP endpoint itself).
export const registerLimiter = limiter(60, 30, "Demasiadas solicitudes. Espera un momento.");
export const oauthLimiter = limiter(1, 60, "Demasiadas solicitudes. Espera un momento.");

/** Who a bearer token belongs to (null when it is not valid). Cached briefly: it only picks the rate-limit bucket, the request itself is still checked. */
const owners = new Map<string, { user: string | null; until: number }>();
export async function tokenOwner(raw: string): Promise<string | null> {
  const key = createHash("sha256").update(raw).digest("hex");
  const hit = owners.get(key);
  if (hit && hit.until > Date.now()) return hit.user;
  const user = (await verifyBearer(raw))?.user.id ?? null;
  if (owners.size > 5000) owners.clear();
  owners.set(key, { user, until: Date.now() + 30_000 });
  return user;
}

/**
 * /mcp counts per account, not per address and not per token. Claude.ai and ChatGPT call from their own servers,
 * so a limit per address would be one limit shared by everybody; a limit per token would let someone multiply it
 * with more tokens. A valid token counts against its user, whichever of their tokens it is; no token or a token
 * that isn't valid counts against the address, so made-up tokens don't each get a fresh allowance.
 */
export const perAccount = (limit: number, ownerOf: (raw: string) => Promise<string | null> = tokenOwner) => rateLimit({
  windowMs: 60_000, limit, standardHeaders: "draft-7", legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: translate("Demasiadas solicitudes. Espera un momento.", req.get("x-lang")) }),
  keyGenerator: async (req) => {
    const token = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "")?.[1];
    const user = token ? await ownerOf(token) : null;
    return user ? `user:${user}` : ipKeyGenerator(req.ip ?? "");
  },
});
export const mcpLimiter = perAccount(240);

/** Password policy (passwordRules.ts, shared with the web app): the message for the first rule it breaks. */
export function passwordProblem(pw: string): string | null {
  const broken = brokenPasswordRule(pw);
  return broken ? PASSWORD_MESSAGES[broken] : null;
}
const PASSWORD_MESSAGES: Record<PasswordRuleId, string> = {
  length: "La contraseña debe tener al menos 10 caracteres",
  letters_and_digits: "La contraseña debe combinar letras y números",
  not_one_repeated_char: "La contraseña es demasiado simple",
};
