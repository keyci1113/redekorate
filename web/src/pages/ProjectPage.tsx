import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BarChart3, Copy, FlaskConical, MoreHorizontal, Pencil, PenLine, Plus, Trash2 } from "lucide-react";
import { canEdit as roleCanEdit, isOwner as roleIsOwner } from "../lib/roles";
import { CommentsPanel } from "../components/CommentsPanel";
import { OrgChip } from "./OrgsPage";
import { api } from "../lib/api";
import { timeAgo, useLoad } from "../lib/hooks";
import type { Insight, OrgAccessMember, Organization, Participant, Project, ProjectMember, ProjectShare, Study } from "../lib/types";
import { hasArea } from "../lib/access";
import { BackLink, Button, Empty, ErrorNote, Modal, Spinner, StatusBadge, Tabs, Tag, cx, type TabItem } from "../components/ui";
import { ProjectForm } from "../components/ProjectForm";
import { InsightsPanel } from "../components/InsightsPanel";
import { TicketsTab } from "../tickets/TicketsTab";
import { MilestonesTab } from "../roadmap/MilestonesTab";
import { RoadmapTab } from "../roadmap/RoadmapTab";
import { DocsPanel } from "../components/DocsPanel";
import { ArchitecturePanel } from "../architecture/ArchitecturePanel";
import { isDiagramKind } from "../architecture/model";
import { FilesPanel } from "../components/FilesPanel";
import { ParticipantsPanel } from "../components/ParticipantsPanel";
import { ReportsPanel } from "../components/ReportsPanel";
import { MembersPanel, sharedLabel } from "../components/MembersPanel";
import type { DocRecord } from "../docs/types";
import { templateByKey } from "../templates/catalog";
import { CATEGORY_ICON, FallbackIcon } from "../templates/icons";

