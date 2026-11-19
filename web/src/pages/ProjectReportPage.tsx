import { lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import type { Answer, Insight, Session } from "../lib/types";
import type { Block } from "../blocks/types";
import { BlockResults, KeyFindings, Overview } from "../components/ReportBody";
import { ProjectReportPdf, ReportPdfButton } from "../components/ReportPdf";
import { ErrorNote, Spinner, cx } from "../components/ui";
import { Logo } from "../components/Logo";
import { templateByKey } from "../templates/catalog";
import type { StudySettings } from "../lib/settings";
import type { DocData } from "../docs/types";
import { DocumentView } from "../docs/DocumentView";
import { docTemplate } from "../docs/templates";
import { isDiagramKind, normalizeDiagram } from "../architecture/model";
import { StateChip } from "../roadmap/parts";
import type { MilestoneState } from "../roadmap/model";
import type { Lang } from "../lib/i18n";
// The canvas (React Flow) is only downloaded when the report holds a diagram or sitemap.
const DiagramCanvas = lazy(() => import("../architecture/DiagramCanvas").then((m) => ({ default: m.DiagramCanvas })));
const SitemapEditor = lazy(() => import("../architecture/DiagramPage").then((m) => ({ default: m.SitemapEditor })));

import { LangSwitch, locale, plural, t } from "../lib/i18n";

interface StudyReport {
  study: { id: string; title: string; method: string; status: string; blocks: Block[]; settings?: StudySettings; published_at: string | null };
  sessions: Session[]; answers: Answer[]; insights: Insight[];
}
interface ReportDoc { id: string; kind: string; title: string; language: Lang; data: DocData; updated_at: string }
interface ReportMilestone { id: string; name: string; begin_date: string | null; end_date: string | null; state: MilestoneState; progress: number; total: number; done: number }
interface Report {
  project: { name: string; color: string; description?: string | null; org_name?: string | null; org_logo?: string | null };
  reports: StudyReport[];
  /** Older links hold only studies, so everything below may be missing. */
  documents?: ReportDoc[]; insights?: (Insight & { study_title?: string | null })[] | null; milestones?: ReportMilestone[] | null;
}

const fmtDay = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(locale(), { dateStyle: "medium" }) : "—");

