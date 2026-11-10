import type { TimedTaskValue } from "./types";
import { mean, median } from "../lib/analytics";

/** Percentil p (0–1) por interpolación lineal; 0 sin datos. */
export function percentile(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export interface TimedSummary {
  n: number; success: number; gaveUp: number; timeout: number;
  /** Tiempos (ms) de las tareas completadas, en orden ascendente. */
  times: number[];
  median: number; mean: number; p25: number; p75: number; min: number; max: number;
  /** Mediana ÷ referencia (1 = igual, 1.5 = 50 % más lento); null sin referencia o sin éxitos. */
  vsBenchmark: number | null;
  /** Tareas completadas dentro del tiempo de referencia. */
  onTime: number;
}

/** Resume un bloque de tarea cronometrada. Solo cuentan los tiempos de quienes la completaron. */
export function timedSummary(values: (TimedTaskValue | undefined)[], benchmarkSec: number | null | undefined): TimedSummary {
  const vals = values.filter((v): v is TimedTaskValue => !!v && typeof v.ms === "number" && !!v.outcome);
  const ok = vals.filter((v) => v.outcome === "success");
  const times = ok.map((v) => v.ms).sort((a, b) => a - b);
  const med = median(times);
  const bench = benchmarkSec && benchmarkSec > 0 ? benchmarkSec * 1000 : null;
  return {
    n: vals.length, success: ok.length,
    gaveUp: vals.filter((v) => v.outcome === "gave_up").length,
    timeout: vals.filter((v) => v.outcome === "timeout").length,
    times, median: med, mean: mean(times), p25: percentile(times, 0.25), p75: percentile(times, 0.75),
    min: times[0] ?? 0, max: times[times.length - 1] ?? 0,
    vsBenchmark: bench && times.length ? med / bench : null,
    onTime: bench ? times.filter((ms) => ms <= bench).length : 0,
  };
}

/** Diferencia contra la referencia en texto: "+35 %" (más lento) o "−20 %" (más rápido). */
export function vsBenchmarkLabel(ratio: number) {
  const d = Math.round((ratio - 1) * 100);
  return d === 0 ? "±0 %" : `${d > 0 ? "+" : "−"}${Math.abs(d)} %`;
}

/** Cronómetro para el participante: m:ss, o solo segundos bajo un minuto. */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
