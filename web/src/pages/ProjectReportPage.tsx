import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import type { Answer, Insight, Session } from "../lib/types";
import type { Block } from "../blocks/types";
import { BlockResults, KeyFindings, Overview } from "../components/ReportBody";
import { ProjectReportPdf, ReportPdfButton } from "../components/ReportPdf";
import { ErrorNote, Spinner } from "../components/ui";
import { Logo } from "../components/Logo";
import { templateByKey } from "../templates/catalog";
import type { StudySettings } from "../lib/settings";

import { LangSwitch, locale, t } from "../lib/i18n";

interface StudyReport {
  study: { id: string; title: string; method: string; status: string; blocks: Block[]; settings?: StudySettings; published_at: string | null };
  sessions: Session[]; answers: Answer[]; insights: Insight[];
}
interface Report { project: { name: string; color: string }; reports: StudyReport[] }

export function ProjectReportPage() {
  const { token } = useParams();
  const { data, error, loading } = useLoad(() => api.get<Report>(`/public/project-reports/${token}`), [token]);
  if (loading) return <Spinner />;
  if (error || !data) return <div className="mx-auto max-w-lg p-10"><ErrorNote>{t("Este reporte no existe o el link fue revocado.")}</ErrorNote></div>;
  const { project, reports } = data;

  return (
    <div className="min-h-full bg-paper-2">
      <header className="border-b border-line bg-surface">
        <div className="flex items-center justify-between px-(--page-gutter) py-4">
          <Logo />
          <span className="flex items-center gap-3"><LangSwitch />
          <ReportPdfButton size="sm" variant="primary" label={t("Descargar PDF")} title={project.name}
            content={<ProjectReportPdf projectName={project.name} projectColor={project.color} reports={reports} />} /></span>
        </div>
      </header>
      <div className="page">
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: project.color }} />{project.name}
          <span className="text-ink-3">· {t("{a} estudios", { a: reports.length })}</span>
        </p>
        <h1 className="display mt-2 text-5xl leading-tight sm:text-6xl">{t("Reporte de proyecto")}</h1>

        {reports.map((r, i) => {
          return (
            <section key={r.study.id} className={i === 0 ? "mt-14" : "mt-20 border-t border-line pt-14"}>
              <p className="text-sm text-ink-3">{templateByKey(r.study.method)?.name ?? r.study.method}</p>
              <h2 className="display mt-1 text-4xl leading-tight">{r.study.title}</h2>
              {r.study.published_at && <p className="mt-2 text-sm text-ink-3">{t("Publicado el")} {new Date(r.study.published_at).toLocaleDateString(locale(), { dateStyle: "long" })}</p>}

              <div className="mt-8"><Overview sessions={r.sessions} /></div>

              {r.insights.length > 0 && (
                <div className="mt-12">
                  <h3 className="display mb-4 text-2xl">{t("Hallazgos clave")}</h3>
                  <KeyFindings insights={r.insights} heading="h4" />
                </div>
              )}

              <div className="mt-12">
                <h3 className="display mb-4 text-2xl">{t("Resultados por pregunta")}</h3>
                <BlockResults blocks={r.study.blocks} sessions={r.sessions} answers={r.answers} settings={r.study.settings} />
              </div>
            </section>
          );
        })}
        <p className="mt-16 text-center text-xs text-ink-3">{t("Reporte generado con Redekorate · datos de participantes anonimizados")}</p>
      </div>
    </div>
  );
}