export function ProjectReportPage() {
  const { token } = useParams();
  const { data, error, loading } = useLoad(() => api.get<Report>(`/public/project-reports/${token}`), [token]);
  if (loading) return <Spinner />;
  if (error || !data) return <div className="mx-auto max-w-lg p-10"><ErrorNote>{t("Este reporte no existe o el link fue revocado.")}</ErrorNote></div>;
  const { project, reports } = data;
  const docs = (data.documents ?? []).filter((d) => !isDiagramKind(d.kind) && docTemplate(d.kind));
  const diagrams = (data.documents ?? []).filter((d) => isDiagramKind(d.kind));
  const insights = data.insights ?? [];
  const milestones = data.milestones ?? [];
  // The parts of the report, in reading order; the contents list links to each.
  const parts = [
    project.description ? { id: "overview", label: t("Resumen") } : null,
    reports.length ? { id: "studies", label: t("Estudios ({a})", { a: reports.length }) } : null,
    insights.length ? { id: "insights", label: t("Insights ({a})", { a: insights.length }) } : null,
    docs.length ? { id: "documents", label: t("Documentos UX ({a})", { a: docs.length }) } : null,
    diagrams.length ? { id: "architecture", label: t("Arquitectura ({a})", { a: diagrams.length }) } : null,
    milestones.length ? { id: "milestones", label: t("Hitos ({a})", { a: milestones.length }) } : null,
  ].filter((x): x is { id: string; label: string } => !!x);
  const sectionHead = (id: string, title: string, first: boolean) => (
    <h2 id={id} className={cx("display scroll-mt-6 text-4xl leading-tight", first ? "mt-14" : "mt-20 border-t border-line pt-14")}>{title}</h2>
  );
  const first = parts[0]?.id;

  return (
    <div className="min-h-full bg-paper-2">
      <header className="border-b border-line bg-surface">
        <div className="flex items-center justify-between px-(--page-gutter) py-4">
          <span className="flex items-center gap-3">
            {project.org_logo && <><img src={project.org_logo} alt={project.org_name ?? ""} className="h-8 max-w-40 object-contain" /><span className="h-6 w-px bg-line" aria-hidden /></>}
            <Logo />
          </span>
          <span className="flex items-center gap-3"><LangSwitch />
          {reports.length > 0 && <ReportPdfButton size="sm" variant="primary" label={t("PDF de los estudios")} title={project.name}
            content={<ProjectReportPdf projectName={project.name} projectColor={project.color} reports={reports} />} />}</span>
        </div>
      </header>
      <div className="page">
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: project.color }} />{project.name}
        </p>
        <h1 className="display mt-2 text-5xl leading-tight sm:text-6xl">{t("Reporte de proyecto")}</h1>
        {parts.length > 1 && (
          <nav aria-label={t("Contenido del reporte")} className="mt-6 flex flex-wrap gap-2">
            {parts.map((p) => <a key={p.id} href={`#${p.id}`} className="focus-ring rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-2 hover:border-accent hover:text-ink">{p.label}</a>)}
          </nav>
        )}

        {project.description && (
          <section>
            {sectionHead("overview", t("Resumen"), first === "overview")}
            <p className="mt-6 max-w-3xl text-lg leading-relaxed whitespace-pre-line text-pretty text-ink-2">{project.description}</p>
          </section>
        )}

        {reports.length > 0 && <div id="studies" className="scroll-mt-6" />}
        {reports.map((r, i) => {
          return (
            <section key={r.study.id} className={i === 0 && first === "studies" ? "mt-14" : "mt-20 border-t border-line pt-14"}>
              <p className="text-sm text-ink-3">{templateByKey(r.study.method)?.name ?? r.study.method}</p>
              <h2 className="display mt-1 text-4xl leading-tight">{r.study.title}</h2>
              {r.study.published_at && <p className="mt-2 text-sm text-ink-3">{t("Publicado el")} {new Date(r.study.published_at).toLocaleDateString(locale(), { dateStyle: "long" })}</p>}

              <div className="mt-8"><Overview sessions={r.sessions} answers={r.answers} /></div>

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

        {insights.length > 0 && (
          <section>
            {sectionHead("insights", t("Insights del proyecto"), first === "insights")}
            <div className="mt-6"><KeyFindings insights={insights} heading="h3" /></div>
          </section>
        )}

        {docs.length > 0 && (
          <section>
            {sectionHead("documents", t("Documentos UX"), first === "documents")}
            {docs.map((d) => (
              <article key={d.id} className="mt-10">
                <DocumentView tpl={docTemplate(d.kind)!} title={d.title} data={d.data} lang={d.language} readOnly showGuide={false} />
              </article>
            ))}
          </section>
        )}

        {diagrams.length > 0 && (
          <section>
            {sectionHead("architecture", t("Arquitectura"), first === "architecture")}
            {diagrams.map((d) => (
              <article key={d.id} className="mt-10">
                <h3 className="display text-2xl">{d.title}</h3>
                <div className="mt-4 h-[min(70vh,640px)] overflow-hidden rounded-2xl border border-line bg-paper">
                  <Suspense fallback={<Spinner />}>
                    {d.kind === "sitemap"
                      ? <SitemapEditor outline={String(d.data.outline ?? "")} lang={d.language} title={d.title} readOnly />
                      : <DiagramCanvas data={normalizeDiagram(d.data)} readOnly title={d.title} board={d.kind === "moodboard"} />}
                  </Suspense>
                </div>
              </article>
            ))}
          </section>
        )}

        {milestones.length > 0 && (
          <section>
            {sectionHead("milestones", t("Hitos"), first === "milestones")}
            <ul className="mt-6 space-y-3">
              {milestones.map((m) => (
                <li key={m.id} className="rounded-2xl border border-line bg-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{m.name}</span>
                    <StateChip state={m.state} />
                  </div>
                  <p className="mt-1 text-sm text-ink-3 tabular-nums">{fmtDay(m.begin_date)} – {fmtDay(m.end_date)} · {plural(m.total, { one: "{a} de {n} ticket hecho", other: "{a} de {n} tickets hechos" }, { a: m.done })}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={m.progress} aria-valuemin={0} aria-valuemax={100} aria-label={t("Avance de {a}", { a: m.name })}>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${m.progress}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-16 text-center text-xs text-ink-3">{t("Reporte generado con Redekorate · datos de participantes anonimizados")}</p>
      </div>
    </div>
  );
}