import { t } from "../lib/i18n";
import { AccessNotice } from "../components/AccessNotice";
import { Menu, MenuItem } from "../components/Menu";
import { categoryOf } from "../lib/projectCategories";
export function ProjectPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  type TabId = "studies" | "docs" | "architecture" | "files" | "insights" | "tickets" | "milestones" | "roadmap" | "participants" | "report" | "members" | "comments";
  const TAB_FROM_PARAM = { insights: "insights", docs: "docs", architecture: "architecture", files: "files", tickets: "tickets", milestones: "milestones", roadmap: "roadmap", participants: "participants", report: "report", members: "members", comments: "comments" } as const;
  // The tab lives in the URL, so any view inside it (ticket filters, an open ticket) can be linked, and links between tabs just work.
  const wanted: TabId = (TAB_FROM_PARAM as Record<string, TabId | undefined>)[params.get("tab") ?? ""] ?? "studies";
  const setTab = (next: TabId) => setParams(next === "studies" ? {} : { tab: next }, { replace: true });
  // Counts for the Tickets and Milestones tabs; each tab refreshes its own once it is open.
  const [ticketCount, setTicketCount] = useState<number | undefined>(undefined);
  const [milestoneCount, setMilestoneCount] = useState<number | undefined>(undefined);
  const [fileCount, setFileCount] = useState<number | undefined>(undefined);
  useEffect(() => {
    api.get<{ tickets: unknown[] }>(`/projects/${id}/tickets`).then((r) => setTicketCount(r.tickets.length)).catch(() => {});
    api.get<{ milestones: unknown[] }>(`/projects/${id}/milestones`).then((r) => setMilestoneCount(r.milestones.length)).catch(() => {});
    api.get<{ files: unknown[] }>(`/projects/${id}/files`).then((r) => setFileCount(r.files.length)).catch(() => {});
  }, [id]);
  const [editOpen, setEditOpen] = useState(false);
  const project = useLoad(() => api.get<{ project: Project }>(`/projects/${id}`), [id]);
  const studies = useLoad(() => api.get<{ studies: Study[] }>(`/projects/${id}/studies`), [id]);
  const insights = useLoad(() => api.get<{ insights: Insight[] }>(`/projects/${id}/insights`), [id]);
  const docs = useLoad(() => api.get<{ documents: DocRecord[] }>(`/documents?project_id=${id}`), [id]);
  const participants = useLoad(() => api.get<{ participants: Participant[] }>(`/participants?project_id=${id}`), [id]);
  const shares = useLoad(() => api.get<{ shares: ProjectShare[] }>(`/projects/${id}/shares`), [id]);
  const members = useLoad(() => api.get<{ members: ProjectMember[]; via_org?: OrgAccessMember[] }>(`/projects/${id}/members`), [id]);
  const orgs = useLoad(() => (editOpen ? api.get<{ organizations: Organization[] }>("/orgs") : Promise.resolve({ organizations: [] as Organization[] })), [editOpen]);

  if (project.loading) return <Spinner />;
  if (project.error || !project.data) return <div className="p-10"><ErrorNote>{project.error}</ErrorNote></div>;
  const p = project.data.project;
  const list = studies.data?.studies ?? [];
  // Diagrams and sitemaps are stored as documents but live in their own Architecture tab.
  const allDocs = docs.data?.documents ?? [];
  const uxDocs = allDocs.filter((d) => !isDiagramKind(d.kind)), diagrams = allDocs.filter((d) => isDiagramKind(d.kind));
  const role = p.role;
  // Sections this person can open here; the tabs of the others are not shown.
  const research = hasArea(p.areas, "research"), ticketing = hasArea(p.areas, "tickets");
  const RESEARCH_TABS: TabId[] = ["studies", "docs", "architecture", "insights", "participants", "report"], TICKET_TABS: TabId[] = ["tickets", "milestones", "roadmap"];
  const allowed = (x: TabId) => (RESEARCH_TABS.includes(x) ? research : TICKET_TABS.includes(x) ? ticketing : true);
  const tab: TabId = allowed(wanted) ? wanted : research ? "studies" : ticketing ? "tickets" : "members";
  const canEdit = roleCanEdit(role);
  const isOwner = roleIsOwner(role);

  async function removeProject() {
    if (!confirm(t("¿Eliminar \"{a}\" con todos sus estudios, respuestas e insights? Esta acción no se puede deshacer.", { a: p.name }))) return;
    await api.del(`/projects/${p.id}`);
    nav("/projects");
  }

  return (
    <div className="page">
      <BackLink to="/projects" label={t("Proyectos")} />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl min-w-[min(100%,24rem)] flex-1">
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded" style={{ background: p.color }} />
            <h1 className="page-title">{p.name}</h1>
            {p.organization_id && <OrgChip id={p.organization_id} name={p.org_name ?? ""} logo={p.org_logo} color={p.org_color} />}
            {role && !isOwner && <Tag>{sharedLabel(role, p.owner_name)}</Tag>}
          </div>
          {p.description && <Description text={p.description} />}
        </div>
        {canEdit && <div className="flex shrink-0 gap-2">
          <Button variant="ghost" icon={<Pencil size={15} />} onClick={() => setEditOpen(true)}>{t("Editar")}</Button>
          {research && <Button variant="primary" icon={<Plus size={16} />} onClick={() => nav(`/projects/${p.id}/new`)}>{t("Nuevo estudio")}</Button>}
        </div>}
      </div>
      <AccessNotice role={role} owner={p.owner_name} className="mt-4 max-w-2xl" />

      <div className="mt-8">
        {/* Three groups, in the order work happens: research, project management, then the team's shared space. */}
        <Tabs value={tab} onChange={setTab} label={t("Secciones del proyecto")} items={([
          { id: "studies", group: "research", label: t("Estudios"), count: list.length },
          { id: "docs", group: "research", label: t("Documentos UX"), count: uxDocs.length },
          { id: "architecture", group: "research", label: t("Arquitectura"), count: diagrams.length },
          { id: "insights", group: "research", label: t("Insights"), count: insights.data?.insights.length ?? 0 },
          { id: "participants", group: "research", label: t("Participantes"), count: participants.data?.participants.length ?? 0 },
          { id: "report", group: "research", label: t("Reporte"), count: shares.data?.shares.length ?? 0 },
          { id: "tickets", group: "pm", label: t("Tickets"), count: ticketCount },
          { id: "milestones", group: "pm", label: t("Hitos"), count: milestoneCount },
          { id: "roadmap", group: "pm", label: t("Hoja de ruta") },
          { id: "files", group: "team", label: t("Archivos"), count: fileCount },
          { id: "members", group: "team", label: t("Colaboradores"), count: members.data?.members.length ?? 0 },
          { id: "comments", group: "team", label: t("Comentarios") },
        ] satisfies TabItem<TabId>[]).filter((x) => allowed(x.id))} />
      </div>

      <div className="mt-6">
        {tab === "studies" && (studies.loading ? <Spinner /> : list.length === 0 ? (
          <Empty icon={<FlaskConical size={20} />} title={t("Este proyecto aún no tiene estudios")}
            text={t("Elige un template (encuesta, SUS, NPS, screener…) o empieza desde cero.")}
            action={canEdit ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => nav(`/projects/${p.id}/new`)}>{t("Crear estudio")}</Button> : undefined} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {list.map((s, i) => <StudyRow key={s.id} s={s} first={i === 0} canEdit={canEdit} onChange={() => { studies.reload(); insights.reload(); }} />)}
          </div>
        ))}
        {tab === "docs" && <DocsPanel projectId={p.id} docs={uxDocs} onChange={docs.reload} preselect={params.get("new")} canEdit={canEdit} />}
        {tab === "architecture" && <ArchitecturePanel projectId={p.id} diagrams={diagrams} onChange={docs.reload} canEdit={canEdit} />}
        {tab === "files" && <FilesPanel projectId={p.id} canEdit={canEdit} onCount={setFileCount} />}
        {tab === "insights" && (
          <InsightsPanel projectId={p.id} projectName={p.name} studies={list} insights={insights.data?.insights ?? []} onChange={insights.reload} canEdit={canEdit} />
        )}
        {tab === "milestones" && <MilestonesTab projectId={p.id} onCount={setMilestoneCount} onRoadmap={() => setTab("roadmap")} />}
        {tab === "roadmap" && <RoadmapTab projectId={p.id} />}
        {tab === "tickets" && <TicketsTab projectId={p.id} projectName={p.name} onCount={setTicketCount} onLinksChange={insights.reload} />}
        {tab === "participants" && (
          <ParticipantsPanel projectId={p.id} studies={list} participants={participants.data?.participants ?? []} onChange={participants.reload} canEdit={canEdit} />
        )}
        {tab === "members" && (members.loading ? <Spinner /> : <MembersPanel projectId={p.id} myRole={role ?? "viewer"} members={members.data?.members ?? []} viaOrg={members.data?.via_org ?? []} onChange={members.reload} />)}
        {tab === "comments" && <CommentsPanel projectId={p.id} role={role} />}
        {tab === "report" && (
          <ReportsPanel projectId={p.id} projectName={p.name} projectColor={p.color} studies={list} documents={uxDocs} diagrams={diagrams} hasDescription={!!p.description?.trim()} insightCount={insights.data?.insights.length ?? 0} milestones={ticketing} shares={shares.data?.shares ?? []} onChange={shares.reload} canEdit={canEdit} />
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={t("Editar proyecto")}>
        <ProjectForm initial={{ name: p.name, description: p.description, color: p.color, organization_id: p.organization_id ?? null, category: categoryOf(p) }} orgs={isOwner ? orgs.data?.organizations : undefined} submitLabel={t("Guardar cambios")} onSubmit={async (v) => {
          // Only the owner may move the project; collaborators never send organization_id.
          const { organization_id, ...rest } = v;
          await api.patch(`/projects/${p.id}`, isOwner ? { ...rest, organization_id } : rest);
          setEditOpen(false); project.reload();
        }} />
        {isOwner && <div className="mt-6 border-t border-line pt-4">
          <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" icon={<Trash2 size={15} />} onClick={removeProject}>{t("Eliminar proyecto")}</Button>
        </div>}
      </Modal>
    </div>
  );
}

