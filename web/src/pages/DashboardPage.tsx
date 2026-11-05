import { useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, FolderPlus, TriangleAlert } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo, useLoad } from "../lib/hooks";
import { familyColor, familyOf, figureUnit } from "../lib/families";
import type { Severity } from "../lib/types";
import { Button, Card, ErrorNote, SeverityBadge, cx } from "../components/ui";
import { ParticipantFigures } from "../components/ParticipantFigures";
import { templateByKey, type Category } from "../templates/catalog";

import { locale, t } from "../lib/i18n";
interface LiveStudy { id: string; title: string; method: string; project_name: string; project_color: string; responses: number; started: number; last_response_at: string | null }
interface Draft { id: string; title: string; method: string; updated_at: string; project_name: string; project_color: string }
interface Day { day: string; n: number }
interface Dash {
  totals: { projects: number; studies: number; live: number; responses: number; responses_week: number; insights: number };
  trend: Day[];
  study_trend: { study_id: string; day: string; n: number }[];
  live: LiveStudy[];
  drafts: Draft[];
  activity: { at: string; study_id: string; study_title: string; method: string }[];
  insights: { id: string; title: string; severity: Severity; created_at: string; project_id: string; project_name: string }[];
}

// Un estudio pide atención si, con al menos 8 personas, menos del 70% terminó.
const highDropoff = (s: LiveStudy) => s.started >= 8 && s.responses / s.started < 0.7;

const responsesLabel = (n: number) => t(n === 1 ? "{a} respuesta" : "{a} respuestas", { a: n });
const methodName = (method: string) => templateByKey(method)?.name ?? method;
const fmtDay = (day: string) => new Date(day + "T12:00").toLocaleDateString(locale(), { day: "numeric", month: "short" });

/** Estudios activos por urgencia: abandono alto, sin respuestas, y luego con más respuestas. */
function byUrgency(live: LiveStudy[]) {
  const dropoff = live.filter(highDropoff).sort((a, b) => a.responses / a.started - b.responses / b.started);
  const silent = live.filter((s) => s.responses === 0);
  const ready = live.filter((s) => s.responses > 0 && !highDropoff(s)).sort((a, b) => b.responses - a.responses);
  return [...dropoff, ...silent, ...ready];
}

/** La acción principal de un estudio y lo que se sabe de su estado. */
function studyAction(s: LiveStudy) {
  const to = `/studies/${s.id}/results`;
  if (highDropoff(s)) return { label: t("Revisar"), state: t("Solo {a} de {b} terminaron", { a: s.responses, b: s.started }), to };
  if (s.responses === 0) return { label: t("Compartir link"), state: t("Aún sin respuestas"), to };
  return { label: t("Ver resultados"), state: responsesLabel(s.responses), to };
}

interface Step { key: string; title: string; detail: string; action: string; to: string; family?: Category }

/** Los próximos pasos salen de lo que ya se sabe de cada estudio, ordenados por urgencia. Máximo 3. */
function nextSteps(live: LiveStudy[], drafts: Draft[]): Step[] {
  const results = (s: LiveStudy) => `/studies/${s.id}/results`;
  const dropoff = live.filter(highDropoff).sort((a, b) => a.responses / a.started - b.responses / b.started)
    .map((s): Step => ({ key: `d${s.id}`, title: t("Revisar “{a}”", { a: s.title }), detail: t("Solo {a} de {b} terminaron", { a: s.responses, b: s.started }), action: t("Revisar"), to: results(s), family: familyOf(s.method) }));
  const silent = live.filter((s) => s.responses === 0)
    .map((s): Step => ({ key: `s${s.id}`, title: t("Compartir “{a}”", { a: s.title }), detail: t("Aún sin respuestas"), action: t("Compartir link"), to: results(s), family: familyOf(s.method) }));
  const ready = live.filter((s) => s.responses > 0 && !highDropoff(s)).sort((a, b) => b.responses - a.responses)
    .map((s): Step => ({ key: `r${s.id}`, title: t("Ver resultados de “{a}”", { a: s.title }), detail: responsesLabel(s.responses), action: t("Ver resultados"), to: results(s), family: familyOf(s.method) }));
  const draft = drafts.slice(0, 1)
    .map((d): Step => ({ key: `b${d.id}`, title: t("Continuar “{a}”", { a: d.title }), detail: t("Borrador · editado {a}", { a: timeAgo(d.updated_at) }), action: t("Continuar"), to: `/studies/${d.id}/edit`, family: familyOf(d.method) }));
  // Un borrador siempre aparece si cabe, aunque haya muchos resultados por ver.
  const urgent = [...dropoff, ...silent].slice(0, 3);
  const rest = 3 - urgent.length;
  return [...urgent, ...draft.slice(0, Math.min(rest, 1)), ...ready].slice(0, 3);
}

