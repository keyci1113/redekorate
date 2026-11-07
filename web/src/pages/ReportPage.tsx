import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import type { Answer, Insight, Session } from "../lib/types";
import type { Block } from "../blocks/types";
import { BlockResults, KeyFindings, Overview } from "../components/ReportBody";
import { ReportPdfButton, StudyReportPdf } from "../components/ReportPdf";
import { ErrorNote, Spinner } from "../components/ui";
import { Logo } from "../components/Logo";
import { templateByKey } from "../templates/catalog";
import type { StudySettings } from "../lib/settings";

import { LangSwitch, getLang, locale, t, useLang } from "../lib/i18n";
import { useEffect, useRef } from "react";
interface Report {
  study: { title: string; method: string; status: string; blocks: Block[]; settings?: StudySettings; published_at: string | null; project_name: string; project_color: string };
  sessions: Session[]; answers: Answer[]; insights: Insight[];
}

export function ReportPage() {
  const { token } = useParams();
  const { data, error, loading } = useLoad(() => api.get<Report>(`/public/reports/${token}`), [token]);
  const { setLang } = useLang();
  const applied = useRef(sessionStorage.getItem("rk_report_lang") === "1");
  useEffect(() => {
    const l = data?.study.settings?.language;
    if (l && !applied.current) { sessionStorage.setItem("rk_report_lang", "1"); applied.current = true; if (l !== getLang()) setLang(l, false); }
  }, [data, setLang]);
  if (loading) return <Spinner />;
  if (error || !data) return <div className="mx-auto max-w-lg p-10"><ErrorNote>{t("Este reporte no existe o el link fue revocado.")}</ErrorNote></div>;
  const { study, sessions, answers, insights } = data;

  return (
    <div className="min-h-full bg-paper-2">
      <header className="border-b border-line bg-surface">
        <div className="flex items-center justify-between px-(--page-gutter) py-4">
          <Logo />
          <span className="flex items-center gap-3"><LangSwitch />
          <ReportPdfButton size="sm" variant="primary" label={t("Descargar PDF")} title={study.title}
            content={<StudyReportPdf r={{ study, sessions, answers, insights }} projectName={study.project_name} projectColor={study.project_color} />} /></span>
        </div>
      </header>
      <div className="page">
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: study.project_color }} />{study.project_name}
          <span className="text-ink-3">· {templateByKey(study.method)?.name ?? study.method}</span>
        </p>
        <h1 className="display mt-2 text-5xl leading-tight sm:text-6xl">{study.title}</h1>
        {study.published_at && <p className="mt-2 text-sm text-ink-3">{t("Publicado el")} {new Date(study.published_at).toLocaleDateString(locale(), { dateStyle: "long" })}</p>}

        <div className="mt-10"><Overview sessions={sessions} /></div>

        {insights.length > 0 && (
          <section className="mt-14">
            <h2 className="display mb-5 text-3xl">{t("Hallazgos clave")}</h2>
            <KeyFindings insights={insights} />
          </section>
        )}

        <section className="mt-14">
          <h2 className="display mb-5 text-3xl">{t("Resultados por pregunta")}</h2>
          <BlockResults blocks={study.blocks} sessions={sessions} answers={answers} settings={study.settings} />
        </section>
        <p className="mt-16 text-center text-xs text-ink-3">{t("Reporte generado con Redekorate · datos de participantes anonimizados")}</p>
      </div>
    </div>
  );
}
