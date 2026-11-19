// Milestones of a project: one card each, with progress taken from its tickets.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Flag, Map as MapIcon, Pencil, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { canEdit as roleCanEdit, isOwner as roleIsOwner } from "../lib/roles";
import { plural, t } from "../lib/i18n";
import type { ProjectRole } from "../lib/types";
import { Button, Empty, ErrorNote } from "../components/ui";
import { STATUSES, isoDay } from "../tickets/model";
import { Skeleton, StatusChip } from "../tickets/parts";
import { MilestoneDialog, StateChip, dateRange, noteText } from "./parts";
import type { Milestone } from "./model";

export function MilestonesTab({ projectId, onCount, onRoadmap }: { projectId: string; onCount?: (n: number) => void; onRoadmap: () => void }) {
  const load = useLoad(() => api.get<{ milestones: Milestone[]; role: ProjectRole }>(`/projects/${projectId}/milestones`), [projectId]);
  const [editing, setEditing] = useState<Milestone | "new" | null>(null);
  const list = load.data?.milestones ?? [];
  useEffect(() => { if (load.data) onCount?.(load.data.milestones.length); }, [load.data, onCount]);
  const canEdit = roleCanEdit(load.data?.role), today = isoDay(new Date());
  // Open work first (the one that ends soonest on top), finished milestones at the end.
  const ordered = [...list.filter((m) => m.state !== "done"), ...list.filter((m) => m.state === "done")];

  if (load.loading && !load.data) return <div className="flex flex-col gap-3.5" aria-busy="true" aria-label={t("Cargando hitos")}><Skeleton className="h-36" /><Skeleton className="h-36" /></div>;
  if (load.error) return <div className="space-y-3"><ErrorNote>{load.error}</ErrorNote><Button onClick={() => load.reload()}>{t("Reintentar")}</Button></div>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-ink-3">{t("El avance sale de los tickets de cada hito. Un hito está en riesgo cuando tiene tickets sin asignar o vencidos.")}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" icon={<MapIcon size={15} />} onClick={onRoadmap}>{t("Ver en la hoja de ruta")}</Button>
          {canEdit && <Button size="lg" variant="primary" icon={<Plus size={16} />} onClick={() => setEditing("new")}>{t("Nuevo hito")}</Button>}
        </div>
      </div>
      {list.length === 0 ? (
        <Empty icon={<Flag size={20} />} title={t("Aún no hay hitos")} text={t("Agrupa tickets en entregas con fecha para ver su avance aquí y en la hoja de ruta.")}
          action={canEdit ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing("new")}>{t("Crear un hito")}</Button> : undefined} />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {ordered.map((m) => {
            const note = noteText(m, today);
            return (
              <li key={m.id} className="relative flex flex-col gap-3.5 rounded-2xl border border-line bg-surface px-6 py-5 hover:bg-paper">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link to={`?tab=tickets&milestone=${m.id}`} className="text-[17px] font-bold outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-accent">{m.name}</Link>
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 tabular-nums"><Calendar size={14} aria-hidden />{dateRange(m.begin_date, m.end_date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StateChip state={m.state} />
                    {canEdit && <button type="button" onClick={() => setEditing(m)} aria-label={t("Editar hito {a}", { a: m.name })} className="focus-ring relative z-10 flex h-11 w-11 items-center justify-center rounded-[10px] text-ink-3 hover:bg-ink/5 hover:text-ink"><Pencil size={15} /></button>}
                  </div>
                </div>
                <div className="flex items-center gap-3.5">
                  <span role="img" aria-label={t("{n}% completo", { n: m.progress })} className="h-2 flex-1 overflow-hidden rounded bg-ink/[0.08]"><span className="block h-2 rounded bg-chart-1" style={{ width: `${m.progress}%` }} /></span>
                  <span className="text-[13px] font-bold tabular-nums">{plural(m.total, { one: "{a} de {n} hecho · {c}%", other: "{a} de {n} hechos · {c}%" }, { a: m.done, c: m.progress })}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex flex-wrap gap-3.5">
                    {STATUSES.filter((s) => m[s] > 0).map((s) => <span key={s} className="inline-flex items-center gap-1.5 text-xs"><StatusChip status={s} /><span className="font-bold tabular-nums">{m[s]}</span></span>)}
                    {m.total === 0 && <span className="text-xs text-ink-3">{t("Aún sin tickets.")}</span>}
                  </span>
                  {note && <span className="text-[13px] font-semibold text-ink-2 tabular-nums">{note}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <MilestoneDialog projectId={projectId} milestone={editing === "new" ? undefined : editing} canDelete={roleIsOwner(load.data?.role)} onClose={() => setEditing(null)} onSaved={() => void load.reload()} />}
    </div>
  );
}
