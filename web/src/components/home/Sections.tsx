import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Check, PenLine } from "lucide-react";
import type { RecentStudy } from "../../lib/recent";
import { fmtNum, fmtPct, locale, plural, relTime, t } from "../../lib/i18n";
import { aggregateCompletion, completion, groupActivity, isLowCompletion, peakDay, sortInsights, splitWeeks, type Day } from "../../lib/home";
import { familyColor, familyOf } from "../../lib/families";
import { templateByKey } from "../../templates/catalog";
import { SeverityBadge, cx } from "../ui";
import { CompletionBar, LowChip, Section, SectionState, TrendBars, completionSr, fmtDay } from "./bits";
import type { Dash, Draft, HomeInsight, Load, RecentOpen } from "./types";

const methodName = (m: string) => templateByKey(m)?.name ?? m;
const longDay = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });

// ── Encabezado ──────────────────────────────────────────────────────
function greeting(hour: number) {
  if (hour < 12) return "Buenos días, {a}";
  if (hour < 19) return "Buenas tardes, {a}";
  return "Buenas noches, {a}";
}

export function HomeHeader({ name, draft, loading }: { name: string; draft: Draft | undefined; loading: boolean }) {
  const now = new Date();
  const today = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-ink-2 first-letter:uppercase"><time dateTime={now.toISOString().slice(0, 10)}>{today}</time></p>
        <h1 className="page-title mt-1">{t(greeting(now.getHours()), { a: name })}</h1>
      </div>
      {loading ? <div className="h-[4.5rem] w-full animate-pulse rounded-xl bg-ink/5 motion-reduce:animate-none md:w-80" aria-hidden />
        : draft && (
          <Link to={`/studies/${draft.id}/edit`} className="press focus-ring group flex min-h-11 w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:border-line-2 md:w-80">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink"><PenLine size={18} aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-ink-2">{t("Continuar borrador")}</span>
              <span className="block truncate text-sm font-semibold">{draft.title}</span>
              <span className="block text-xs text-ink-2">{t("Editado {a}", { a: relTime(draft.updated_at) })}</span>
            </span>
            <ArrowRight size={16} aria-hidden className="shrink-0 text-accent" />
          </Link>
        )}
    </header>
  );
}

// ── Último estudio abierto ──────────────────────────────────────────
export function LastOpened({ recent }: { recent: RecentStudy | RecentOpen }) {
  const tpl = templateByKey(recent.method);
  const at = "opened_at" in recent ? recent.opened_at : recent.at;
  const color = "project_color" in recent ? recent.project_color : undefined;
  return (
    <section aria-label={t("Último estudio abierto")} className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-2">{t("Retoma donde lo dejaste")} · {t(recent.where === "edit" ? "estabas editando" : "veías resultados")} {relTime(at)}</p>
        <p className="mt-0.5 truncate text-[1.0625rem] font-semibold">{recent.title}</p>
        <p className="flex items-center gap-1.5 truncate text-sm text-ink-2">{color && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />}{tpl?.name ?? recent.method}{recent.project_name ? ` · ${recent.project_name}` : ""}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link to={`/studies/${recent.id}/edit`} className="press focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium hover:border-line-2"><PenLine size={15} aria-hidden /> {t("Editar")}</Link>
        <Link to={`/studies/${recent.id}/results`} className="press focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-on-accent"><BarChart3 size={15} aria-hidden /> {t("Resultados")}</Link>
      </div>
    </section>
  );
}

