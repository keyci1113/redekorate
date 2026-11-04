import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BarChart3, Copy, FlaskConical, MoreHorizontal, Pencil, PenLine, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo, useLoad } from "../lib/hooks";
import type { Insight, Project, Study } from "../lib/types";
import { Button, Empty, ErrorNote, Modal, Spinner, StatusBadge, Tabs } from "../components/ui";
import { ProjectForm } from "../components/ProjectForm";
import { InsightsPanel } from "../components/InsightsPanel";
import { DocsPanel } from "../components/DocsPanel";
import type { DocRecord } from "../docs/types";
import { templateByKey } from "../templates/catalog";
import { CATEGORY_ICON, FallbackIcon } from "../templates/icons";

import { t } from "../lib/i18n";
export function ProjectPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"studies" | "docs" | "insights">(params.get("tab") === "insights" ? "insights" : params.get("tab") === "docs" ? "docs" : "studies");
  const [editOpen, setEditOpen] = useState(false);
  const project = useLoad(() => api.get<{ project: Project }>(`/projects/${id}`), [id]);
  const studies = useLoad(() => api.get<{ studies: Study[] }>(`/projects/${id}/studies`), [id]);
  const insights = useLoad(() => api.get<{ insights: Insight[] }>(`/projects/${id}/insights`), [id]);
  const docs = useLoad(() => api.get<{ documents: DocRecord[] }>(`/documents?project_id=${id}`), [id]);

  if (project.loading) return <Spinner />;
  if (project.error || !project.data) return <div className="p-10"><ErrorNote>{project.error}</ErrorNote></div>;
  const p = project.data.project;
  const list = studies.data?.studies ?? [];

  async function removeProject() {
    if (!confirm(t("¿Eliminar \"{a}\" con todos sus estudios, respuestas e insights? Esta acción no se puede deshacer.", { a: p.name }))) return;
    await api.del(`/projects/${p.id}`);
    nav("/projects");
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link to="/projects" className="text-sm text-ink-3 hover:text-ink">{t("← Proyectos")}</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded" style={{ background: p.color }} />
            <h1 className="display text-5xl leading-tight">{p.name}</h1>
          </div>
          {p.description && <p className="mt-2 text-[15px] whitespace-pre-line text-ink-2">{p.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon={<Pencil size={15} />} onClick={() => setEditOpen(true)}>{t("Editar")}</Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => nav(`/projects/${p.id}/new`)}>{t("Nuevo estudio")}</Button>
        </div>
      </div>

      <div className="mt-8">
        <Tabs value={tab} onChange={setTab} items={[
          { id: "studies", label: t("Estudios"), count: list.length },
          { id: "docs", label: t("Documentos"), count: docs.data?.documents.length ?? 0 },
          { id: "insights", label: t("Repositorio de insights"), count: insights.data?.insights.length ?? 0 },
        ]} />
      </div>

      <div className="mt-6">
        {tab === "studies" && (studies.loading ? <Spinner /> : list.length === 0 ? (
          <Empty icon={<FlaskConical size={20} />} title={t("Este proyecto aún no tiene estudios")}
            text={t("Elige un template (encuesta, SUS, NPS, screener…) o empieza desde cero.")}
            action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => nav(`/projects/${p.id}/new`)}>{t("Crear estudio")}</Button>} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {list.map((s, i) => <StudyRow key={s.id} s={s} first={i === 0} onChange={() => { studies.reload(); insights.reload(); }} />)}
          </div>
        ))}
        {tab === "docs" && <DocsPanel projectId={p.id} docs={docs.data?.documents ?? []} onChange={docs.reload} preselect={params.get("new")} />}
        {tab === "insights" && (
          <InsightsPanel projectId={p.id} studies={list} insights={insights.data?.insights ?? []} onChange={insights.reload} />
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={t("Editar proyecto")}>
        <ProjectForm initial={p} submitLabel={t("Guardar cambios")} onSubmit={async (v) => {
          await api.patch(`/projects/${p.id}`, v);
          setEditOpen(false); project.reload();
        }} />
        <div className="mt-6 border-t border-line pt-4">
          <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" icon={<Trash2 size={15} />} onClick={removeProject}>{t("Eliminar proyecto")}</Button>
        </div>
      </Modal>
    </div>
  );
}

function StudyRow({ s, first, onChange }: { s: Study; first: boolean; onChange: () => void }) {
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const tpl = templateByKey(s.method);
  return (
    <div className={`group relative flex items-center gap-4 px-5 py-4 transition hover:bg-paper/50 ${first ? "" : "border-tpl border-line"}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper text-ink-2 ring-1 ring-line">
        {tpl ? CATEGORY_ICON[tpl.category] : FallbackIcon}
      </span>
      <Link to={s.status === "draft" ? `/studies/${s.id}/edit` : `/studies/${s.id}/results`} className="min-w-0 flex-1 focus-ring rounded">
        <p className="truncate font-medium">{s.title}</p>
        <p className="mt-0.5 text-xs text-ink-3">{tpl?.name ?? s.method} · {s.block_count} {t("bloques · editado")} {timeAgo(s.updated_at)}</p>
      </Link>
      <div className="hidden w-24 text-right sm:block">
        <p className="font-semibold tabular-nums">{s.response_count}</p>
        <p className="text-[11px] text-ink-3">{t("respuestas")}</p>
      </div>
      <div className="w-20"><StatusBadge status={s.status} /></div>
      <div className="flex gap-1">
        <Link to={`/studies/${s.id}/edit`} title={t("Editar")} className="focus-ring rounded-md p-2 text-ink-3 hover:bg-ink/5 hover:text-ink"><PenLine size={16} /></Link>
        <Link to={`/studies/${s.id}/results`} title={t("Resultados")} className="focus-ring rounded-md p-2 text-ink-3 hover:bg-ink/5 hover:text-ink"><BarChart3 size={16} /></Link>
        <button onClick={() => setMenu(!menu)} onBlur={() => setTimeout(() => setMenu(false), 150)} title={t("Más")} className="focus-ring rounded-md p-2 text-ink-3 hover:bg-ink/5 hover:text-ink"><MoreHorizontal size={16} /></button>
      </div>
      {menu && (
        <div className="absolute top-12 right-4 z-20 w-44 rounded-lg border border-line bg-surface p-1 shadow-lg">
          <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-paper" onClick={async () => {
            const { study } = await api.post<{ study: Study }>(`/studies/${s.id}/duplicate`);
            nav(`/studies/${study.id}/edit`);
          }}><Copy size={14} /> {t("Duplicar")}</button>
          <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-bad hover:bg-bad-soft" onClick={async () => {
            if (!confirm(t("¿Eliminar \"{a}\" y todas sus respuestas?", { a: s.title }))) return;
            await api.del(`/studies/${s.id}`); onChange();
          }}><Trash2 size={14} /> {t("Eliminar")}</button>
        </div>
      )}
    </div>
  );
}
