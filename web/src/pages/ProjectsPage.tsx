import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, FileText, Folder, FolderPlus, Lightbulb, Plus, Share2, UsersRound, type LucideIcon } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo, useLoad } from "../lib/hooks";
import type { Project, Study } from "../lib/types";
import { Button, Empty, ErrorNote, Modal, Spinner, StatusBadge, cx } from "../components/ui";
import { ProjectForm } from "../components/ProjectForm";
import { templateByKey } from "../templates/catalog";
import { useAuth } from "../lib/auth";

import { t } from "../lib/i18n";

const count = (n: number, one: string, many: string) => t(n === 1 ? one : many, { a: n });
const finishedPct = (done = 0, started = 0) => (started > 0 ? Math.round((done / started) * 100) : null);
const studyLink = (s: Study) => (s.status === "draft" ? `/studies/${s.id}/edit` : `/studies/${s.id}/results`);

function ProjectCard({ project: p, on, onSelect }: { project: Project; on: boolean; onSelect: () => void }) {
  const pct = finishedPct(p.response_count, p.started_count);
  return (
    <li className={cx("relative flex min-w-0 flex-col rounded-xl border bg-surface p-5 transition", on ? "border-accent shadow-(--shadow-lift) ring-1 ring-accent" : "border-line hover:border-line-2 hover:shadow-(--shadow-lift)")}>
      <span className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ background: p.color }} aria-hidden><Folder size={19} /></span>
      {/* El botón cubre toda la tarjeta; el enlace de acción queda encima. */}
      <button type="button" aria-current={on || undefined} onClick={onSelect} title={p.name}
        className="focus-ring mt-4 min-w-0 truncate rounded text-left font-display text-[19px] font-bold tracking-[-0.02em] after:absolute after:inset-0 after:rounded-xl">{p.name}</button>
      <p className="mt-1 line-clamp-2 min-h-10 text-[13px] leading-5 text-ink-2">{p.description || t("Sin descripción")}</p>
      <div className="mt-4 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium text-ink-2">{t("Participantes que terminaron")}</span>
        <span className="font-semibold tabular-nums">{pct === null ? "—" : `${pct}%`}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
        {pct !== null && pct > 0 && <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate text-ink-2 tabular-nums">{count(p.study_count ?? 0, "{a} estudio", "{a} estudios")} · {count(p.live_count ?? 0, "{a} activo", "{a} activos")}</span>
        <Link to={`/projects/${p.id}`} className="focus-ring relative z-10 shrink-0 rounded font-semibold text-accent underline-offset-2 hover:underline">{t("Abrir proyecto")}</Link>
      </div>
    </li>
  );
}