const Dot = ({ family, size = "h-2.5 w-2.5" }: { family: Category; size?: string }) => (
  <span className={cx("inline-block shrink-0 rounded-full", size)} style={{ background: familyColor(family) }} aria-hidden />
);

function TrendChart({ days, label }: { days: Day[]; label: string }) {
  // Una escala mínima evita que una sola respuesta parezca un pico.
  const max = Math.max(5, figureUnit(Math.max(...days.map((d) => d.n)), 1));
  return (
    <div role="img" aria-label={label}>
      <div className="flex gap-2" aria-hidden>
        <div className="flex h-20 min-w-0 flex-1 items-end gap-[3px] border-t border-b border-line">
          {days.map((d) => (
            <div key={d.day} className="group flex h-full flex-1 items-end" title={`${fmtDay(d.day)}: ${d.n}`}>
              {d.n > 0 && <div className="w-full rounded-t-[3px] bg-accent transition group-hover:opacity-80" style={{ height: `${(d.n / max) * 100}%` }} />}
            </div>
          ))}
        </div>
        <div className="flex h-20 flex-col justify-between text-xs leading-none text-ink-3 tabular-nums"><span>{max}</span><span>0</span></div>
      </div>
      <div className="mt-1.5 flex justify-between pr-5 text-xs text-ink-3 tabular-nums" aria-hidden>
        <span>{fmtDay(days[0].day)}</span>
        <span>{fmtDay(days[days.length - 1].day)}</span>
      </div>
    </div>
  );
}

const trendLabel = (days: Day[]) => {
  const sum = days.reduce((n, d) => n + d.n, 0);
  const peak = days.reduce((best, d) => (d.n > best.n ? d : best), days[0]);
  return t(sum === 1 ? "1 respuesta en 14 días. Máximo: {b} el {c}." : "{a} respuestas en 14 días. Máximo: {b} el {c}.", { a: sum, b: peak.n, c: fmtDay(peak.day) });
};

const primaryLink = "focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-[15px] font-medium whitespace-nowrap text-on-accent shadow-sm transition hover:-translate-y-px hover:bg-accent/90 active:translate-y-0 motion-reduce:transform-none";

