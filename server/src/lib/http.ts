import type { Request, Response, NextFunction } from "express";
import { ZodError, type ZodType } from "zod";
import { translate } from "./i18n.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound = (what = "Recurso") => new HttpError(404, `${what} no encontrado`);

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const L = (m: string) => translate(m, req.get("x-lang"));
  if (err instanceof HttpError) return res.status(err.status).json({ error: L(err.message) });
  if (err instanceof ZodError) return res.status(400).json({ error: L("Datos inválidos"), issues: err.issues });
  const code = (err as { code?: string })?.code;
  if (code === "22P02") return res.status(404).json({ error: L("Recurso no encontrado") }); // id con formato inválido
  if ((err as { type?: string })?.type === "entity.too.large") return res.status(413).json({ error: L("Contenido demasiado grande") });
  if ((err as { type?: string })?.type === "entity.parse.failed") return res.status(400).json({ error: L("JSON inválido") });
  console.error(err);
  res.status(500).json({ error: L("Error interno del servidor") });
}
