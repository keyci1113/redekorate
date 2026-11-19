import { useState } from "react";
import { FileBarChart2, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/hooks";
import type { ProjectShare, ReportSection, Study } from "../lib/types";
import type { DocRecord } from "../docs/types";
import { Button, Card, Empty, ErrorNote, Tag } from "./ui";
import { ShareLink } from "../pages/BuilderPage";
import { ProjectReportPdf, ReportPdfButton, type ReportStudy } from "./ReportPdf";
import { plural, t } from "../lib/i18n";

export const projectReportUrl = (token: string) => `${window.location.origin}/pr/${token}`;

const SECTION_LABEL = (): Record<ReportSection, string> => ({ overview: t("Resumen del proyecto"), insights: t("Todos los insights"), milestones: t("Hitos y avance") });

/** One group of checkboxes in the picker, with "all / none" for the group. */
function Group({ title, items, picked, onToggle, onAll }: {
  title: string; items: { id: string; label: string; hint?: string }[]; picked: Set<string>; onToggle: (id: string) => void; onAll: (on: boolean) => void;
}) {
  if (!items.length) return null;
  const all = items.every((i) => picked.has(i.id));
  return (
    <fieldset className="rounded-lg border border-line p-2">
      <legend className="flex w-full items-center justify-between gap-2 px-1 text-xs font-semibold text-ink-3 uppercase">
        <span>{title}</span>
        {items.length > 1 && <button type="button" onClick={() => onAll(!all)} className="focus-ring rounded px-1 text-xs font-medium text-accent normal-case hover:underline">{all ? t("Ninguno") : t("Todos")}</button>}
      </legend>
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {items.map((i) => (
          <label key={i.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-paper">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={picked.has(i.id)} onChange={() => onToggle(i.id)} />
            <span className="min-w-0 flex-1">{i.label}</span>
            {i.hint && <span className="shrink-0 text-xs text-ink-3">{i.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReportsPanel({ projectId, projectName, projectColor, studies, documents, diagrams, hasDescription, insightCount, milestones, shares, onChange, canEdit = true }: {
  projectId: string; projectName: string; projectColor?: string; studies: Pick<Study, "id" | "title">[];
  documents: DocRecord[]; diagrams: DocRecord[]; hasDescription: boolean; insightCount: number; milestones: boolean;
  shares: ProjectShare[]; onChange: () => void; canEdit?: boolean;
}) {
  // The PDF covers the studies' results; documents and diagrams have their own export on each document.
  const pdf = (ids: string[]) => async () => {
    const reports = await Promise.all(ids.map((id) => api.get<ReportStudy>(`/studies/${id}/results`)));
    return <ProjectReportPdf projectName={projectName} projectColor={projectColor} reports={reports} />;
  };
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sections: { id: ReportSection; label: string; hint?: string }[] = [
    ...(hasDescription ? [{ id: "overview" as const, label: SECTION_LABEL().overview }] : []),
    ...(insightCount ? [{ id: "insights" as const, label: SECTION_LABEL().insights, hint: String(insightCount) }] : []),
    ...(milestones ? [{ id: "milestones" as const, label: SECTION_LABEL().milestones }] : []),
  ];
  const key = { section: (id: string) => `section:${id}`, study: (id: string) => `study:${id}`, doc: (id: string) => `doc:${id}` };
  const groups: { title: string; items: { id: string; label: string; hint?: string }[] }[] = [
    { title: t("Proyecto"), items: sections.map((s) => ({ ...s, id: key.section(s.id) })) },
    { title: t("Estudios"), items: studies.map((s) => ({ id: key.study(s.id), label: s.title })) },
    { title: t("Documentos UX"), items: documents.map((d) => ({ id: key.doc(d.id), label: d.title })) },
    { title: t("Arquitectura"), items: diagrams.map((d) => ({ id: key.doc(d.id), label: d.title })) },
  ];
  const nothing = groups.every((g) => !g.items.length);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setAll = (ids: string[], on: boolean) => setPicked((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  const pickedOf = (prefix: string) => [...picked].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  const studyIds = pickedOf("study:");

  async function create() {
    if (!picked.size) return;
    setBusy(true); setErr(null);
    try {
      // Documents keep the order they have on screen: UX documents first, then diagrams.
      const docOrder = [...documents, ...diagrams].map((d) => d.id).filter((id) => picked.has(key.doc(id)));
      await api.post(`/projects/${projectId}/shares`, { study_ids: studyIds, document_ids: docOrder, sections: pickedOf("section:") });
      setPicking(false); setPicked(new Set()); onChange();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (!confirm(t("¿Revocar este link? Dejará de funcionar de inmediato."))) return;
    await api.del(`/projects/${projectId}/shares/${id}`);
    onChange();
  }

  if (nothing) {
    return <Empty icon={<FileBarChart2 size={20} />} title={t("Aún no hay nada para reportar")} text={t("Crea un estudio, un documento o un diagrama; luego podrás elegir qué incluir en un reporte compartido.")} />;
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <p className="font-semibold">{t("Reporte compartible")}</p>
        <p className="mt-1 text-sm text-ink-2">{t("Elige qué partes del proyecto incluir (estudios con sus resultados, documentos UX, diagramas, insights y hitos) y genera un link público de solo lectura.")}</p>

        {!canEdit ? (
          <p className="mt-3 text-sm text-ink-3">{t("Solo editores y dueños crean o revocan links.")}</p>
        ) : !picking ? (
          <Button className="mt-4" variant="primary" icon={<Plus size={15} />} onClick={() => setPicking(true)}>{t("Elegir contenido y crear link")}</Button>
        ) : (
          <div className="mt-4">
            <div className="grid gap-3 md:grid-cols-2">
              {groups.map((g) => <Group key={g.title} title={g.title} items={g.items} picked={picked} onToggle={toggle} onAll={(on) => setAll(g.items.map((i) => i.id), on)} />)}
            </div>
            {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={!picked.size || busy} onClick={create}>
                {busy ? t("Creando…") : picked.size ? plural(picked.size, { one: "Crear link con {n} elemento", other: "Crear link con {n} elementos" }) : t("Elige qué incluir")}
              </Button>
              <Button variant="ghost" onClick={() => setPicked(new Set(groups.flatMap((g) => g.items.map((i) => i.id))))}>{t("Incluir todo el proyecto")}</Button>
              {studyIds.length > 0 && <ReportPdfButton title={projectName} label={t("PDF de los estudios")} load={pdf(studyIds)} />}
              <Button variant="ghost" onClick={() => { setPicking(false); setPicked(new Set()); setErr(null); }}>{t("Cancelar")}</Button>
            </div>
          </div>
        )}
      </Card>

      {shares.length > 0 && (
        <div className="space-y-3">
          {shares.map((sh) => (
            <Card key={sh.id} className="p-4">
              <div className="flex flex-wrap gap-1.5">
                {(sh.sections ?? []).map((s) => <Tag key={s}>{SECTION_LABEL()[s]}</Tag>)}
                {sh.study_titles.map((title, i) => <Tag key={`s${i}`}>{title}</Tag>)}
                {(sh.document_titles ?? []).map((title, i) => <Tag key={`d${i}`}>{title}</Tag>)}
              </div>
              <div className="mt-2.5"><ShareLink url={projectReportUrl(sh.token)} /></div>
              <div className="mt-2 flex items-center justify-between">
                <span className="flex items-center gap-3"><p className="text-xs text-ink-3">{t("Creado")} {timeAgo(sh.created_at)}</p>
                  {sh.study_ids.length > 0 && <ReportPdfButton size="sm" variant="ghost" title={projectName} label={t("PDF de los estudios")} load={pdf(sh.study_ids)} />}</span>
                {canEdit && <button onClick={() => revoke(sh.id)} className="flex items-center gap-1 text-xs font-medium text-bad hover:underline"><Trash2 size={12} /> {t("Revocar")}</button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
