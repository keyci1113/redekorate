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

import { LangSwitch, getLang, locale, t, useLang } from "../lib/i18n";
import { useEffect, useRef } from "react";
interface Report {
  study: { title: string; method: string; status: string; blocks: Block[]; settings?: StudySettings; published_at: string | null; project_name: string; project_color: string };
  sessions: Session[]; answers: Answer[]; insights: Insight[];
}
const ORDER: Severity[] = ["critical", "high", "medium", "low"];

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
  const sorted = [...insights].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));

  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Logo />
          <span className="flex items-center gap-3"><LangSwitch />
          <Button size="sm" variant="ghost" icon={<Printer size={15} />} onClick={() => window.print()}>{t("Imprimir / PDF")}</Button></span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: study.project_color }} />{study.project_name}
          <span className="text-ink-3">· {templateByKey(study.method)?.name ?? study.method}</span>
        </p>
        <h1 className="display mt-2 text-5xl leading-tight sm:text-6xl">{study.title}</h1>
        {study.published_at && <p className="mt-2 text-sm text-ink-3">{t("Publicado el")} {new Date(study.published_at).toLocaleDateString(locale(), { dateStyle: "long" })}</p>}

        <div className="mt-10"><Overview sessions={sessions} /></div>

        {sorted.length > 0 && (
          <section className="mt-14">
            <h2 className="display text-3xl">{t("Hallazgos clave")}</h2>
            <div className="mt-5 space-y-3">
              {sorted.map((i, n) => (
                <Card key={i.id} className="flex gap-4 p-5">
                  <span className="display w-8 shrink-0 text-3xl leading-none text-ink-3">{n + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{i.title}</h3>
                      <SeverityBadge severity={i.severity} />
                    </div>
                    {i.body && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{i.body}</p>}
                    {i.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{i.tags.map((t) => <Tag key={t}>#{t}</Tag>)}</div>}
                  </div>
                </Card>
              ))}
            </div>
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
