import { Link, useNavigate } from "react-router-dom";
import { Activity, ArrowRight, FolderPlus, Lightbulb, PenLine, Radio, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo, useLoad } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import type { Severity } from "../lib/types";
import { Button, Card, Empty, ErrorNote, SeverityBadge, Spinner } from "../components/ui";
import { templateByKey } from "../templates/catalog";

import { locale, t } from "../lib/i18n";
interface Dash {
  totals: { projects: number; studies: number; live: number; responses: number; responses_week: number; insights: number };
  trend: { day: string; n: number }[];
  live: { id: string; title: string; method: string; project_name: string; project_color: string; responses: number; started: number; last_response_at: string | null }[];
  drafts: { id: string; title: string; method: string; updated_at: string; project_name: string; project_color: string }[];
  activity: { at: string; study_id: string; study_title: string; project_color: string }[];
  insights: { id: string; title: string; severity: Severity; created_at: string; project_id: string; project_name: string }[];
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? t("Buenos días") : h < 19 ? t("Buenas tardes") : t("Buenas noches");
}

export function DashboardPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, error, loading } = useLoad(() => api.get<Dash>("/dashboard"), []);
  if (loading) return <Spinner />;
  if (error || !data) return <div className="p-10"><ErrorNote>{error}</ErrorNote></div>;
  const { totals, trend, live, drafts, activity, insights } = data;
  const maxT = Math.max(1, ...trend.map((t) => t.n));

  if (totals.projects === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="label">{greeting()}, {user?.name.split(" ")[0]}</p>
        <h1 className="display mt-2 text-5xl leading-tight">{t("Bienvenida a redekorate")}</h1>
        <p className="mt-3 text-[15px] text-ink-2">{t("Tu espacio para planear, lanzar y analizar investigación de UX. Así funciona:")}</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[["1", t("Crea un proyecto"), t("Agrupa estudios por producto o cliente.")], ["2", t("Elige un método"), t("Encuestas, card sorting, tree test, first click, preference test…")], ["3", t("Comparte y analiza"), t("Envía un link, mira resultados en vivo y comparte un reporte.")]].map(([n, t, d]) => (
            <Card key={n} className="p-5"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-sm font-semibold text-accent-ink">{n}</span><p className="mt-3 font-semibold">{t}</p><p className="mt-1 text-sm text-ink-3">{d}</p></Card>
          ))}
        </div>
        <Button variant="primary" size="lg" className="mt-8" icon={<FolderPlus size={17} />} onClick={() => nav("/projects?crear=1")}>{t("Crear mi primer proyecto")}</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">{greeting()}, {user?.name.split(" ")[0]}</p>
          <h1 className="display mt-1 text-5xl">{t("Inicio")}</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/projects"><Button>{t("Ver proyectos")}</Button></Link>
          <Button variant="primary" icon={<FolderPlus size={16} />} onClick={() => nav("/projects?crear=1")}>{t("Nuevo proyecto")}</Button>
        </div>
      </div>

      {/* KPIs + tendencia */}
      <div className="mt-8 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1.6fr]">
        {[[t("Estudios activos"), totals.live, t("{a} en total", { a: totals.studies })], [t("Respuestas"), totals.responses, t("{a} esta semana", { a: totals.responses_week })], [t("Insights"), totals.insights, (totals.projects === 1 ? t("en 1 proyecto") : t("en {a} proyectos", { a: totals.projects }))]].map(([l, v, s]) => (
          <Card key={l as string} className="p-4"><p className="label">{l}</p><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{v}</p><p className="mt-0.5 text-xs text-ink-3">{s}</p></Card>
        ))}
        <Card className="p-4">
          <p className="label">{t("Respuestas · últimos 14 días")}</p>
          <div className="mt-3 flex h-16 items-end gap-[2px]">
            {trend.map((t) => (
              <div key={t.day} className="group relative flex h-full flex-1 items-end">
                <div className="w-full rounded-t-[3px] bg-accent/70 transition group-hover:bg-accent" style={{ height: `${(t.n / maxT) * 100}%`, minHeight: t.n ? 3 : 1, opacity: t.n ? 1 : 0.25 }} />
                <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded bg-ink px-1.5 py-0.5 text-[10px] whitespace-nowrap text-paper opacity-0 group-hover:opacity-100">
                  {new Date(t.day + "T12:00").toLocaleDateString(locale(), { day: "numeric", month: "short" })}: {t.n}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Radio size={16} className="text-good" /> {t("Estudios activos")}</h2>
            {live.length === 0 ? (
              <Empty icon={<Sparkles size={20} />} title={t("Nada en campo ahora mismo")} text={t("Publica un estudio para empezar a recibir respuestas.")} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {live.map((s) => (
                  <Link key={s.id} to={`/studies/${s.id}/results`} className="focus-ring group rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:shadow-lg hover:shadow-accent/5">
                    <p className="flex items-center gap-1.5 text-xs text-ink-3"><span className="h-2 w-2 rounded-sm" style={{ background: s.project_color }} />{s.project_name}</p>
                    <p className="mt-1 font-semibold leading-snug">{s.title}</p>
                    <p className="text-xs text-ink-3">{templateByKey(s.method)?.name ?? s.method}</p>
                    <div className="mt-4 flex items-end justify-between">
                      <div><p className="text-2xl font-semibold tabular-nums">{s.responses}</p><p className="text-[11px] text-ink-3">{t("respuestas")}{s.started > s.responses && t(" · {a} en curso/abandonos", { a: s.started - s.responses })}</p></div>
                      <span className="text-[11px] text-ink-3">{s.last_response_at ? t("última {a}", { a: timeAgo(s.last_response_at) }) : t("sin respuestas aún")}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
          {drafts.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-semibold"><PenLine size={16} className="text-ink-3" /> {t("Borradores para continuar")}</h2>
              <Card className="divide-y divide-line">
                {drafts.map((d) => (
                  <Link key={d.id} to={`/studies/${d.id}/edit`} className="group flex items-center gap-3 px-4 py-3 hover:bg-paper/50">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: d.project_color }} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{d.title}</span><span className="text-xs text-ink-3">{d.project_name} · {templateByKey(d.method)?.name} {t("· editado")} {timeAgo(d.updated_at)}</span></span>
                    <ArrowRight size={15} className="text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-accent" />
                  </Link>
                ))}
              </Card>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Activity size={16} className="text-accent" /> {t("Actividad reciente")}</h2>
            <Card className="p-4">
              {activity.length === 0 ? <p className="py-4 text-center text-sm text-ink-3">{t("Aún no hay respuestas.")}</p> : (
                <ol className="space-y-3">
                  {activity.map((a, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: a.project_color }} />
                      <span className="flex-1">{t("Nueva respuesta en")} <Link to={`/studies/${a.study_id}/results`} className="font-medium hover:text-accent">{a.study_title}</Link></span>
                      <span className="shrink-0 text-xs text-ink-3">{timeAgo(a.at)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </section>
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Lightbulb size={16} className="text-warn" /> {t("Insights recientes")}</h2>
            <Card className="divide-y divide-line">
              {insights.length === 0 ? <p className="p-6 text-center text-sm text-ink-3">{t("Registra hallazgos desde los resultados de cada estudio.")}</p> : insights.map((i) => (
                <Link key={i.id} to={`/projects/${i.project_id}?tab=insights`} className="block px-4 py-3 hover:bg-paper/50">
                  <p className="text-sm font-medium leading-snug">{i.title}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-ink-3"><SeverityBadge severity={i.severity} /> {i.project_name} · {timeAgo(i.created_at)}</p>
                </Link>
              ))}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
