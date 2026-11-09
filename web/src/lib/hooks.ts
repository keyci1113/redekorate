import type React from "react";
import { locale, t } from "./i18n";
import { useCallback, useEffect, useState } from "react";

/** Carga datos de la API con estado de carga/error y función para recargar. */
/**
 * Ancho de un panel que el usuario puede arrastrar. Se guarda en el navegador (solo una comodidad: si falla, vuelve al valor por defecto).
 * `side` indica de qué lado está el panel respecto al asa: un panel izquierdo crece al arrastrar a la derecha, uno derecho al revés.
 */
export function usePaneWidth(key: string, initial: number, min: number, max: number, side: "left" | "right") {
  const clamp = (w: number) => Math.min(max, Math.max(min, Math.round(w)));
  const [width, setWidth] = useState(() => { try { const v = Number(localStorage.getItem(`pane:${key}`)); return v ? clamp(v) : initial; } catch { return initial; } });
  const set = (w: number) => { const c = clamp(w); setWidth(c); try { localStorage.setItem(`pane:${key}`, String(c)); } catch { /* sin almacenamiento */ } };
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX, startW = width, dir = side === "left" ? 1 : -1;
    const move = (ev: PointerEvent) => set(startW + dir * (ev.clientX - startX));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.cursor = ""; };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft") { e.preventDefault(); set(width + (side === "left" ? -step : step)); }
    if (e.key === "ArrowRight") { e.preventDefault(); set(width + (side === "left" ? step : -step)); }
    if (e.key === "Home") { e.preventDefault(); set(initial); }
  };
  /** Props del asa: un separador vertical accesible. */
  const handleProps = {
    role: "separator" as const, "aria-orientation": "vertical" as const, "aria-valuenow": width, "aria-valuemin": min, "aria-valuemax": max, tabIndex: 0,
    onPointerDown, onKeyDown, onDoubleClick: () => set(initial),
  };
  return { width, handleProps };
}

/** Preferencia booleana guardada en el navegador (solo comodidad de quien edita). */
export function usePref(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(`pref:${key}`); return s === null ? initial : s === "1"; } catch { return initial; } });
  return [v, (n) => { setV(n); try { localStorage.setItem(`pref:${key}`, n ? "1" : "0"); } catch { /* sin almacenamiento */ } }];
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    return fn().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { data, setData, error, loading, reload: load };
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t("hace un momento");
  if (s < 3600) return t("hace {n} min", { n: Math.floor(s / 60) });
  if (s < 86400) return t("hace {n} h", { n: Math.floor(s / 3600) });
  if (s < 86400 * 30) return t("hace {n} d", { n: Math.floor(s / 86400) });
  return new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}

export function formatDuration(ms: number) {
  if (!isFinite(ms) || ms <= 0) return "—";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim();
}

export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
