import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FolderPlus, Plus } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo, useLoad } from "../lib/hooks";
import type { Project } from "../lib/types";
import { Button, Empty, ErrorNote, Modal, Spinner } from "../components/ui";
import { ProjectForm } from "../components/ProjectForm";
import { useAuth } from "../lib/auth";

import { t } from "../lib/i18n";
export function ProjectsPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [open, setOpenState] = useState(params.get("crear") === "1");
  const setOpen = (v: boolean) => { setOpenState(v); if (!v && params.get("crear")) setParams({}); };
  const { data, error, loading } = useLoad(() => api.get<{ projects: Project[] }>("/projects"), []);
  const projects = data?.projects ?? [];
  const totals = projects.reduce((a, p) => ({ studies: a.studies + (p.study_count ?? 0), responses: a.responses + (p.response_count ?? 0), live: a.live + (p.live_count ?? 0) }), { studies: 0, responses: 0, live: 0 });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">{t("Hola,")} {user?.name.split(" ")[0]}</p>
          <h1 className="display mt-1 text-5xl">{t("Proyectos")}</h1>
          {projects.length > 0 && (
            <p className="mt-2 text-sm text-ink-2">{projects.length} {t("proyectos ·")} {totals.studies} {t("estudios ·")} {totals.live} {t("activos ·")} {totals.responses} {t("respuestas")}</p>
          )}
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t("Nuevo proyecto")}</Button>
      </div>

      <div className="mt-10">
        {loading ? <Spinner /> : error ? <ErrorNote>{error}</ErrorNote> : projects.length === 0 ? (
          <Empty icon={<FolderPlus size={20} />} title={t("Crea tu primer proyecto")}
            text={t("Un proyecto agrupa los estudios, respuestas e insights de un producto o cliente.")}
            action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t("Nuevo proyecto")}</Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="focus-ring group relative overflow-hidden rounded-xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/5">
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: p.color }} />
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold leading-snug">{p.name}</h2>
                  {!!p.live_count && <span className="shrink-0 rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-medium text-good">{p.live_count} {t("activo")}{p.live_count > 1 ? "s" : ""}</span>}
                </div>
                <p className="mt-1.5 line-clamp-2 min-h-10 text-sm text-ink-3">{p.description || t("Sin descripción")}</p>
                <div className="mt-5 grid grid-cols-3 border-t border-line pt-4 text-center">
                  {[[t("Estudios"), p.study_count], [t("Respuestas"), p.response_count], [t("Insights"), p.insight_count]].map(([l, v]) => (
                    <div key={l as string}><p className="text-lg font-semibold tabular-nums">{v ?? 0}</p><p className="text-[11px] text-ink-3">{l}</p></div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-ink-3">{t("Actualizado")} {timeAgo(p.updated_at)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("Nuevo proyecto")}>
        <ProjectForm submitLabel={t("Crear proyecto")} onSubmit={async (v) => {
          const { project } = await api.post<{ project: Project }>("/projects", v);
          nav(`/projects/${project.id}/new?nuevo=1`);
        }} />
      </Modal>
    </div>
  );
}
