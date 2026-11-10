import type { TimedTaskBlock, TimedTaskValue } from "./types";
import { timedSummary, vsBenchmarkLabel } from "./timed";
import type { Answer } from "../lib/types";
import { formatDuration } from "../lib/hooks";
import { Stat, cx, toneFor } from "../components/ui";
import { t } from "../lib/i18n";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const MAX_BARS = 80;

/** Resultados de una tarea cronometrada: éxito, tiempos, comparación con la referencia y un tiempo por participante. */
export function TimedTaskResult({ block, answers }: { block: TimedTaskBlock; answers: Answer[] }) {
  const vals = answers.map((a) => a.value as TimedTaskValue | undefined);
  const s = timedSummary(vals, block.benchmarkSec);
  const bench = block.benchmarkSec ? block.benchmarkSec * 1000 : null;
  const rows = vals.filter((v): v is TimedTaskValue => !!v?.outcome).sort((a, b) => a.ms - b.ms);
  const shown = rows.slice(0, MAX_BARS);
  const maxMs = Math.max(1, ...shown.map((v) => v.ms), bench ?? 0);
  const x = (ms: number) => `${Math.min(100, (ms / maxMs) * 100)}%`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("Tasa de éxito")} value={`${pct(s.success, s.n)}%`} sub={t("{a} de {b}", { a: s.success, b: s.n })} tone={toneFor(pct(s.success, s.n), 80, 60, { n: s.n })} />
        <Stat label={t("Tiempo mediano")} value={formatDuration(s.median)} sub={s.times.length > 1 ? t("promedio {a} · entre {b} y {c}", { a: formatDuration(s.mean), b: formatDuration(s.min), c: formatDuration(s.max) }) : t("en tareas exitosas")} />
        {bench ? (
          <Stat label={t("vs. tiempo de referencia")} value={s.vsBenchmark === null ? "—" : vsBenchmarkLabel(s.vsBenchmark)}
            sub={t("referencia {a} · {b} de {c} dentro", { a: formatDuration(bench), b: s.onTime, c: s.success })}
            tone={s.vsBenchmark === null ? undefined : toneFor(s.vsBenchmark, 1.25, 2, { n: s.success, lowerIsBetter: true })} />
        ) : (
          <Stat label={t("Mitad central")} value={s.times.length > 1 ? `${formatDuration(s.p25)}–${formatDuration(s.p75)}` : "—"} sub={t("del percentil 25 al 75")} />
        )}
        <Stat label={t("No la completaron")} value={`${pct(s.gaveUp + s.timeout, s.n)}%`}
          sub={s.timeout ? t("{a} desistieron · {b} sin tiempo", { a: s.gaveUp, b: s.timeout }) : t("{a} de {b}", { a: s.gaveUp, b: s.n })}
          tone={toneFor(pct(s.gaveUp + s.timeout, s.n), 20, 40, { n: s.n, lowerIsBetter: true })} />
      </div>

      <div>
        <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
          {s.success > 0 && <div className="bg-good" style={{ flex: s.success }} title={t("Completó: {a}", { a: s.success })} />}
          {s.gaveUp > 0 && <div className="bg-bad/70" style={{ flex: s.gaveUp }} title={t("Desistió: {a}", { a: s.gaveUp })} />}
          {s.timeout > 0 && <div className="bg-warn/80" style={{ flex: s.timeout }} title={t("Sin tiempo: {a}", { a: s.timeout })} />}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-good" />{t("Completó")} {pct(s.success, s.n)}%</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-bad/70" />{t("Desistió")} {pct(s.gaveUp, s.n)}%</span>
          {(s.timeout > 0 || block.limitSec) && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warn/80" />{t("Se acabó el tiempo")} {pct(s.timeout, s.n)}%</span>}
        </div>
      </div>

      {/* Un tiempo por participante, de menor a mayor; la referencia y la mediana como líneas. */}
      {rows.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">{t("Tiempo por participante, de menor a mayor")}</p>
          <div className="relative space-y-[3px] pr-14">
            {bench && <span className="absolute top-0 bottom-0 z-10 border-l-2 border-dashed border-ink/50" style={{ left: `calc(${x(bench)} * (100% - 3.5rem) / 100%)` }} title={t("Referencia {a}", { a: formatDuration(bench) })} />}
            {s.times.length > 0 && <span className="absolute top-0 bottom-0 z-10 border-l-2 border-accent" style={{ left: `calc(${x(s.median)} * (100% - 3.5rem) / 100%)` }} title={t("Mediana {a}", { a: formatDuration(s.median) })} />}
            {shown.map((v, i) => (
              <div key={i} className="group relative flex h-[7px] items-center" title={`${formatDuration(v.ms)} · ${outcomeLabel(v.outcome)}`}>
                <div className={cx("h-full rounded-r-sm transition group-hover:opacity-80", v.outcome === "success" ? "bg-good/80" : v.outcome === "timeout" ? "bg-warn/70" : "bg-bad/60")} style={{ width: x(v.ms), minWidth: 3 }} />
                <span className="absolute -right-14 w-12 text-right text-[10px] tabular-nums text-ink-3 opacity-0 group-hover:opacity-100">{formatDuration(v.ms)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
            <span className="flex flex-wrap gap-4">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 border-l-2 border-accent" />{t("mediana")} {formatDuration(s.median)}</span>
              {bench && <span className="flex items-center gap-1.5"><span className="inline-block h-3 border-l-2 border-dashed border-ink/50" />{t("referencia")} {formatDuration(bench)}</span>}
            </span>
            {rows.length > MAX_BARS && <span>{t("… y {a} más (ver el CSV)", { a: rows.length - MAX_BARS })}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export const outcomeLabel = (o: TimedTaskValue["outcome"]) => (o === "success" ? t("Completó") : o === "timeout" ? t("Se acabó el tiempo") : t("No la completó"));
