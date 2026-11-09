import { useState } from "react";
import { FileBarChart2, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/hooks";
import type { ProjectShare, Study } from "../lib/types";
import { Button, Card, Empty, Tag } from "./ui";
import { ShareLink } from "../pages/BuilderPage";
import { ProjectReportPdf, ReportPdfButton, type ReportStudy } from "./ReportPdf";

import { t } from "../lib/i18n";
export const projectReportUrl = (token: string) => `${window.location.origin}/pr/${token}`;

export function ReportsPanel({ projectId, projectName, projectColor, studies, shares, onChange, canEdit = true }: {
  projectId: string; projectName: string; projectColor?: string; studies: Pick<Study, "id" | "title">[]; shares: ProjectShare[]; onChange: () => void; canEdit?: boolean;
}) {
  // Trae los resultados de cada estudio y arma el PDF del proyecto
  const pdf = (ids: string[]) => async () => {
    const reports = await Promise.all(ids.map((id) => api.get<ReportStudy>(`/studies/${id}/results`)));
    return <ProjectReportPdf projectName={projectName} projectColor={projectColor} reports={reports} />;
  };
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function create() {
    if (!selected.size) return;
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/shares`, { study_ids: [...selected] });
      setPicking(false); setSelected(new Set()); onChange();
    } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (!confirm(t("¿Revocar este link? Dejará de funcionar de inmediato."))) return;
    await api.del(`/projects/${projectId}/shares/${id}`);
    onChange();
  }

  if (!studies.length) {
    return <Empty icon={<FileBarChart2 size={20} />} title={t("Aún no hay estudios para reportar")} text={t("Crea un estudio primero; luego podrás elegir cuáles incluir en un reporte compartido.")} />;
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <p className="font-semibold">{t("Reporte compartible")}</p>
        <p className="mt-1 text-sm text-ink-2">{t("Elige qué estudios quieres incluir y genera un link público de solo lectura con sus resultados, gráficas e insights.")}</p>

        {!canEdit ? (
          <p className="mt-3 text-sm text-ink-3">{t("Solo editores y dueños crean o revocan links.")}</p>
        ) : !picking ? (
          <Button className="mt-4" variant="primary" icon={<Plus size={15} />} onClick={() => setPicking(true)}>{t("Elegir estudios y crear link")}</Button>
        ) : (
          <div className="mt-4">
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
              {studies.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-paper">
                  <input type="checkbox" className="h-4 w-4 accent-accent" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  {s.title}
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button variant="primary" disabled={!selected.size || busy} onClick={create}>{busy ? t("Creando…") : t("Crear link con {a} estudio(s)", { a: selected.size })}</Button>
              <ReportPdfButton title={projectName} label={t("Solo descargar PDF")} load={pdf([...selected])} />
              <Button variant="ghost" onClick={() => { setPicking(false); setSelected(new Set()); }}>{t("Cancelar")}</Button>
            </div>
          </div>
        )}
      </Card>

      {shares.length > 0 && (
        <div className="space-y-3">
          {shares.map((sh) => (
            <Card key={sh.id} className="p-4">
              <div className="flex flex-wrap gap-1.5">{sh.study_titles.map((title, i) => <Tag key={i}>{title}</Tag>)}</div>
              <div className="mt-2.5"><ShareLink url={projectReportUrl(sh.token)} /></div>
              <div className="mt-2 flex items-center justify-between">
                <span className="flex items-center gap-3"><p className="text-xs text-ink-3">{t("Creado")} {timeAgo(sh.created_at)}</p>
                  <ReportPdfButton size="sm" variant="ghost" title={projectName} label={t("PDF")} load={pdf(sh.study_ids)} /></span>
                {canEdit && <button onClick={() => revoke(sh.id)} className="flex items-center gap-1 text-xs font-medium text-bad hover:underline"><Trash2 size={12} /> {t("Revocar")}</button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
