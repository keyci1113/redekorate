import { Fragment, createContext, useContext, useState, type ReactNode } from "react";
import { EN } from "./en";

// Las cadenas se escriben en español en el código y se traducen con el diccionario EN.
// Si una cadena no está en el diccionario, se muestra tal cual (nunca rompe la interfaz).
export type Lang = "es" | "en";
const KEY = "rk_lang";

function initial(): Lang {
  try { const s = localStorage.getItem(KEY); if (s === "es" || s === "en") return s; } catch { /* sin storage */ }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

let current: Lang = initial();
export const getLang = () => current;

/** Traduce al idioma indicado, con variables {nombre}. */
export function tr(key: string, lang: Lang, vars?: Record<string, string | number | null | undefined>): string {
  let s = lang === "en" ? EN[key] ?? key : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
  return s;
}
/** Traduce al idioma de la interfaz. */
export const t = (key: string, vars?: Record<string, string | number | null | undefined>) => tr(key, current, vars);

// Idioma del CONTENIDO (textos predeterminados de bloques y plantillas que verán los participantes).
let contentLang: Lang = current;
export const setContentLang = (l: Lang) => { contentLang = l; };
export const getContentLang = () => contentLang;
export const tc = (key: string, vars?: Record<string, string | number | null | undefined>) => tr(key, contentLang, vars);

/** Fechas y números con el formato del idioma activo. */
export const locale = () => (current === "en" ? "en-US" : "es");

/** Número con separadores del idioma activo. */
export const fmtNum = (n: number) => new Intl.NumberFormat(locale()).format(n);
/** Proporción 0–1 como porcentaje del idioma activo ("87 %" en es, "87%" en en). */
export const fmtPct = (r: number) => new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(r);

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
/**
 * Plural con Intl.PluralRules. Cada forma es una clave traducible que recibe {n} ya formateado:
 * plural(3, { one: "{n} respuesta", other: "{n} respuestas" }).
 */
export function plural(n: number, forms: PluralForms, vars?: Record<string, string | number | null | undefined>) {
  const rule = new Intl.PluralRules(locale()).select(n);
  return t(forms[rule] ?? forms.other, { n: fmtNum(n), ...vars });
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
/** Tiempo relativo con Intl.RelativeTimeFormat ("hace 20 min", "20 min ago"). */
export function relTime(iso: string | number | Date, now = Date.now()) {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const f = new Intl.RelativeTimeFormat(locale(), { numeric: "auto", style: "short" });
  for (const [unit, secs] of UNITS) if (Math.abs(diff) >= secs) return f.format(Math.round(diff / secs), unit);
  return f.format(0, "second");
}

interface Ctx { lang: Lang; setLang: (l: Lang, persist?: boolean) => void }
const LangCtx = createContext<Ctx>({ lang: current, setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setState] = useState<Lang>(current);
  const setLang = (l: Lang, persist = true) => {
    current = l; contentLang = l;
    document.documentElement.lang = l;
    if (persist) { try { localStorage.setItem(KEY, l); } catch { /* */ } }
    setState(l);
  };
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  // Al cambiar de idioma se vuelve a montar la app para que todos los textos se recalculen.
  return <LangCtx.Provider value={{ lang, setLang }}><Fragment key={lang}>{children}</Fragment></LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`inline-flex rounded-lg bg-ink/5 p-0.5 text-xs font-semibold ${className}`} role="group" aria-label="Idioma / Language">
      {(["es", "en"] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`rounded-md px-2 py-1 uppercase transition ${lang === l ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}>{l}</button>
      ))}
    </div>
  );
}
