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