function ProjectStudies({ project: p }: { project: Project }) {
  const { data, error, loading } = useLoad(() => api.get<{ studies: Study[] }>(`/projects/${p.id}/studies`), [p.id]);
  const studies = data?.studies ?? [];
  return (
    <section className="min-w-0 rounded-xl border border-line bg-surface shadow-(--shadow-lift)" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h2 className="truncate text-[20px] font-bold">{t("Estudios de {a}", { a: p.name })}</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">{t("Actualizado")} {timeAgo(p.updated_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/projects/${p.id}`} className="focus-ring inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-sm font-medium transition hover:border-line-2">{t("Abrir proyecto")}</Link>
          <Link to={`/projects/${p.id}/new`} className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-on-accent shadow-sm transition hover:-translate-y-px hover:bg-accent/90 active:translate-y-0 motion-reduce:transform-none"><Plus size={15} aria-hidden />{t("Nuevo estudio")}</Link>
        </div>
      </div>
      {loading ? <div className="p-5 pt-0"><Spinner /></div> : error ? <div className="p-5 pt-0"><ErrorNote>{error}</ErrorNote></div> : studies.length === 0 ? (
        <p className="border-t border-line p-5 text-sm text-ink-2">{t("Este proyecto aún no tiene estudios. Crea el primero para empezar a recibir respuestas.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-t border-line text-left text-sm">
            <thead className="text-[13px] text-ink-2">
              <tr className="border-b border-line">
                <th scope="col" className="px-5 py-2.5 font-medium">{t("Estudio")}</th>
                <th scope="col" className="px-3 py-2.5 font-medium">{t("Método")}</th>
                <th scope="col" className="px-3 py-2.5 font-medium">{t("Estado")}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("Terminaron")}</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">{t("Actualizado")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {studies.map((s) => (
                <tr key={s.id} className="transition hover:bg-ink/5">
                  <td className="max-w-72 px-5 py-3"><Link to={studyLink(s)} className="focus-ring block truncate rounded font-semibold underline-offset-2 hover:underline" title={s.title}>{s.title}</Link></td>
                  <td className="max-w-52 truncate px-3 py-3 text-ink-2">{templateByKey(s.method)?.name ?? s.method}</td>
                  <td className="px-3 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-3 py-3 text-right text-ink-2 tabular-nums"><b className="font-semibold text-ink">{s.response_count ?? 0}</b> {t("de {a}", { a: s.started_count ?? 0 })}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap text-ink-2">{timeAgo(s.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProjectContents({ project: p }: { project: Project }) {
  const rows: [LucideIcon, string, number, string][] = [
    [FileText, t("Documentos"), p.document_count ?? 0, "docs"],
    [Lightbulb, t("Insights"), p.insight_count ?? 0, "insights"],
    [UsersRound, t("Participantes"), p.participant_count ?? 0, "participants"],
    [Share2, t("Reportes compartidos"), p.share_count ?? 0, "report"],
  ];
  return (
    <section className="min-w-0 rounded-xl border border-line bg-surface p-5 shadow-(--shadow-lift)">
      <h2 className="text-[20px] font-bold">{t("En este proyecto")}</h2>
      <ul className="mt-3 space-y-2">
        {rows.map(([Icon, label, n, tab]) => (
          <li key={tab}>
            <Link to={`/projects/${p.id}?tab=${tab}`} className="focus-ring group flex items-center gap-3 rounded-lg border border-line p-3 transition hover:border-line-2 hover:bg-ink/5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink" aria-hidden><Icon size={16} /></span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
              <span className="text-sm font-semibold tabular-nums">{n}</span>
              <ArrowRight size={15} aria-hidden className="shrink-0 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink motion-reduce:transform-none" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProjectsPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [open, setOpenState] = useState(params.get("crear") === "1");
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v && params.get("crear")) setParams((prev) => { const next = new URLSearchParams(prev); next.delete("crear"); return next; });
  };
  // "Nuevo proyecto" de la barra superior también funciona si ya estás en esta página.
  useEffect(() => { if (params.get("crear") === "1") setOpenState(true); }, [params]);
  const { data, error, loading } = useLoad(() => api.get<{ projects: Project[] }>("/projects"), []);
  const projects = data?.projects ?? [];
  const totals = projects.reduce((a, p) => ({ studies: a.studies + (p.study_count ?? 0), responses: a.responses + (p.response_count ?? 0), live: a.live + (p.live_count ?? 0) }), { studies: 0, responses: 0, live: 0 });
  const selected = projects.find((p) => p.id === params.get("project")) ?? projects[0];

  return (
    <div className="px-(--page-gutter) py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="display text-[40px]">{t("Proyectos")}</h1>
          <p className="mt-2 text-[15px] text-ink-2 tabular-nums">
            {t("Hola,")} {user?.name.split(" ")[0]}
            {projects.length > 0 && <> · {count(projects.length, "{a} proyecto", "{a} proyectos")} · {count(totals.studies, "{a} estudio", "{a} estudios")} · {count(totals.live, "{a} activo", "{a} activos")} · {count(totals.responses, "{a} respuesta", "{a} respuestas")}</>}
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t("Nuevo proyecto")}</Button>
      </div>

      <div className="mt-7">
        {loading ? <Spinner /> : error ? <ErrorNote>{error}</ErrorNote> : projects.length === 0 ? (
          <Empty icon={<FolderPlus size={20} />} title={t("Crea tu primer proyecto")}
            text={t("Un proyecto agrupa los estudios, respuestas e insights de un producto o cliente.")}
            action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t("Nuevo proyecto")}</Button>} />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {projects.map((p) => <ProjectCard key={p.id} project={p} on={p.id === selected?.id} onSelect={() => setParams({ project: p.id }, { replace: true })} />)}
              <li className="min-h-44">
                <button type="button" onClick={() => setOpen(true)} className="focus-ring flex h-full min-h-44 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line-2 p-5 text-center text-sm font-semibold text-ink-2 transition hover:border-accent hover:text-accent">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/5" aria-hidden><Plus size={18} /></span>
                  {t("Nuevo proyecto")}
                </button>
              </li>
            </ul>
            {selected && (
              <div className="mt-7 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2.4fr)_minmax(280px,1fr)]">
                <ProjectStudies key={selected.id} project={selected} />
                <ProjectContents project={selected} />
              </div>
            )}
          </>
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