function StudyRow({ s, first, canEdit, onChange }: { s: Study; first: boolean; canEdit: boolean; onChange: () => void }) {
  const nav = useNavigate();
  const tpl = templateByKey(s.method);
  return (
    <div className={`group relative flex items-center gap-4 px-5 py-4 transition hover:bg-paper/50 ${first ? "" : "border-t border-line"}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper text-ink-2 ring-1 ring-line">
        {tpl ? CATEGORY_ICON[tpl.category] : FallbackIcon}
      </span>
      <Link to={s.status === "draft" && canEdit ? `/studies/${s.id}/edit` : `/studies/${s.id}/results`} className="min-w-0 flex-1 focus-ring rounded">
        <p className="truncate font-medium">{s.title}</p>
        <p className="mt-0.5 text-xs text-ink-3">{tpl?.name ?? s.method} · {s.block_count} {t("bloques · editado")} {timeAgo(s.updated_at)}</p>
      </Link>
      <div className="hidden w-24 text-right sm:block">
        <p className="font-semibold tabular-nums">{s.response_count}</p>
        <p className="text-[11px] text-ink-3">{t("respuestas")}</p>
      </div>
      <div className="w-20"><StatusBadge status={s.status} /></div>
      <div className="flex gap-1">
        {canEdit && <Link to={`/studies/${s.id}/edit`} title={t("Editar")} className="focus-ring rounded-md p-2 text-ink-3 hover:bg-ink/5 hover:text-ink"><PenLine size={16} /></Link>}
        <Link to={`/studies/${s.id}/results`} title={t("Resultados")} className="focus-ring rounded-md p-2 text-ink-3 hover:bg-ink/5 hover:text-ink"><BarChart3 size={16} /></Link>
        {/* The shared Menu: arrow keys move, Escape closes and gives focus back to ⋯. */}
        {canEdit && <Menu label={t("Acciones de «{a}»", { a: s.title })} width={200} button={(props) => (
          <button {...props} title={t("Más")} aria-label={t("Más acciones de «{a}»", { a: s.title })} className="focus-ring rounded-md p-2 text-ink-3 hover:bg-ink/5 hover:text-ink"><MoreHorizontal size={16} /></button>
        )}>
          {(close) => <>
            <MenuItem onSelect={async () => {
              close(false);
              const { study } = await api.post<{ study: Study }>(`/studies/${s.id}/duplicate`);
              nav(`/studies/${study.id}/edit`);
            }}><Copy size={14} aria-hidden /> {t("Duplicar")}</MenuItem>
            <MenuItem danger onSelect={async () => {
              close();
              if (!confirm(t("¿Eliminar \"{a}\" y todas sus respuestas?", { a: s.title }))) return;
              await api.del(`/studies/${s.id}`); onChange();
            }}><Trash2 size={14} aria-hidden /> {t("Eliminar")}</MenuItem>
          </>}
        </Menu>}
      </div>
    </div>
  );
}

/** A project's description: three lines at first, the rest behind "Show more" so a long brief doesn't push the tabs down. */
function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setLong(open || el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);
  return (
    <div className="mt-2">
      <p ref={ref} className={cx("text-[15px] leading-relaxed whitespace-pre-line text-pretty text-ink-2", !open && "line-clamp-3")}>{text}</p>
      {long && <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="focus-ring mt-1 rounded text-sm font-medium text-accent hover:underline">{open ? t("Ver menos") : t("Ver más")}</button>}
    </div>
  );
}
