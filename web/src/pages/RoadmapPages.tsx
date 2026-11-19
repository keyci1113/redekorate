// The roadmap outside a project: the public read-only link (/rm/:token) and the organization roadmap (/orgs/:id/roadmap).
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { t } from "../lib/i18n";
import { ErrorNote, Spinner } from "../components/ui";
import { LogoMark, Wordmark } from "../components/Logo";
import { Timeline, TimelineControls, milestoneItem, type BarKind, type TimelineGroup } from "../roadmap/parts";
import { MILESTONE_KINDS, studyItem } from "../roadmap/RoadmapTab";
import type { Milestone, RoadmapStudy, Zoom } from "../roadmap/model";

type PublicMilestone = Pick<Milestone, "id" | "name" | "begin_date" | "end_date" | "total" | "done" | "state" | "progress">;

export function PublicRoadmapPage() {
  const { token } = useParams();
  const load = useLoad(() => api.get<{ project: { name: string; color: string }; milestones: PublicMilestone[]; studies: RoadmapStudy[] }>(`/public/roadmap/${token}`), [token]);
  const [zoom, setZoom] = useState<Zoom>("month");
  const [shift, setShift] = useState(0);
  if (load.loading) return <Spinner />;
  if (load.error || !load.data) return <div className="mx-auto max-w-xl p-10"><ErrorNote>{t("Este hoja de ruta ya no está disponible. Pide un link nuevo a quien te lo compartió.")}</ErrorNote></div>;
  const d = load.data;
  const groups: TimelineGroup[] = [
    { id: "milestones", title: t("Hitos"), items: d.milestones.map((m) => milestoneItem(m)) },
    ...(d.studies.length ? [{ id: "studies", title: t("Estudios"), items: d.studies.map((s) => studyItem(s, false)) }] : []),
  ];
  return (
    <div className="min-h-full bg-paper-2">
      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-(--page-gutter) py-8">
        <div>
          <p className="text-[13px] text-ink-3">{t("Hoja de ruta · solo lectura")}</p>
          <h1 className="page-title mt-1 flex items-center gap-3"><span aria-hidden className="h-3.5 w-3.5 rounded" style={{ background: d.project.color }} />{d.project.name}</h1>
        </div>
        <TimelineControls zoom={zoom} setZoom={setZoom} shift={shift} setShift={setShift} kinds={[...MILESTONE_KINDS, ...(d.studies.length ? (["live", "closed"] as BarKind[]) : [])]} />
        <Timeline groups={groups} zoom={zoom} shift={shift} />
        <p className="flex items-center gap-1.5 text-xs text-ink-3">{t("Hecho con")} <LogoMark size={13} /><Wordmark height={10} /></p>
      </main>
    </div>
  );
}

export function OrgRoadmapPage() {
  const { id } = useParams();
  const load = useLoad(() => api.get<{ organization: { id: string; name: string }; milestones: Milestone[] }>(`/orgs/${id}/roadmap`), [id]);
  const [zoom, setZoom] = useState<Zoom>("quarter");
  const [shift, setShift] = useState(0);
  if (load.loading) return <Spinner />;
  if (load.error || !load.data) return <div className="p-10"><ErrorNote>{load.error}</ErrorNote></div>;
  const d = load.data;
  const byProject = new Map<string, { name: string; items: Milestone[] }>();
  for (const m of d.milestones) { const g = byProject.get(m.project_id) ?? { name: m.project_name, items: [] }; g.items.push(m); byProject.set(m.project_id, g); }
  const groups: TimelineGroup[] = [...byProject].sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([pid, g]) => ({ id: pid, title: g.name, items: g.items.map((m) => milestoneItem(m, `/projects/${pid}?tab=tickets&milestone=${m.id}`)) }));
  return (
    <div className="page flex flex-col gap-5">
      <div>
        <Link to={`/orgs/${d.organization.id}`} className="text-sm text-ink-3 hover:text-ink">← {d.organization.name}</Link>
        <h1 className="page-title mt-2">{t("Hoja de ruta de la organización")}</h1>
        <p className="mt-2 text-[15px] text-ink-2">{t("Los hitos de todos los proyectos de {a} que puedes abrir.", { a: d.organization.name })}</p>
      </div>
      <TimelineControls zoom={zoom} setZoom={setZoom} shift={shift} setShift={setShift} kinds={MILESTONE_KINDS} />
      {groups.length ? <Timeline groups={groups} zoom={zoom} shift={shift} /> : <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink-3">{t("Ningún proyecto de esta organización tiene hitos todavía.")}</p>}
    </div>
  );
}