// ── Resumen del día (plantilla con datos reales) ────────────────────
export function DaySummary({ data, load }: { data: Dash | null; load: Load }) {
  if (load.loading) return <div className="h-14 animate-pulse rounded-xl bg-ink/5 motion-reduce:animate-none" aria-hidden />;
  if (load.error || !data) return null;
  const { thisWeek } = splitWeeks(data.trend);
  const peak = peakDay(data.trend.slice(-7));
  const top = [...data.live].filter((s) => s.responses > 0).sort((a, b) => b.responses - a.responses)[0];
  const parts: string[] = [];
  parts.push(thisWeek === 0
    ? t("Esta semana no han llegado respuestas.")
    : plural(thisWeek, { one: "Esta semana llegó {n} respuesta", other: "Esta semana llegaron {n} respuestas" })
      + (peak ? t(", con el pico el {a} ({b}).", { a: longDay(peak.day), b: fmtNum(peak.n) }) : "."));
  if (top) {
    const rate = completion(top.responses, top.started);
    parts.push(t("«{a}» es el estudio con más respuestas ({b}) y un completado de {c}.", { a: top.title, b: fmtNum(top.responses), c: rate === null ? "—" : fmtPct(rate) }));
  }
  const pending = data.insight_counts.critical_pending;
  parts.push(pending === 0
    ? t("No tienes insights críticos sin revisar.")
    : plural(pending, { one: "Tienes {n} insight crítico sin revisar.", other: "Tienes {n} insights críticos sin revisar." }));
  return (
    <section aria-label={t("Resumen del día")} className="rounded-xl border border-line bg-surface px-4 py-3.5 sm:px-5">
      <p className="text-[0.9375rem] leading-relaxed text-ink">{parts.join(" ")}</p>
    </section>
  );
}

// ── KPIs ────────────────────────────────────────────────────────────
function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 font-display text-[2rem] leading-tight font-bold tabular-nums">{value}</p>
      <div className="mt-auto pt-3 text-xs text-ink-2">{children}</div>
    </div>
  );
}

