import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { HttpError } from "./http.js";
import { translate } from "./i18n.js";

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

/** Política de contraseñas: mínimo 10 caracteres, con letras y números. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "La contraseña debe tener al menos 10 caracteres";
  if (!/[A-Za-zÀ-ÿ]/.test(pw) || !/\d/.test(pw)) return "La contraseña debe combinar letras y números";
  if (/^(.)\1+$/.test(pw)) return "La contraseña es demasiado simple";
  return null;
}
