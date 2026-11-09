import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderPlus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLoad } from "../lib/hooks";
import { loadView, saveView, type HomeView } from "../lib/home";
import { t } from "../lib/i18n";
import { Button, Card } from "../components/ui";
import type { Dash, Load } from "../components/home/types";
import { LiveStudies } from "../components/home/LiveStudies";
import { ActivityFeed, DaySummary, HomeHeader, KpiRow, LastOpened, RecentInsights } from "../components/home/Sections";
import { lastStudy } from "../lib/recent";

export function DashboardPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const uid = user?.id ?? "anon";
  const { data, error, loading, reload, setData } = useLoad(() => api.get<Dash>("/dashboard"), []);
  // Preferencia de vista por usuario (no hay preferencias en el backend: localStorage con try/catch)
  const [view, setView] = useState<HomeView>(() => loadView(uid));
  const changeView = (v: HomeView) => { setView(v); saveView(uid, v); };
  const load: Load = { loading: loading && !data, error: data ? null : error, reload };

  const review = useCallback(async (id: string, reviewed: boolean) => {
    await api.patch(`/insights/${id}`, { reviewed });
    // Actualiza en el momento y luego sincroniza los contadores
    setData((d) => d && { ...d, insights: d.insights.map((i) => (i.id === id ? { ...i, reviewed_at: reviewed ? new Date().toISOString() : null } : i)) });
    reload();
  }, [reload, setData]);

  if (data && data.totals.projects === 0) {
    return (
      <div className="page">
        <h1 className="page-title">{t("Bienvenida a redekorate")}</h1>
        <p className="mt-3 text-[0.9375rem] text-ink-2">{t("Tu espacio para planear, lanzar y analizar investigación de UX. Así funciona:")}</p>
        <ol className="mt-8 grid gap-3 sm:grid-cols-3">
          {[["1", t("Crea un proyecto"), t("Agrupa estudios por producto o cliente.")], ["2", t("Elige un método"), t("Encuestas, card sorting, tree test, first click, preference test…")], ["3", t("Comparte y analiza"), t("Envía un link, mira resultados en vivo y comparte un reporte.")]].map(([n, title, d]) => (
            <li key={n}><Card className="h-full p-5"><span className="text-sm font-semibold text-ink-2">{n}</span><p className="mt-2 font-semibold">{title}</p><p className="mt-1 text-sm text-ink-2">{d}</p></Card></li>
          ))}
        </ol>
        <Button variant="primary" size="lg" className="press mt-8" icon={<FolderPlus size={17} />} onClick={() => nav("/projects?crear=1")}>{t("Crear mi primer proyecto")}</Button>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <HomeHeader name={user?.name.split(" ")[0] ?? ""} draft={data?.drafts[0]} loading={load.loading} />
      {(() => { const r = data?.recent ?? lastStudy(); return load.loading ? <div className="h-20 animate-pulse rounded-xl bg-ink/5 motion-reduce:animate-none" aria-hidden /> : r ? <LastOpened recent={r} /> : <DaySummary data={data} load={load} />; })()}
      <KpiRow data={data} load={load} />
      <LiveStudies live={data?.live ?? []} trend={data?.trend ?? []} studyTrend={data?.study_trend ?? []} load={load} view={view} onViewChange={changeView} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <RecentInsights insights={data?.insights ?? []} load={load} firstLive={data?.live[0]?.id} onReview={review} />
        <ActivityFeed data={data} load={load} />
      </div>
    </div>
  );
}