function StudyDetail({ study, unit, days }: { study: LiveStudy; unit: number; days: Day[] }) {
  const family = familyOf(study.method);
  const action = studyAction(study);
  const alert = highDropoff(study);
  const facts: [string, string][] = [
    [t("Empezaron"), String(study.started)],
    [t("Terminaron"), String(study.responses)],
    [t("Última respuesta"), study.last_response_at ? timeAgo(study.last_response_at) : "—"],
  ];
  return (
    <>
      <h2 className="display text-[32px] [overflow-wrap:anywhere] text-balance sm:text-[40px]">{study.title}</h2>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-2"><Dot family={family} size="h-2 w-2" />{methodName(study.method)} · {study.project_name}</p>
      <p className={cx("mt-1.5 flex items-center gap-1.5 text-sm", alert ? "font-semibold text-warn" : "text-ink-2")}>{alert && <TriangleAlert size={14} aria-hidden />}{action.state}</p>
      <div className="mt-6 min-h-11">
        {study.started > 0
          ? <ParticipantFigures height={44} started={study.started} done={study.responses} unit={unit} color={familyColor(family)} label={t("{a} de {b} personas terminaron", { a: study.responses, b: study.started })} />
          : <p className="text-sm text-ink-2">{t("Aún no entra nadie.")}</p>}
      </div>
      {study.started > 0 && <p className="mt-2 text-xs text-ink-3">{unit === 1 ? t("1 figura = 1 persona") : t("1 figura = {a} personas", { a: unit })} · {t("hueca = no terminó")}</p>}
      <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-line py-4">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0"><dd className="display truncate text-[24px] tabular-nums sm:text-[30px]">{value}</dd><dt className="mt-1 text-[13px] text-ink-2">{label}</dt></div>
        ))}
      </dl>
      <h3 className="mt-6 mb-2.5 text-[15px] font-semibold">{t("Respuestas · últimos 14 días")}</h3>
      <TrendChart days={days} label={trendLabel(days)} />
      <Link to={action.to} className={cx(primaryLink, "mt-6 w-full sm:w-auto")}>{action.label} <ArrowRight size={16} aria-hidden /></Link>
    </>
  );
}

function DashboardSkeleton() {
  const bar = "animate-pulse rounded-md bg-ink/5";
  return (
    <div className="grid gap-8 px-(--page-gutter) py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]" aria-busy aria-label={t("Cargando…")}>
      <div className="space-y-3"><div className={cx(bar, "h-10 w-32")} />{[0, 1, 2, 3].map((i) => <div key={i} className={cx(bar, "h-16 rounded-xl")} />)}</div>
      <div className={cx(bar, "h-[560px] rounded-xl")} />
    </div>
  );
}

