// Dashboards across projects: studies, tickets and projects. The project and period filters live in the URL.
// Tiles, bars and columns open a detail modal with the items behind the number (dashboards/drill.ts).
import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { fmtNum, fmtPct, locale, plural, relTime, t } from "../lib/i18n";
import type { Severity } from "../lib/types";
import { Avatar } from "../components/Avatar";
import { Button, ErrorNote, SeverityBadge, cx } from "../components/ui";
import { templateByKey } from "../templates/catalog";
import { STATUSES, TYPES, isoDay } from "../tickets/model";
import { Skeleton, StatusChip, TypeChip, fmtDay, priorityLabel, statusLabel, typeLabel } from "../tickets/parts";
import { BarList, Columns, EmptyNote, Flag, Panel, Tile } from "../dashboards/charts";
import {
  PERIODS, completion, daysSince, delta, dueText, filterQuery, peak, percent, readFilters, weeksBehind,
  type DashFilters, type Health, type MilestoneRow, type MilestoneState, type Period, type ProjectOption, type ProjectsDash, type StudiesDash, type TicketsDash,
} from "../dashboards/model";

import { DashboardsNav, dashPath, type DashTab } from "../dashboards/DashboardsNav";
import { DrillModal } from "../dashboards/DrillModal";
import { liveStudiesFor, milestonesFor, projectsFor, type Drill, type DrillRow } from "../dashboards/drill";
import { useAuth } from "../lib/auth";
import { loadView, saveView, type HomeView } from "../lib/home";
import { LiveStudies } from "../components/home/LiveStudies";
import type { Dash } from "../components/home/types";
export type { DashTab };
const periodLabel = (p: Period) => ({ "7": t("Últimos 7 días"), "30": t("Últimos 30 días"), "90": t("Últimos 90 días"), quarter: t("Este trimestre") })[p];
const dayLabel = (iso: string) => fmtDay(iso);
/** A completion share rounded down, so a study just under the threshold never reads as having reached it. */
const pctDown = (share: number) => fmtPct(Math.floor(share * 100) / 100);

