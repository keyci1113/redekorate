import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import type { Answer, Insight, Session, Severity } from "../lib/types";
import type { Block } from "../blocks/types";
import { BlockResults, Overview } from "../components/ReportBody";
import { Button, Card, ErrorNote, SeverityBadge, Spinner, Tag } from "../components/ui";
import { Logo } from "../components/Logo";
import { templateByKey } from "../templates/catalog";
import type { StudySettings } from "../lib/settings";

import { LangSwitch, locale, t } from "../lib/i18n";

interface StudyReport {
  study: { id: string; title: string; method: string; status: string; blocks: Block[]; settings?: StudySettings; published_at: string | null };
  sessions: Session[]; answers: Answer[]; insights: Insight[];
}
interface Report { project: { name: string; color: string }; reports: StudyReport[] }
const ORDER: Severity[] = ["critical", "high", "medium", "low"];

export function ProjectReportPage() {
  const { token } = useParams();
  const { data, error, loading } = useLoad(() => api.get<Report>(`/public/project-reports/${token}`), [token]);
  if (loading) return <Spinner />;
  if (error || !data) return <div className="mx-auto max-w-lg p-10"><ErrorNote>{t("Este reporte no existe o el link fue revocado.")}</ErrorNote></div>;
  const { project, reports } = data;

  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-surface">
        <div className="flex items-center justify-between px-(--page-gutter) py-4">
          <Logo />
          <span className="flex items-center gap-3"><LangSwitch />
          <Button size="sm" variant="ghost" icon={<Printer size={15} />} onClick={() => window.print()}>{t("Imprimir / PDF")}</Button></span>
        </div>
      </header>
      <div className="px-(--page-gutter) py-12">
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: project.color }} />{project.name}
          <span className="text-ink-3">· {t("{a} estudios", { a: reports.length })}</span>
        </p>
        <h1 className="display mt-2 text-5xl leading-tight sm:text-6xl">{t("Reporte de proyecto")}</h1>

        {reports.map((r, i) => {
          const sorted = [...r.insights].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
          return (
            <section key={r.study.id} className={i === 0 ? "mt-14" : "mt-20 border-t border-line pt-14"}>
              <p className="text-sm text-ink-3">{templateByKey(r.study.method)?.name ?? r.study.method}</p>
              <h2 className="display mt-1 text-4xl leading-tight">{r.study.title}</h2>
              {r.study.published_at && <p className="mt-2 text-sm text-ink-3">{t("Publicado el")} {new Date(r.study.published_at).toLocaleDateString(locale(), { dateStyle: "long" })}</p>}

              <div className="mt-8"><Overview sessions={r.sessions} /></div>

              {sorted.length > 0 && (
                <div className="mt-12">
                  <h3 className="display text-2xl">{t("Hallazgos clave")}</h3>
                  <div className="mt-4 space-y-3">
                    {sorted.map((ins, n) => (
                      <Card key={ins.id} className="flex gap-4 p-5">
                        <span className="display w-8 shrink-0 text-3xl leading-none text-ink-3">{n + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold">{ins.title}</h4>
                            <SeverityBadge severity={ins.severity} />
                          </div>
                          {ins.body && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{ins.body}</p>}
                          {ins.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{ins.tags.map((tag) => <Tag key={tag}>#{tag}</Tag>)}</div>}
                        </div>
                      </Card>
                    ))}
                  </div>
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
