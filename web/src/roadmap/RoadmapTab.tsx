// The roadmap of a project: milestones and, optionally, studies on a timeline, with a read-only link to share it.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Copy, Share2 } from "lucide-react";
import { api } from "../lib/api";
import { copy, useLoad, usePref } from "../lib/hooks";
import { canEdit as roleCanEdit } from "../lib/roles";
import { plural, t } from "../lib/i18n";
import { Button, ErrorNote } from "../components/ui";
import { Skeleton } from "../tickets/parts";
import { Timeline, TimelineControls, dateRange, kindLabel, milestoneItem, type BarKind, type TimelineGroup, type TimelineItem } from "./parts";
import type { RoadmapData, RoadmapStudy, Zoom } from "./model";

/** A study as a timeline item. Response counts and links are left out where the viewer is not signed in. */
export function studyItem(s: RoadmapStudy, linked: boolean): TimelineItem {
  const range = dateRange(s.begin_date, s.end_date, false);
  const sub = s.responses === undefined ? range : `${range} · ${plural(s.responses, { one: "{n} respuesta", other: "{n} respuestas" })}`;
  return { id: s.id, name: s.title, sub, begin: s.begin_date, end: s.end_date, kind: s.status, text: s.status === "live" ? t("Activo") : t("Cerrado"),
    label: `${s.title}: ${kindLabel(s.status)}, ${sub}`, to: linked ? `/studies/${s.id}/results` : undefined };
}
export const MILESTONE_KINDS: BarKind[] = ["on_track", "at_risk", "done", "planned"];

export function RoadmapTab({ projectId }: { projectId: string }) {
  const load = useLoad(() => api.get<RoadmapData>(`/projects/${projectId}/roadmap`), [projectId]);
  const [zoom, setZoom] = useState<Zoom>("month");
  const [shift, setShift] = useState(0);
  const [studies, setStudies] = usePref("rk_roadmap_studies", true);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (load.loading && !load.data) return <div className="flex flex-col gap-3" aria-busy="true" aria-label={t("Cargando hoja de ruta")}><Skeleton className="h-11 max-w-xl" /><Skeleton className="h-72" /></div>;
  if (load.error || !load.data) return <div className="space-y-3"><ErrorNote>{load.error}</ErrorNote><Button onClick={() => load.reload()}>{t("Reintentar")}</Button></div>;
  const d = load.data, canEdit = roleCanEdit(d.role);
  const link = d.share_token ? `${location.origin}/rm/${d.share_token}` : "";
  const share = async (on: boolean) => {
    setError(null);
    try { const r = on ? await api.post<{ share_token: string | null }>(`/projects/${projectId}/roadmap/share`) : await api.del<{ share_token: string | null }>(`/projects/${projectId}/roadmap/share`); load.setData({ ...d, share_token: r.share_token }); }
    catch (e) { setError((e as Error).message); }
  };
  const groups: TimelineGroup[] = [
    { id: "milestones", title: t("Hitos"), items: d.milestones.map((m) => milestoneItem(m, `/projects/${projectId}?tab=tickets&milestone=${m.id}`)) },
    ...(studies ? [{ id: "studies", title: t("Estudios"), items: d.studies.map((s) => studyItem(s, true)) }] : []),
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TimelineControls zoom={zoom} setZoom={setZoom} shift={shift} setShift={setShift} kinds={[...MILESTONE_KINDS, ...(studies ? (["live", "closed"] as BarKind[]) : [])]}>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" checked={studies} onChange={(e) => setStudies(e.target.checked)} className="h-4 w-4 accent-(--color-accent)" />{t("Mostrar estudios")}</label>
        </TimelineControls>
        <div className="flex flex-wrap gap-2">
          {(canEdit || d.share_token) && <Button size="lg" icon={<Share2 size={15} />} aria-expanded={sharing} onClick={() => setSharing(!sharing)}>{t("Compartir")}</Button>}
          {d.project.organization_id && <Link to={`/orgs/${d.project.organization_id}/roadmap`} className="focus-ring inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-5 text-[15px] font-medium hover:border-line-2"><Building2 size={15} aria-hidden />{t("Hoja de ruta de la organización")}</Link>}
        </div>
      </div>
      {sharing && (
        <section aria-label={t("Compartir hoja de ruta")} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface px-5 py-4">
          {d.share_token ? (
            <>
              <p className="text-sm font-bold">{t("El link de solo lectura está activo")}</p>
              <p className="text-[13px] text-ink-3">{t("Cualquier persona con el link puede ver este hoja de ruta. No ve tickets, comentarios ni respuestas.")}</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-ink-2">{t("Link para compartir")}
                  <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} className="field min-h-11 min-w-56 text-[13px]" /></label>
                <Button size="lg" icon={<Copy size={14} />} onClick={async () => { await copy(link); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? t("Link copiado") : t("Copiar link")}</Button>
                {canEdit && <Button size="lg" className="text-bad" onClick={() => void share(false)}>{t("Revocar link")}</Button>}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-bold">{t("Este hoja de ruta no se comparte")}</p>
              <p className="text-[13px] text-ink-3">{t("Crea un link de solo lectura para quien no tiene cuenta. Verá los hitos con su avance y los estudios con sus fechas; nunca tickets, comentarios ni respuestas.")}</p>
              <div><Button size="lg" variant="primary" onClick={() => void share(true)}>{t("Crear link de solo lectura")}</Button></div>
            </>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
        </section>
      )}
      <Timeline groups={groups} zoom={zoom} shift={shift} />
    </div>
  );
}
