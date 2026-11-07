import { useState, type ReactNode } from "react";
import { FileDown } from "lucide-react";
import type { Answer, Insight, Session } from "../lib/types";
import type { Block } from "../blocks/types";
import type { StudySettings } from "../lib/settings";
import { overview } from "../lib/analytics";
import { PrintMode } from "../lib/print";
import { getLang, locale, t } from "../lib/i18n";
import { templateByKey } from "../templates/catalog";
import { BlockResults, KeyFindings, Overview } from "./ReportBody";
import { LogoMark, Wordmark } from "./Logo";
import { PdfFrame } from "./PdfPreview";
import { Button } from "./ui";

export interface ReportStudy {
  study: { id?: string; title: string; method: string; blocks: Block[]; settings?: StudySettings | Record<string, unknown>; published_at: string | null };
  sessions: Session[]; answers: Answer[]; insights: Insight[];
}

const fmtDate = (d: string | Date, style: "long" | "medium" = "long") => new Date(d).toLocaleDateString(locale(), { dateStyle: style });
const methodName = (m: string) => templateByKey(m)?.name ?? m;

/** Rango de fechas de las respuestas recibidas. */
function fieldDates(sessions: Session[]) {
  const done = sessions.map((s) => s.completed_at).filter(Boolean).map((d) => new Date(d!).getTime());
  if (!done.length) return null;
  return `${fmtDate(new Date(Math.min(...done)), "medium")} – ${fmtDate(new Date(Math.max(...done)), "medium")}`;
}