export function DashboardsPage({ tab }: { tab: DashTab }) {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const q = filterQuery(filters);
  const setFilters = (f: Partial<DashFilters>) => setParams(new URLSearchParams(filterQuery({ ...filters, ...f }).slice(1)), { replace: true });
  const load = useLoad(() => api.get<StudiesDash | TicketsDash | ProjectsDash>(`/dashboards/${tab}${q}`), [tab, q]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const today = new Intl.DateTimeFormat(locale(), { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const select = "focus-ring min-h-11 rounded-[10px] border border-line-2 bg-surface px-3 text-[13px] font-semibold text-ink";

  return (
    <div className="page flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div>
          <p className="text-[13px] text-ink-3 first-letter:uppercase">{today}</p>
          <h1 className="page-title mt-1">{t("Dashboards")}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DashboardsNav current={tab} query={q} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-ink-3">{t("Proyecto")}
              <select className={cx(select, "max-w-56")} value={filters.project ?? ""} onChange={(e) => setFilters({ project: e.target.value || null })}>
                <option value="">{t("Todos los proyectos")}</option>
                {(load.data?.projects ?? ([] as ProjectOption[])).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            {tab !== "projects" && (
              <label className="flex items-center gap-2 text-[13px] text-ink-3">{t("Periodo")}
                <select className={select} value={filters.period} onChange={(e) => setFilters({ period: e.target.value as Period })}>
                  {PERIODS.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
      </section>

      {load.error && !load.data ? <div className="space-y-3"><ErrorNote>{load.error}</ErrorNote><Button onClick={() => load.reload()}>{t("Reintentar")}</Button></div>
        : !load.data ? <Loading />
        : tab === "studies" ? <Studies d={load.data as StudiesDash} q={q} project={filters.project} open={setDrill} />
        : tab === "tickets" ? <Tickets d={load.data as TicketsDash} filters={filters} open={setDrill} />
        : <Projects d={load.data as ProjectsDash} q={q} open={setDrill} />}
      <DrillModal drill={drill} filters={filters} onClose={() => setDrill(null)} />
    </div>
  );
}

type Open = (d: Drill) => void;
const Tiles = ({ children }: { children: ReactNode }) => <section aria-label={t("Cifras clave")} className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">{children}</section>;
const Grid = ({ children }: { children: ReactNode }) => <div className="grid items-start gap-4 lg:grid-cols-2">{children}</div>;
const Rows = ({ children }: { children: ReactNode }) => <ul className="flex flex-col divide-y divide-line/60">{children}</ul>;
function RowLink({ to, title, sub, end }: { to: string; title: ReactNode; sub: ReactNode; end?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <Link to={to} className="focus-ring min-w-0 flex-1 rounded">
        <span className="block truncate text-sm font-semibold hover:underline">{title}</span>
        <span className="block truncate text-xs text-ink-3">{sub}</span>
      </Link>
      {end && <span className="shrink-0 text-[13px] font-semibold tabular-nums">{end}</span>}
    </li>
  );
}
function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={t("Cargando dashboard")}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-64" /><div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
    </div>
  );
}

// ── Studies ─────────────────────────────────────────────────────
/**
 * The Home's live-studies list (Snapshot / Funnel / Inline views) on the Studies dashboard, so per-study
 * responses and results stay one click away. It reads the Home's /dashboard data and shares its saved view.
 */
function LiveResponses({ project }: { project: string | null }) {
  const { user } = useAuth();
  const uid = user?.id ?? "anon";
  const { data, error, loading, reload } = useLoad(() => api.get<Dash>("/dashboard"), []);
  const [view, setView] = useState<HomeView>(() => loadView(uid));
  const live = (data?.live ?? []).filter((s) => !project || s.project_id === project);
  return (
    <LiveStudies live={live} trend={data?.trend ?? []} studyTrend={data?.study_trend ?? []} limit={10}
      load={{ loading: loading && !data, error: data ? null : error, reload }}
      view={view} onViewChange={(v) => { setView(v); saveView(uid, v); }} />
  );
}

function Studies({ d, q, project, open }: { d: StudiesDash; q: string; project: string | null; open: Open }) {
  const x = d.totals, now = Date.now();
  const top = peak(d.series);
  // Which studies need attention is decided once, on the server (studyAttention), for this list, the flags and project health.
  const flagged = d.live.filter((s) => s.attention).map((s) => ({ s, why: s.attention }));
  const byCompletion = d.live.filter((s) => s.started >= d.min_started).sort((a, b) => completion(b) - completion(a));
  const low = fmtPct(d.low_completion);
  const severities: [Severity, string][] = [["critical", t("Crítica")], ["high", t("Alta")], ["medium", t("Media")], ["low", t("Baja")]];
  const points = d.series.map((p) => ({ label: dayLabel(p.day), values: [p.n] }));
  const liveRows = (which: "all" | "attention" | "by_completion"): DrillRow[] => liveStudiesFor(d.live, which, d.min_started).map((s) => {
    const why = s.attention;
    return {
      key: s.id, to: `/studies/${s.id}/results`, title: s.title, sub: `${s.project_name} · ${t("{a} de {b} terminaron", { a: s.finished, b: s.started })}`,
      ...(which === "by_completion" ? { end: pctDown(completion(s)), tone: completion(s) < d.low_completion ? "warn" as const : undefined }
        : why ? { end: why === "low_completion" ? t("Completado bajo") : t("Sin respuestas recientes"), tone: "warn" as const } : {}),
    };
  });
  return (
    <>
      <Tiles>
        <Tile label={t("Respuestas")} value={fmtNum(x.responses_period)} tone={x.responses_period >= x.responses_prev_period ? "good" : "bad"}
          onOpen={() => open({ kind: "studies", title: t("Respuestas · {a}", { a: periodLabel(d.period) }), by: "responses_period" })}
          change={{ delta: delta(x.responses_period, x.responses_prev_period), text: t("{n} vs. el periodo anterior", { n: fmtNum(Math.abs(x.responses_period - x.responses_prev_period)) }) }}
          sub={periodLabel(d.period)} />
        <Tile label={t("Estudios activos")} value={fmtNum(x.live)} suffix={t("de {n}", { n: fmtNum(x.studies) })} sub={plural(flagged.length, { one: "{n} necesita atención", other: "{n} necesitan atención" })}
          onOpen={() => open({ kind: "rows", title: t("Estudios activos"), rows: liveRows("all"), empty: t("No hay estudios activos."), note: t("Primero los que necesitan atención.") })} />
        <Tile label={t("Completado promedio")} value={x.started ? fmtPct(x.finished / x.started) : "—"} sub={t("{a} de {b} sesiones terminaron, en los estudios activos desde su lanzamiento", { a: fmtNum(x.finished), b: fmtNum(x.started) })}
          onOpen={() => open({ kind: "rows", title: t("Completado por estudio activo"), rows: liveRows("by_completion"), empty: t("Aún no hay suficientes respuestas para medir el completado."), note: t("Del más bajo al más alto.") })} />
        <Tile label={t("Insights nuevos")} value={fmtNum(x.insights)} sub={`${plural(x.insights_critical, { one: "{n} crítico", other: "{n} críticos" })} · ${plural(x.insights_high, { one: "{n} alto", other: "{n} altos" })}`}
          onOpen={() => open({ kind: "studies", title: t("Insights nuevos"), by: "insights" })} />
        <Tile label={t("Participantes")} value={fmtNum(x.participants)} tone={x.participants >= x.participants_prev ? "good" : "bad"}
          onOpen={() => open({ kind: "studies", title: t("Participantes por estudio"), by: "participants" })}
          change={{ delta: delta(x.participants, x.participants_prev), text: t("{n} vs. el periodo anterior", { n: fmtNum(Math.abs(x.participants - x.participants_prev)) }) }}
          sub={t("Sesiones iniciadas en este periodo, en todos los estudios")} />
      </Tiles>

      <Panel title={d.bucket === "day" ? t("Respuestas por día") : t("Respuestas por semana")} link={{ to: "/studies", text: t("Todos los estudios activos") }}
        note={top ? t("Máximo de {a} el {b}.", { a: fmtNum(top.n), b: dayLabel(top.day) }) : undefined}>
        {points.some((p) => p.values[0] > 0)
          ? <Columns points={points} series={[t("Respuestas")]} caption={t("Respuestas completadas, del {a} al {b}.", { a: points[0]?.label ?? "", b: points[points.length - 1]?.label ?? "" })}
              onOpen={(i) => open({ kind: "studies", by: "day", value: d.series[i].day, bucket: d.bucket, title: d.bucket === "day" ? t("Respuestas del {a}", { a: points[i].label }) : t("Respuestas de la semana del {a}", { a: points[i].label }) })} />
          : <EmptyNote>{t("Sin respuestas en este periodo.")}</EmptyNote>}
      </Panel>

      <LiveResponses project={project} />

      <Grid>
        <Panel title={t("Estudios por método")}>
          {d.methods.length ? <BarList labelWidth={190} rows={d.methods.slice(0, 10).map((m) => ({ key: m.method, name: templateByKey(m.method)?.name ?? m.method, label: templateByKey(m.method)?.name ?? m.method, value: m.n,
            onOpen: () => open({ kind: "studies", by: "method", value: m.method, title: templateByKey(m.method)?.name ?? m.method }) }))} /> : <EmptyNote>{t("Aún no hay estudios.")}</EmptyNote>}
        </Panel>
        <Panel title={t("Necesitan atención")} note={t("Completado (quienes terminaron de los que iniciaron) menor a {a} con al menos {b} sesiones, o sin respuestas en 48 horas.", { a: low, b: d.min_started })}>
          {flagged.length ? (<>
            <Rows>
              {flagged.slice(0, 6).map(({ s, why }) => (
                <RowLink key={s.id} to={`/studies/${s.id}/results`} title={s.title}
                  sub={why === "low_completion" ? `${s.project_name} · ${t("{a} de {b} terminaron", { a: s.finished, b: s.started })}` : `${s.project_name} · ${s.last_response_at ? t("última respuesta {a}", { a: relTime(s.last_response_at) }) : t("sin respuestas todavía")}`}
                  end={why === "low_completion" ? <Flag>{t("{a} de completado", { a: pctDown(completion(s)) })}</Flag>
                    : <Flag>{plural(Math.max(2, daysSince(s.last_response_at ?? s.published_at ?? new Date().toISOString(), now)), { one: "Sin respuestas en {n} día", other: "Sin respuestas en {n} días" })}</Flag>} />
              ))}
            </Rows>
            {flagged.length > 6 && <Button variant="ghost" className="self-start" aria-haspopup="dialog"
              onClick={() => open({ kind: "rows", title: t("Necesitan atención"), rows: liveRows("attention"), empty: t("Todos los estudios activos van bien.") })}>{t("Ver los {n}", { n: flagged.length })}</Button>}
          </>) : <EmptyNote>{t("Todos los estudios activos van bien.")}</EmptyNote>}
        </Panel>
        <Panel title={t("Completado por estudio activo")} link={d.live.length > 6 ? { to: "/studies", text: t("Ver los {n}", { n: d.live.length }) } : undefined}
          note={t("«Bajo»: terminaron menos de {a} de quienes iniciaron. Se mide desde {b} sesiones.", { a: low, b: d.min_started })}>
          {byCompletion.length ? <BarList labelWidth={190} max={1} rows={byCompletion.slice(0, 6).map((s) => ({
            key: s.id, name: s.title, label: s.title, to: `/studies/${s.id}/results`, value: completion(s), text: pctDown(completion(s)),
            flag: s.attention === "low_completion" ? <Flag>{t("Bajo")}</Flag> : undefined,
          }))} /> : <EmptyNote>{t("Aún no hay suficientes respuestas para medir el completado.")}</EmptyNote>}
        </Panel>
        <Panel title={t("Insights por severidad")} link={{ to: `/projects${q}`, text: t("Abrir proyectos") }}
          note={`${periodLabel(d.period)} · ${plural(d.severity.with_tickets, { one: "{n} insight ya se convirtió en ticket.", other: "{n} insights ya se convirtieron en tickets." })}`}>
          <BarList labelWidth={120} rows={severities.map(([k, name]) => ({ key: k, name, label: <SeverityBadge severity={k} />, value: d.severity[k],
            onOpen: () => open({ kind: "studies", by: "severity", value: k, title: t("Insights de severidad {a}", { a: name.toLowerCase() }) }) }))} />
        </Panel>
      </Grid>
    </>
  );
}

// ── Tickets ─────────────────────────────────────────────────────
function Tickets({ d, filters, open }: { d: TicketsDash; filters: DashFilters; open: Open }) {
  const x = d.totals, today = isoDay(new Date());
  const board = filters.project ? `/projects/${filters.project}?tab=tickets` : "/projects";
  const behind = weeksBehind(d.weeks);
  const median = x.median_days === null ? null : Math.max(1, Math.round(x.median_days));
  const medianPrev = x.median_days_prev === null ? null : Math.max(1, Math.round(x.median_days_prev));
  const weeks = d.weeks.map((w) => ({ label: dayLabel(w.week), values: [w.created, w.closed] }));
  const lastWeek = d.weeks[d.weeks.length - 1];
  const sources = [["manual", t("Creados por el equipo"), x.source_manual], ["insight", t("Desde un insight"), x.source_insight], ["widget", t("Widget de feedback"), x.source_widget]] as const;
  const typeCount = (k: (typeof TYPES)[number]) => d.types.find((r) => r.type === k)?.n ?? 0;
  const dueLine = (due: string) => {
    const r = dueText(due, today);
    return r.kind === "late" ? plural(r.days, { one: "{n} día de atraso", other: "{n} días de atraso" }) : r.kind === "today" ? t("Vence hoy") : r.kind === "tomorrow" ? t("Vence mañana") : t("Vence el {a}", { a: fmtDay(due) });
  };
  return (
    <>
      <Tiles>
        <Tile label={t("Tickets abiertos")} value={fmtNum(x.open)} sub={`${statusLabel("todo")} ${x.todo} · ${statusLabel("in_progress")} ${x.in_progress} · ${statusLabel("in_review")} ${x.in_review}`}
          onOpen={() => open({ kind: "tickets", title: t("Tickets abiertos"), by: "open" })} />
        <Tile label={t("Vencidos")} value={fmtNum(x.overdue)} tone={x.overdue > x.overdue_last_week ? "bad" : "good"}
          onOpen={() => open({ kind: "tickets", title: t("Tickets vencidos"), by: "overdue" })}
          change={{ delta: delta(x.overdue, x.overdue_last_week), text: t("{n} vs. la semana pasada", { n: Math.abs(x.overdue - x.overdue_last_week) }) }}
          sub={x.oldest_days_late ? t("El más antiguo: {a}", { a: plural(x.oldest_days_late, { one: "{n} día de atraso", other: "{n} días de atraso" }) }) : t("Nada vencido")} />
        <Tile label={t("Creados")} value={fmtNum(x.created_period)}
          onOpen={() => open({ kind: "tickets", title: t("Creados · {a}", { a: periodLabel(d.period) }), by: "created_period" })}
          change={{ delta: delta(x.created_period, x.created_prev_period), text: t("{n} vs. el periodo anterior", { n: fmtNum(Math.abs(x.created_period - x.created_prev_period)) }) }}
          sub={`${periodLabel(d.period)} · ${plural(x.created_period_widget, { one: "{n} desde el widget de feedback", other: "{n} desde el widget de feedback" })}`} />
        <Tile label={t("Cerrados")} value={fmtNum(x.closed_period)} onOpen={() => open({ kind: "tickets", title: t("Cerrados · {a}", { a: periodLabel(d.period) }), by: "closed_period" })}
          change={{ delta: delta(x.closed_period, x.closed_prev_period), text: t("{n} vs. el periodo anterior", { n: fmtNum(Math.abs(x.closed_period - x.closed_prev_period)) }) }}
          sub={x.created_period ? `${periodLabel(d.period)} · ${t("{a} de lo que entró", { a: fmtPct(x.closed_period / x.created_period) })}` : t("No entró ninguno en este periodo")} />
        <Tile label={t("Tiempo mediano para cerrar")} value={median === null ? "—" : plural(median, { one: "{n} día", other: "{n} días" })} tone={median !== null && medianPrev !== null && median <= medianPrev ? "good" : "bad"}
          change={median !== null && medianPrev !== null ? { delta: delta(median, medianPrev), text: median < medianPrev ? plural(medianPrev - median, { one: "{n} día más rápido", other: "{n} días más rápido" }) : plural(median - medianPrev, { one: "{n} día más lento", other: "{n} días más lento" }) } : undefined}
          sub={periodLabel(d.period)} onOpen={() => open({ kind: "tickets", title: t("Cerrados en este periodo"), by: "closed_period" })} />
      </Tiles>

      <Panel title={t("Creados vs. cerrados por semana · últimas 8 semanas")} link={{ to: board, text: filters.project ? t("Abrir tablero") : t("Abrir proyectos") }}
        note={behind > 0 ? t("Entraron más de los que se cerraron en {a} de las últimas 4 semanas.", { a: behind }) : t("En las últimas 4 semanas se cerró al menos lo que entró.")}>
        {weeks.some((w) => w.values[0] + w.values[1] > 0)
          ? <Columns points={weeks} series={[t("Creados"), t("Cerrados")]} caption={t("Tickets creados y cerrados por semana, del {a} al {b}. Esta semana: {c} creados, {d} cerrados.", { a: weeks[0].label, b: weeks[weeks.length - 1].label, c: lastWeek.created, d: lastWeek.closed })}
              onOpen={(i) => open({ kind: "tickets", by: "week", value: d.weeks[i].week, title: t("Creados o cerrados la semana del {a}", { a: weeks[i].label }) })} />
          : <EmptyNote>{t("Aún no hay tickets en estas semanas.")}</EmptyNote>}
      </Panel>

      <Grid>
        <Panel title={t("Abiertos por estado")} note={plural(x.closed_period, { one: "{n} cerrado en este periodo.", other: "{n} cerrados en este periodo." })}>
          <BarList labelWidth={120} rows={STATUSES.filter((s) => s !== "done").map((s) => ({ key: s, name: statusLabel(s), label: <StatusChip status={s} />, value: x[s as "todo" | "in_progress" | "in_review"],
            onOpen: () => open({ kind: "tickets", by: "status", value: s, title: statusLabel(s) }) }))} />
        </Panel>
        <Panel title={t("Carga por persona")}>
          {d.people.length ? <BarList labelWidth={170} rows={d.people.map((p) => ({
            key: p.id ?? "none", name: p.name ?? t("Sin asignar"), value: p.open, text: plural(p.open, { one: "{n} abierto", other: "{n} abiertos" }),
            label: p.id ? <span className="inline-flex items-center gap-2"><Avatar name={p.name ?? ""} avatar={p.avatar} size={24} />{p.name}</span> : <span className="text-ink-3">{t("Sin asignar")}</span>,
            flag: p.overdue ? <Flag tone="bad">{plural(p.overdue, { one: "{n} vencido", other: "{n} vencidos" })}</Flag> : undefined,
            onOpen: () => open({ kind: "tickets", by: "assignee", value: p.id ?? "none", title: p.name ? t("Tickets abiertos de {a}", { a: p.name }) : t("Tickets abiertos sin asignar") }),
          }))} /> : <EmptyNote>{t("No hay tickets abiertos.")}</EmptyNote>}
        </Panel>
        <Panel title={t("De dónde vienen los tickets")} note={periodLabel(d.period) + "."}>
          <BarList labelWidth={170} rows={sources.map(([key, name, n]) => ({ key, name, label: name, value: n, onOpen: () => open({ kind: "tickets", by: "source", value: key, title: name }) }))} />
        </Panel>
        <Panel title={t("Por tipo")} note={t("Todos los tickets, abiertos y cerrados.")}>
          <BarList labelWidth={150} rows={TYPES.map((k) => ({ key: k, name: typeLabel(k), label: <TypeChip type={k} />, value: typeCount(k), onOpen: () => open({ kind: "tickets", by: "type", value: k, title: typeLabel(k) }) }))} />
        </Panel>
        <Panel title={t("Vencidos y por vencer")} link={filters.project ? { to: `/projects/${filters.project}?tab=tickets&view=list`, text: t("Vista de lista") } : undefined}>
          {d.due.length ? (
            <Rows>
              {d.due.map((r) => {
                const late = dueText(r.due_date, today).kind === "late";
                return <RowLink key={`${r.project_id}-${r.number}`} to={`/projects/${r.project_id}/tickets/${r.number}`} title={<><span className="text-ink-3 tabular-nums">#{r.number}</span> {r.title}</>}
                  sub={[r.project_name, r.assignees ?? t("Sin asignar"), r.priority === "urgent" ? priorityLabel("urgent") : r.status === "in_review" ? statusLabel("in_review").toLowerCase() : null].filter(Boolean).join(" · ")}
                  end={late ? <Flag tone="bad">{dueLine(r.due_date)}</Flag> : <span className="text-ink-2">{dueLine(r.due_date)}</span>} />;
              })}
            </Rows>
          ) : <EmptyNote>{t("Nada vencido ni por vencer en los próximos 3 días.")}</EmptyNote>}
        </Panel>
        <Panel title={t("Widget de feedback · páginas con más reportes")} link={filters.project ? { to: `/projects/${filters.project}/widget`, text: t("Configurar widget") } : undefined}
          note={d.widget.total ? plural(d.widget.total, { one: "{n} mensaje en este periodo", other: "{n} mensajes en este periodo" }) + (d.widget.host ? ` ${t("desde {a}", { a: d.widget.host })}.` : ".") : undefined}>
          {d.widget.top.length ? <BarList labelWidth={170} rows={[...d.widget.top.map((r) => ({ key: r.key, name: r.key, label: <code className="text-[12px]">{r.key}</code>, value: r.n,
            onOpen: () => open({ kind: "tickets", by: "page", value: r.key, title: t("Reportes desde {a}", { a: r.key }) }) })),
            ...(d.widget.other ? [{ key: "other", name: t("Otras páginas"), label: t("Otras páginas"), value: d.widget.other }] : [])]} />
            : <EmptyNote>{t("Aún no llegan tickets desde el widget de feedback.")}</EmptyNote>}
        </Panel>
      </Grid>
    </>
  );
}

// ── Projects ────────────────────────────────────────────────────
const HEALTH_STYLE: Record<Health, string> = { on_track: "bg-good-soft text-good", needs_attention: "bg-warn-soft text-warn", at_risk: "bg-bad-soft text-bad", quiet: "bg-ink/5 text-ink-2" };
const healthLabel = (h: Health) => ({ on_track: t("En curso"), needs_attention: t("Necesita atención"), at_risk: t("En riesgo"), quiet: t("Sin movimiento") })[h];
const HealthChip = ({ health }: { health: Health }) => <span className={cx("inline-flex items-center rounded-full px-2 py-[3px] text-left text-xs font-bold", HEALTH_STYLE[health])}>{healthLabel(health)}</span>;
const milestoneLabel = (s: MilestoneState) => ({ done: t("Terminado"), planned: t("Planeado"), behind: t("Atrasado"), at_risk: t("En riesgo"), on_track: t("en curso") })[s];
function Progress({ m }: { m: MilestoneRow }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3 tabular-nums">
      <span role="img" aria-label={t("{n}% hecho", { n: m.progress })} className="block h-1.5 w-16 rounded-full bg-ink/[0.08]"><span className="block h-1.5 rounded-full bg-chart-1" style={{ width: `${m.progress}%` }} /></span>
      {m.progress}%{m.end_date ? ` · ${fmtDay(m.end_date)}` : ""}
    </span>
  );
}

function Projects({ d, q, open }: { d: ProjectsDash; q: string; open: Open }) {
  const risky = d.rows.filter((r) => r.health === "at_risk" || r.health === "needs_attention").length;
  const live = d.rows.reduce((n, r) => n + r.live_studies, 0), openTickets = d.rows.reduce((n, r) => n + r.open_tickets, 0), overdue = d.rows.reduce((n, r) => n + r.overdue, 0);
  const count = (s: MilestoneState) => d.milestones.filter((m) => m.state === s).length;
  const upcoming = d.milestones.filter((m) => m.state !== "done").slice(0, 6);
  // Fixed column widths and wrapping headers keep the table inside the panel down to ~640px (no sideways scroll at 1040px).
  const th = "border-b border-line px-2 py-2.5 text-left align-bottom text-xs font-semibold text-ink-3", td = "border-b border-line/60 px-2 py-3 align-top text-[13px] tabular-nums";
  const activityLine = (a: ProjectsDash["activity"][number]): { to: string; text: string; end?: ReactNode } => {
    switch (a.kind) {
      case "responses": return { to: `/studies/${a.ref}/results`, text: t("{a} recibió {b}", { a: a.title, b: plural(a.n, { one: "{n} respuesta", other: "{n} respuestas" }) }) };
      case "ticket_status": return { to: `/projects/${a.project_id}/tickets/${a.ref}`, text: t("{a} movió #{b} a {c}", { a: a.title.split(" ")[0] || t("Alguien"), b: a.ref, c: (STATUSES as readonly string[]).includes(a.extra ?? "") ? statusLabel(a.extra as (typeof STATUSES)[number]) : a.extra }) };
      case "insight": return { to: `/projects/${a.project_id}?tab=insights`, text: t("Insight nuevo: {a}", { a: a.title }), end: a.extra ? <SeverityBadge severity={a.extra as Severity} /> : undefined };
      default: return { to: `/projects/${a.project_id}?tab=tickets`, text: plural(a.n, { one: "{n} ticket llegó desde el widget de feedback", other: "{n} tickets llegaron desde el widget de feedback" }) };
    }
  };
  const milestoneRow = (m: MilestoneRow, withProject = true): DrillRow => ({
    key: m.id, to: `/projects/${m.project_id}?tab=milestones`, title: m.name,
    sub: [withProject ? m.project_name : null, plural(m.total, { one: "{a} de {n} ticket", other: "{a} de {n} tickets" }, { a: m.done }), m.end_date ? fmtDay(m.end_date) : null].filter(Boolean).join(" · "),
    end: m.state === "done" || m.state === "on_track" || m.state === "planned" ? `${m.progress}%` : milestoneLabel(m.state), tone: m.state === "behind" ? "bad" : m.state === "at_risk" ? "warn" : undefined,
  });
  const projectRows = (rows: ProjectsDash["rows"]): DrillRow[] => rows.map((r) => ({
    key: r.id, to: `/projects/${r.id}`, title: r.name,
    sub: [plural(r.live_studies, { one: "{n} estudio activo", other: "{n} estudios activos" }), plural(r.open_tickets, { one: "{n} abierto", other: "{n} abiertos" }), plural(r.overdue, { one: "{n} vencido", other: "{n} vencidos" })].join(" · "),
    end: healthLabel(r.health), tone: r.health === "at_risk" ? "bad" : r.health === "needs_attention" ? "warn" : undefined,
  }));
  /** One project's detail: what its health is made of, each with a link. */
  const projectDetail = (r: ProjectsDash["rows"][number]): Drill => ({
    kind: "rows", title: r.name, note: healthLabel(r.health), empty: t("Sin detalles."),
    rows: [
      { key: "tickets", to: `/projects/${r.id}?tab=tickets`, title: t("Tickets abiertos"), sub: plural(r.overdue, { one: "{n} vencido", other: "{n} vencidos" }), end: fmtNum(r.open_tickets), tone: r.overdue > 0 ? "bad" : undefined },
      { key: "studies", to: `/projects/${r.id}`, title: t("Estudios activos"), sub: r.studies_attention ? plural(r.studies_attention, { one: "{n} necesita atención", other: "{n} necesitan atención" }) : t("Respuestas en 7 días: {a}", { a: fmtNum(r.responses_7d) }), end: fmtNum(r.live_studies), tone: r.studies_attention ? "warn" : undefined },
      ...milestonesFor(d.milestones, "all", r.id).map((m) => milestoneRow(m, false)),
    ],
  });
  const cellButton = "focus-ring rounded font-semibold text-accent-ink hover:underline";
  return (
    <>
      <Tiles>
        <Tile label={t("Proyectos activos")} value={fmtNum(d.rows.length)} sub={plural(risky, { one: "{n} con algo en riesgo", other: "{n} con algo en riesgo" })}
          onOpen={() => open({ kind: "rows", title: t("Proyectos activos"), rows: projectRows(projectsFor(d.rows, "all")), empty: t("Aún no hay proyectos."), note: t("Primero los que están en riesgo.") })} />
        <Tile label={t("Estudios activos")} value={fmtNum(live)} sub={plural(d.rows.filter((r) => r.live_studies > 0).length, { one: "En {n} proyecto", other: "En {n} proyectos" })}
          onOpen={() => open({ kind: "studies", title: t("Estudios activos"), by: "live" })} />
        <Tile label={t("Tickets abiertos")} value={fmtNum(openTickets)} sub={plural(overdue, { one: "{n} vencido", other: "{n} vencidos" })}
          onOpen={() => open({ kind: "tickets", title: t("Tickets abiertos"), by: "open" })} />
        <Tile label={t("Hitos")} value={fmtNum(d.milestones.length)} sub={[plural(count("behind"), { one: "{n} atrasado", other: "{n} atrasados" }), t("{a} en riesgo", { a: count("at_risk") }), t("{a} en curso", { a: count("on_track") + count("planned") }), plural(count("done"), { one: "{n} terminado", other: "{n} terminados" })].join(" · ")}
          onOpen={() => open({ kind: "rows", title: t("Hitos"), rows: milestonesFor(d.milestones, "all").map((m) => milestoneRow(m)), empty: t("No hay hitos abiertos."), note: t("Primero los atrasados y en riesgo.") })} />
      </Tiles>

      <Panel title={t("Todos los proyectos")} note={t("Salud: tickets vencidos, estudios que necesitan atención (completado menor a {a} o sin respuestas en 48 horas) y hitos atrasados o en riesgo.", { a: fmtPct(d.low_completion) })}>
        {d.rows.length ? (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed border-collapse">
              <colgroup><col className="w-[22%]" /><col className="w-[16%]" /><col className="w-[11%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[24%]" /></colgroup>
              <thead><tr>
                <th scope="col" className={th}>{t("Proyecto")}</th><th scope="col" className={th}>{t("Salud")}</th><th scope="col" className={th}>{t("Estudios activos")}</th>
                <th scope="col" className={th}>{t("Respuestas · 7 d")}</th><th scope="col" className={th}>{t("Tickets abiertos")}</th><th scope="col" className={th}>{t("Vencidos")}</th><th scope="col" className={th}>{t("Próximo hito")}</th>
              </tr></thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-paper">
                    <th scope="row" className={cx(td, "text-left font-normal")}>
                      <Link to={`/projects/${r.id}`} className="focus-ring flex items-start gap-2 rounded text-sm font-semibold hover:underline"><span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} /><span className="min-w-0 [overflow-wrap:anywhere]">{r.name}</span></Link>
                    </th>
                    <td className={td}>
                      <button type="button" onClick={() => open(projectDetail(r))} aria-haspopup="dialog" className="focus-ring rounded-full" title={t("Ver detalle")}>
                        <HealthChip health={r.health} /><span className="sr-only"> · {t("Ver detalle de {a}", { a: r.name })}</span>
                      </button>
                    </td>
                    <td className={td}>
                      {r.live_studies > 0 ? <button type="button" aria-haspopup="dialog" className={cellButton} onClick={() => open({ kind: "studies", by: "live", project: r.id, title: t("Estudios activos · {a}", { a: r.name }) })}>{r.live_studies}</button> : r.live_studies}
                      {r.low_completion > 0 && <span className="mt-1 block"><Flag>{plural(r.low_completion, { one: "{n} bajo", other: "{n} bajos" })}</Flag></span>}
                    </td>
                    <td className={td}>{fmtNum(r.responses_7d)}</td>
                    <td className={td}><Link to={`/projects/${r.id}?tab=tickets`} className="focus-ring rounded font-semibold text-accent-ink hover:underline">{r.open_tickets}</Link></td>
                    <td className={cx(td, r.overdue > 0 && "font-bold text-bad")}>
                      {r.overdue > 0 ? <button type="button" aria-haspopup="dialog" className="focus-ring rounded font-bold text-bad hover:underline" onClick={() => open({ kind: "tickets", by: "overdue", project: r.id, title: t("Tickets vencidos · {a}", { a: r.name }) })}>{r.overdue}</button> : r.overdue}
                    </td>
                    <td className={td}>{r.next_milestone ? <><span className="block text-ink [overflow-wrap:anywhere]">{r.next_milestone.name}</span><Progress m={r.next_milestone} /></> : <span className="text-ink-3">{t("Sin hito")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyNote>{t("Aún no hay proyectos.")}</EmptyNote>}
      </Panel>

      <Grid>
        <Panel title={t("Próximos hitos")} note={t("En riesgo: vence en {n} días o menos y aún tiene tickets abiertos. Sin fecha propia, un hito termina con la fecha límite más lejana de sus tickets.", { n: d.at_risk_days })}>
          {upcoming.length ? (
            <Rows>
              {upcoming.map((m) => (
                <RowLink key={m.id} to={`/projects/${m.project_id}?tab=milestones`} title={m.name}
                  sub={`${m.project_name} · ${m.progress}% · ${m.state === "behind" ? plural(m.overdue_open, { one: "{n} ticket vencido", other: "{n} tickets vencidos" }) : m.state === "at_risk" ? plural(m.total - m.done, { one: "{n} ticket abierto", other: "{n} tickets abiertos" }) : plural(m.total, { one: "{a} de {n} ticket", other: "{a} de {n} tickets" }, { a: m.done })}`}
                  end={m.state === "behind" ? <Flag tone="bad">{milestoneLabel("behind")}</Flag> : m.state === "at_risk" ? <Flag>{milestoneLabel("at_risk")}{m.end_date ? ` · ${fmtDay(m.end_date)}` : ""}</Flag> : m.end_date ? <span className="text-ink-2">{fmtDay(m.end_date)}</span> : undefined} />
              ))}
            </Rows>
          ) : <EmptyNote>{t("No hay hitos abiertos.")}</EmptyNote>}
        </Panel>
        <Panel title={t("Actividad reciente en los proyectos")} link={{ to: `/dashboards/tickets${q}`, text: t("Dashboard de tickets") }}>
          {d.activity.length ? (
            <Rows>
              {d.activity.map((a, i) => { const l = activityLine(a); return <RowLink key={i} to={l.to} title={l.text} sub={`${a.project_name} · ${relTime(a.at)}`} end={l.end} />; })}
            </Rows>
          ) : <EmptyNote>{t("Sin actividad en los últimos 7 días.")}</EmptyNote>}
        </Panel>
      </Grid>
    </>
  );
}
