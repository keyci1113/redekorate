import { locale, t } from "./i18n";
import { useCallback, useEffect, useState } from "react";

/** Carga datos de la API con estado de carga/error y función para recargar. */
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
