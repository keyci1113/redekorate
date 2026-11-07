import type { ReactNode } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { fmtPct, locale, t } from "../../lib/i18n";
import { COMPLETION_THRESHOLD, isLowCompletion, type Day } from "../../lib/home";
import { cx } from "../ui";
import type { Load } from "./types";

/** Tarjeta de sección con título y acciones a la derecha. */
export function Section({ title, id, actions, children, className }: { title: string; id: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cx("min-w-0 rounded-xl border border-line bg-surface", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 id={id} className="text-base font-semibold">{title}</h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Carga, error con reintento o vacío con una acción. Si no aplica ninguno, muestra el contenido. */
export function SectionState({ load, empty, skeleton = 3, children }: {
  load: Load; empty?: { title: string; text?: string; action?: ReactNode } | null; skeleton?: number; children: ReactNode;
}) {
  if (load.loading) {
    return (
      <div className="space-y-3 p-4 sm:p-5" aria-busy="true" aria-label={t("Cargando…")}>
        {Array.from({ length: skeleton }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-ink/5 motion-reduce:animate-none" />)}
      </div>
    );
  }
  if (load.error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm text-bad"><TriangleAlert size={16} aria-hidden />{t("No se pudo cargar esta sección.")}</p>
        <button type="button" onClick={load.reload} className="press focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium hover:border-line-2">
          <RotateCw size={15} aria-hidden />{t("Reintentar")}
        </button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex flex-col items-start gap-3 p-4 sm:p-5">
        <div>
          <p className="font-semibold">{empty.title}</p>
          {empty.text && <p className="mt-1 text-sm text-ink-2">{empty.text}</p>}
        </div>
        {empty.action}
      </div>
    );
  }
  return <>{children}</>;
}

/** Chip con punto de color (tipo de método, proyecto). */
export function Chip({ color, children, className }: { color?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-medium text-ink-2", className)}>
      {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Chip "Bajo": ícono + texto, nunca solo color. */
export function LowChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-caution-soft px-2 py-0.5 text-xs font-semibold text-caution-ink">
      <TriangleAlert size={12} aria-hidden />{t("Bajo")}
    </span>
  );
}

/** Texto para lectores de pantalla sobre el completado. */
export function completionSr(rate: number | null) {
  if (rate === null) return t("Sin participantes todavía");
  return isLowCompletion(rate)
    ? t("{a} completado, por debajo de {b}", { a: fmtPct(rate), b: fmtPct(COMPLETION_THRESHOLD) })
    : t("{a} completado", { a: fmtPct(rate) });
}

/** Barra de completado: naranja si está por debajo del umbral. */
export function CompletionBar({ rate }: { rate: number | null }) {
  const low = isLowCompletion(rate);
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-ink/10" aria-hidden>
      {rate !== null && <span className={cx("block h-full rounded-full", low ? "bg-caution" : "bg-accent")} style={{ width: `${Math.max(rate * 100, 2)}%` }} />}
    </span>
  );
}

/** Anillo de completado. */
export function Ring({ rate, size = 96 }: { rate: number | null; size?: number }) {
  const r = 42, c = 2 * Math.PI * r, low = isLowCompletion(rate);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={completionSr(rate)} className="shrink-0">
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-ink/10" />
      {rate !== null && (
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" strokeLinecap="round" transform="rotate(-90 50 50)"
          strokeDasharray={`${c * rate} ${c}`} className={low ? "stroke-caution" : "stroke-accent"} />
      )}
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="fill-ink font-display text-[1.25rem] font-bold tabular-nums">
        {rate === null ? "—" : fmtPct(rate)}
      </text>
    </svg>
  );
}

const fmtDay = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(locale(), { day: "numeric", month: "short" });

/** Barras de 14 días: los 7 primeros son la semana pasada y los 7 últimos esta semana. */
export function TrendBars({ days, height = 64, legend = true, summary }: { days: Day[]; height?: number; legend?: boolean; summary: string }) {
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <div>
      <p className="sr-only">{summary}</p>
      <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden>
        {days.map((d, i) => (
          <div key={d.day} className="flex h-full flex-1 items-end" title={`${fmtDay(d.day)}: ${d.n}`}>
            <div className={cx("w-full rounded-t-[3px]", i < days.length - 7 ? "bg-ink-3" : "bg-accent")} style={{ height: d.n ? `${Math.max(6, (d.n / max) * 100)}%` : 2, opacity: d.n ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      {legend && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2" aria-hidden>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ink-3" />{t("Semana pasada")}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" />{t("Esta semana")}</span>
          </span>
          <span className="tabular-nums">{fmtDay(days[0].day)} – {fmtDay(days[days.length - 1].day)}</span>
        </div>
      )}
    </div>
  );
}

export { fmtDay };