export function DashboardPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const detail = useRef<HTMLElement>(null);
  const { data, error, loading, reload } = useLoad(() => api.get<Dash>("/dashboard"), []);
  if (loading) return <DashboardSkeleton />;
  if (error || !data) return (
    <div className="px-(--page-gutter) py-5">
      <ErrorNote>{error ?? t("No se pudo cargar el inicio.")}</ErrorNote>
      <Button className="mt-3" onClick={reload}>{t("Reintentar")}</Button>
    </div>
  );
  const { totals, trend, study_trend, live, drafts, activity, insights } = data;

  if (totals.projects === 0) {
    return (
      <div className="px-(--page-gutter) py-14">
        <h1 className="display text-[38px] leading-tight">{t("Bienvenida a redekorate")}</h1>
        <p className="mt-3 text-[15px] text-ink-2">{t("Tu espacio para planear, lanzar y analizar investigación de UX. Así funciona:")}</p>
        <ol className="mt-8 grid gap-3 sm:grid-cols-3">
          {[["1", t("Crea un proyecto"), t("Agrupa estudios por producto o cliente.")], ["2", t("Elige un método"), t("Encuestas, card sorting, tree test, first click, preference test…")], ["3", t("Comparte y analiza"), t("Envía un link, mira resultados en vivo y comparte un reporte.")]].map(([n, title, d]) => (
            <li key={n}><Card className="h-full p-5"><span className="text-sm font-semibold text-ink-3">{n}</span><p className="mt-2 font-semibold">{title}</p><p className="mt-1 text-sm text-ink-3">{d}</p></Card></li>
          ))}
        </ol>
        <Button variant="primary" size="lg" className="mt-8" icon={<FolderPlus size={17} />} onClick={() => nav("/projects?crear=1")}>{t("Crear mi primer proyecto")}</Button>
      </div>
    );
  }

  const lead: Step = nextSteps(live, drafts)[0] ?? { key: "new", title: t("Crea un estudio en un proyecto"), detail: t("No hay nada en campo ni borradores"), action: t("Ir a proyectos"), to: "/projects" };
  const studies = byUrgency(live);
  const selected = studies.find((s) => s.id === params.get("study")) ?? studies[0];
  // Misma escala para todos los estudios: las figuras se pueden comparar al cambiar de uno a otro.
  const unit = figureUnit(Math.max(1, ...live.map((s) => s.started)), 28);
  const peak = trend.reduce((best, d) => (d.n > best.n ? d : best), trend[0]);
  const insightStudy = live.find((s) => s.responses > 0);
  const selectedDays = selected ? trend.map((d) => ({ day: d.day, n: study_trend.find((x) => x.study_id === selected.id && x.day === d.day)?.n ?? 0 })) : [];
  const select = (id: string) => {
    setParams({ study: id }, { replace: true });
    // En una sola columna el detalle queda debajo de la lista: lo llevamos a la vista.
    if (window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => detail.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const summary: [string, string][] = [
    [t("Respuestas"), String(totals.responses)],
    [t("Esta semana"), String(totals.responses_week)],
    [t("Estudios activos"), `${totals.live} ${t("de {a}", { a: totals.studies })}`],
    [t("Insights"), String(totals.insights)],
    [t("Proyectos"), String(totals.projects)],
  ];

  return (
    <div>
      <div className="grid grid-cols-1 items-start gap-x-8 gap-y-8 px-(--page-gutter) py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        <div className="min-w-0">
          <h1 className="display text-[40px]">{t("Inicio")}</h1>
          <section className="mt-5" aria-labelledby="next-step">
            <h2 id="next-step" className="text-[15px] font-semibold">{t("Tu próximo paso")}</h2>
            <Link to={lead.to} className="focus-ring group -mx-2 mt-1 flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 transition hover:bg-ink/5">
              <span className="min-w-0">
                <span className="block text-[15px] leading-snug font-medium [overflow-wrap:anywhere]">{lead.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">{lead.family && <Dot family={lead.family} size="h-2 w-2" />}{lead.detail}</span>
              </span>
              <ArrowRight size={16} aria-hidden className="mt-0.5 shrink-0 text-accent transition group-hover:translate-x-0.5 motion-reduce:transform-none" />
            </Link>
          </section>

          <section className="mt-7">
            <h2 className="mb-2 text-[17px] font-semibold">{t("Estudios activos")}</h2>
            {studies.length === 0 ? <p className="text-sm text-ink-2">{t("Al publicar un estudio, aquí verás quién terminó y quién no.")}</p> : (
              <ul className="space-y-1.5">
                {studies.map((s) => {
                  const on = s.id === selected?.id;
                  const alert = highDropoff(s);
                  return (
                    <li key={s.id}>
                      <button type="button" aria-current={on || undefined} onClick={() => select(s.id)}
                        className={cx("focus-ring block w-full rounded-xl border px-3.5 py-3 text-left transition", on ? "border-accent bg-surface shadow-(--shadow-lift)" : "border-transparent hover:bg-ink/5")}>
                        <span className="block truncate text-[15px] font-semibold" title={s.title}>{s.title}</span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
                          <Dot family={familyOf(s.method)} size="h-2 w-2" />
                          {alert && <span className="flex shrink-0 items-center gap-1 font-semibold text-warn"><TriangleAlert size={13} aria-hidden />{t("Abandono alto")} ·</span>}
                          <span className="truncate">{s.started > 0 ? `${s.responses} ${t("de {a}", { a: s.started })}` : t("Aún no entra nadie.")}{s.last_response_at ? ` · ${timeAgo(s.last_response_at)}` : ""} · {methodName(s.method)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {drafts.length > 0 && (
            <section className="mt-7">
              <h2 className="mb-2 text-[17px] font-semibold">{t("Borradores para continuar")}</h2>
              <ul className="space-y-0.5">
                {drafts.map((d) => (
                  <li key={d.id}>
                    <Link to={`/studies/${d.id}/edit`} className="focus-ring block rounded-xl px-3.5 py-2.5 transition hover:bg-ink/5">
                      <span className="block truncate text-[15px] font-semibold" title={d.title}>{d.title}</span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2"><Dot family={familyOf(d.method)} size="h-2 w-2" /><span className="truncate">{d.project_name} {t("· editado")} {timeAgo(d.updated_at)}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-7">
            <h2 className="mb-2 text-[17px] font-semibold">{t("Insights recientes")}</h2>
            {insights.length === 0 ? (
              <div>
                <p className="text-sm text-ink-2">{t("Registra hallazgos desde los resultados de cada estudio.")}</p>
                {insightStudy && (
                  <Link to={`/studies/${insightStudy.id}/results?tab=insights`} className="focus-ring mt-1.5 inline-flex items-center gap-1.5 rounded text-sm font-medium text-accent underline-offset-2 hover:underline">
                    {t("Registrar un insight")} <ArrowRight size={14} aria-hidden />
                  </Link>
                )}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {insights.map((i) => (
                  <li key={i.id}>
                    <Link to={`/projects/${i.project_id}?tab=insights`} className="focus-ring block rounded-xl px-3.5 py-2.5 transition hover:bg-ink/5">
                      <span className="block text-sm leading-snug font-medium">{i.title}</span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-ink-2"><SeverityBadge severity={i.severity} /> {i.project_name} · {timeAgo(i.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section ref={detail} className="field-dark min-w-0 scroll-mt-4 rounded-xl p-6 shadow-(--shadow-lift) sm:p-8" aria-live="polite">
          {selected ? <StudyDetail study={selected} unit={unit} days={selectedDays} /> : (
            <>
              <ParticipantFigures height={44} started={8} done={0} unit={1} color="var(--color-line-2)" label={t("Sin participantes")} />
              <h2 className="display mt-6 text-[32px] sm:text-[40px]">{t("Nada en campo ahora mismo")}</h2>
              <p className="mt-2 text-[15px] text-ink-2">{t("Al publicar un estudio, aquí verás quién terminó y quién no.")}</p>
              <Link to={lead.to} className={cx(primaryLink, "mt-6 w-full sm:w-auto")}>{lead.action} <ArrowRight size={16} aria-hidden /></Link>
            </>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 bg-paper-2 px-(--page-gutter) py-8 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface p-5 shadow-(--shadow-lift)">
          <h2 className="mb-2.5 text-[17px] font-semibold">{t("Respuestas · últimos 14 días")}</h2>
          <TrendChart days={trend} label={trendLabel(trend)} />
          {peak.n > 0 && <p className="mt-2 text-[13px] text-ink-2 tabular-nums">{t("Máximo: {a} · {b}", { a: peak.n, b: fmtDay(peak.day) })}</p>}
        </section>
        <section className="rounded-xl border border-line bg-surface p-5 shadow-(--shadow-lift)">
          <h2 className="mb-2.5 text-[17px] font-semibold">{t("Actividad reciente")}</h2>
          {activity.length === 0 ? <p className="text-sm text-ink-2">{t("Aún no hay respuestas.")}</p> : (
            <ol className="space-y-2.5">
              {activity.map((a, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-1.5 flex shrink-0"><Dot family={familyOf(a.method)} size="h-2 w-2" /></span>
                  <span className="min-w-0 flex-1">{t("Nueva respuesta en")} <Link to={`/studies/${a.study_id}/results`} className="focus-ring rounded font-medium underline-offset-2 hover:underline">{a.study_title}</Link></span>
                  <span className="shrink-0 text-xs text-ink-2">{timeAgo(a.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="rounded-xl border border-line bg-surface p-5 shadow-(--shadow-lift)">
          <h2 className="mb-1.5 text-[17px] font-semibold">{t("Resumen")}</h2>
          <dl className="divide-y divide-line text-sm">
            {summary.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-ink-2">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