function Cover({ kicker, title, project, color, facts }: { kicker: string; title: string; project?: string; color?: string; facts: [string, string][] }) {
  return (
    <header className="break-after-avoid">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <span className="flex items-center gap-2"><LogoMark size={22} /><Wordmark height={15} /></span>
        <span className="text-xs text-ink-3">{t("Generado el")} {fmtDate(new Date())}</span>
      </div>
      <div className="mt-10 rounded-2xl bg-accent px-8 py-9 text-on-accent">
        <p className="text-xs font-semibold tracking-[0.12em] uppercase opacity-80">{kicker}</p>
        <h1 className="mt-3 font-display text-[34px] leading-[1.1] font-normal tracking-[-0.02em] text-balance">{title}</h1>
        {project && (
          <p className="mt-4 flex items-center gap-2 text-sm opacity-90">
            {color && <span className="h-2.5 w-2.5 rounded-sm ring-1 ring-white/60" style={{ background: color }} />}{project}
          </p>
        )}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0 border-l-2 border-accent/30 pl-3">
            <dt className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{k}</dt>
            <dd className="mt-0.5 text-sm font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

function SectionTitle({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h2 className="mb-4 flex items-baseline gap-3 border-b-2 border-ink pb-2 break-after-avoid">
      <span className="display text-[15px] text-accent tabular-nums">{String(n).padStart(2, "0")}</span>
      <span className="display text-[24px]">{children}</span>
    </h2>
  );
}

function StudyBody({ r, startAt = 1 }: { r: ReportStudy; startAt?: number }) {
  const sorted = r.insights;
  let n = startAt;
  return (
    <>
      <section className="mt-10"><SectionTitle n={n++}>{t("Resumen")}</SectionTitle><Overview sessions={r.sessions} /></section>
      {sorted.length > 0 && <section className="mt-10"><SectionTitle n={n++}>{t("Hallazgos clave")}</SectionTitle><KeyFindings insights={sorted} /></section>}
      <section className="mt-10"><SectionTitle n={n++}>{t("Resultados por pregunta")}</SectionTitle>
        <BlockResults blocks={r.study.blocks} sessions={r.sessions} answers={r.answers} settings={r.study.settings as StudySettings} />
      </section>
    </>
  );
}

const Closing = () => <p className="mt-12 border-t border-line pt-4 text-center text-xs text-ink-3">{t("Reporte generado con Redekorate · datos de participantes anonimizados")}</p>;

export function StudyReportPdf({ r, projectName, projectColor }: { r: ReportStudy; projectName?: string; projectColor?: string }) {
  const o = overview(r.sessions);
  const dates = fieldDates(r.sessions);
  return (
    <PrintMode.Provider value>
      <div className="bg-white text-ink">
        <Cover kicker={`${t("Reporte de estudio")} · ${methodName(r.study.method)}`} title={r.study.title} project={projectName} color={projectColor} facts={[
          [t("Método"), methodName(r.study.method)],
          [t("Respuestas"), `${o.completed} ${t("de {a}", { a: o.started })}`],
          [t("Trabajo de campo"), dates ?? "—"],
          [t("Insights"), String(r.insights.length)],
        ]} />
        <StudyBody r={r} />
        <Closing />
      </div>
    </PrintMode.Provider>
  );
}

export function ProjectReportPdf({ projectName, projectColor, reports }: { projectName: string; projectColor?: string; reports: ReportStudy[] }) {
  const totals = reports.reduce((a, r) => { const o = overview(r.sessions); return { done: a.done + o.completed, insights: a.insights + r.insights.length }; }, { done: 0, insights: 0 });
  return (
    <PrintMode.Provider value>
      <div className="bg-white text-ink">
        <Cover kicker={t("Reporte de proyecto")} title={projectName} color={projectColor} facts={[
          [t("Estudios"), String(reports.length)],
          [t("Respuestas"), String(totals.done)],
          [t("Insights"), String(totals.insights)],
          [t("Idioma"), getLang().toUpperCase()],
        ]} />
        <section className="mt-10">
          <h2 className="display mb-3 text-[20px]">{t("Contenido")}</h2>
          <ol className="divide-y divide-line border-y border-line">
            {reports.map((r, i) => {
              const o = overview(r.sessions);
              return (
                <li key={r.study.id ?? i} className="flex items-baseline gap-4 py-2.5 text-sm">
                  <span className="display w-6 text-accent tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1"><b className="font-semibold">{r.study.title}</b> <span className="text-ink-3">· {methodName(r.study.method)}</span></span>
                  <span className="shrink-0 text-ink-2 tabular-nums">{o.completed} {t("respuestas")}</span>
                </li>
              );
            })}
          </ol>
        </section>
        {reports.map((r, i) => (
          <article key={r.study.id ?? i} className="mt-12 break-before-page">
            <p className="text-xs font-semibold tracking-[0.12em] text-accent uppercase">{t("Estudio {a} de {b}", { a: i + 1, b: reports.length })} · {methodName(r.study.method)}</p>
            <h2 className="mt-2 font-display text-[30px] leading-tight font-normal tracking-[-0.02em]">{r.study.title}</h2>
            {fieldDates(r.sessions) && <p className="mt-1 text-sm text-ink-3">{t("Trabajo de campo")}: {fieldDates(r.sessions)}</p>}
            <StudyBody r={r} />
          </article>
        ))}
        <Closing />
      </div>
    </PrintMode.Provider>
  );
}

/** Botón "Descargar PDF": abre la vista previa con el reporte. `load` permite traer los datos al abrir. */
export function ReportPdfButton({ title, content, load, size = "md", variant = "secondary", label }: {
  title: string; content?: ReactNode; load?: () => Promise<ReactNode>; size?: "sm" | "md"; variant?: "primary" | "secondary" | "ghost"; label?: string;
}) {
  const [node, setNode] = useState<ReactNode | null>(null);
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (content) return setNode(content);
    if (!load) return;
    setBusy(true);
    try { setNode(await load()); } finally { setBusy(false); }
  };
  return (
    <>
      <Button size={size} variant={variant} icon={<FileDown size={15} />} onClick={open} disabled={busy}>{busy ? t("Preparando…") : label ?? t("PDF")}</Button>
      {node && <PdfFrame title={title} lang={getLang()} onClose={() => setNode(null)}>{node}</PdfFrame>}
    </>
  );
}