export function KpiRow({ data, load }: { data: Dash | null; load: Load }) {
  if (load.loading) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-ink/5 motion-reduce:animate-none" />)}</div>;
  if (load.error || !data) return null;
  const { totals, trend, live, insight_counts: ic } = data;
  const { thisWeek, lastWeek } = splitWeeks(trend);
  const peak = peakDay(trend);
  const agg = aggregateCompletion(live);
  const liveShare = totals.studies ? totals.live / totals.studies : 0;
  return (
    <section aria-label={t("Indicadores")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label={t("Respuestas esta semana")} value={fmtNum(thisWeek)}>
        <TrendBars days={trend as Day[]} height={40} summary={t("Esta semana {a} respuestas; la semana pasada {b}.", { a: fmtNum(thisWeek), b: fmtNum(lastWeek) })} />
        <p className="mt-2 tabular-nums">
          {t("{a} en total", { a: fmtNum(totals.responses) })}
          {peak && <> · {t("Pico: {a} el {b}", { a: fmtNum(peak.n), b: fmtDay(peak.day) })}</>}
        </p>
      </Kpi>
      <Kpi label={t("Estudios activos")} value={t("{a} de {b}", { a: fmtNum(totals.live), b: fmtNum(totals.studies) })}>
        <span className="block h-2 overflow-hidden rounded-full bg-ink/10" aria-hidden><span className="block h-full rounded-full bg-accent" style={{ width: `${liveShare * 100}%` }} /></span>
        <p className="mt-2">{plural(totals.projects_live, { one: "En {n} proyecto", other: "En {n} proyectos" })}</p>
      </Kpi>
      <Kpi label={t("Tasa de completado promedio")} value={agg.rate === null ? "—" : fmtPct(agg.rate)}>
        <span className="flex items-center gap-2"><span className="w-full"><CompletionBar rate={agg.rate} /></span>{isLowCompletion(agg.rate) && <LowChip />}</span>
        <span className="sr-only">{completionSr(agg.rate)}</span>
        <p className="mt-2 tabular-nums">
          {plural(agg.done, { one: "{n} terminó", other: "{n} terminaron" })} {plural(agg.started, { one: "de {n} que inició", other: "de {n} que iniciaron" })}
        </p>
      </Kpi>
      <Kpi label={t("Insights")} value={fmtNum(ic.total)}>
        <span className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-bad-soft px-2 py-0.5 font-semibold text-bad">{plural(ic.critical, { one: "{n} crítico", other: "{n} críticos" })}</span>
          <span className="rounded-full bg-caution-soft px-2 py-0.5 font-semibold text-caution-ink">{plural(ic.high, { one: "{n} alto", other: "{n} altos" })}</span>
        </span>
      </Kpi>
    </section>
  );
}

// ── Insights recientes ──────────────────────────────────────────────
export function RecentInsights({ insights, load, firstLive, onReview }: { insights: HomeInsight[]; load: Load; firstLive?: string; onReview: (id: string, reviewed: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (i: HomeInsight) => { setBusy(i.id); try { await onReview(i.id, !i.reviewed_at); } finally { setBusy(null); } };
  return (
    <Section id="recent-insights" title={t("Insights recientes")}>
      <SectionState load={load} empty={insights.length === 0 ? {
        title: t("Todavía no hay insights"),
        text: t("Registra hallazgos desde los resultados de cada estudio."),
        action: <Link to={firstLive ? `/studies/${firstLive}/results?tab=insights` : "/projects"} className="press focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium">{t("Registrar un insight")}</Link>,
      } : null}>
        <ul className="divide-y divide-line">
          {sortInsights(insights).map((i) => {
            const reviewed = !!i.reviewed_at;
            return (
              <li key={i.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={i.severity} />{reviewed && <span className="text-xs text-good">{t("Revisado")}</span>}</div>
                  <Link to={`/projects/${i.project_id}?tab=insights`} className={cx("focus-ring mt-1 block rounded text-sm font-medium hover:underline", reviewed && "text-ink-2")}>{i.title}</Link>
                  <p className="mt-0.5 truncate text-xs text-ink-2">{i.project_name}{i.method ? ` · ${methodName(i.method)}` : ""}</p>
                </div>
                <button type="button" aria-pressed={reviewed} disabled={busy === i.id} onClick={() => toggle(i)}
                  title={reviewed ? t("Marcar como pendiente") : t("Marcar como revisado")}
                  className={cx("focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border", reviewed ? "border-good/40 bg-good-soft text-good" : "border-line text-ink-2 hover:border-line-2 hover:text-ink")}>
                  <Check size={18} aria-hidden />
                  <span className="sr-only">{reviewed ? t("Revisado. Marcar como pendiente") : t("Marcar como revisado")}: {i.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </SectionState>
    </Section>
  );
}

// ── Actividad reciente ──────────────────────────────────────────────
export function ActivityFeed({ data, load }: { data: Dash | null; load: Load }) {
  const groups = data ? groupActivity(data.activity) : [];
  const firstLive = data?.live[0]?.id;
  return (
    <Section id="recent-activity" title={t("Actividad reciente")}>
      <SectionState load={load} empty={groups.length === 0 ? {
        title: t("Sin respuestas en los últimos 7 días"),
        text: t("Comparte el link de un estudio activo para empezar a recibir respuestas."),
        action: <Link to={firstLive ? `/studies/${firstLive}/results` : "/projects"} className="press focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium">{firstLive ? t("Compartir un estudio") : t("Ir a proyectos")}</Link>,
      } : null}>
        <ul className="divide-y divide-line">
          {groups.map((g) => (
            <li key={g.study_id}>
              <Link to={`/studies/${g.study_id}/results`} className="focus-ring flex min-h-11 items-center gap-3 px-4 py-3 hover:bg-ink/[0.03] sm:px-5">
                <span className="w-11 shrink-0 rounded-md bg-accent-soft py-1 text-center text-sm font-semibold text-accent-ink tabular-nums">+{fmtNum(g.count)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: familyColor(familyOf(g.method)) }} aria-hidden /><span className="truncate">{g.study_title}</span></span>
                  <span className="block text-xs text-ink-2">{plural(g.count, { one: "{n} respuesta nueva", other: "{n} respuestas nuevas" })} · {relTime(g.latest)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionState>
    </Section>
  );
}
