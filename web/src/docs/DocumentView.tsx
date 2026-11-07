import type { DocData, DocTemplate, Section } from "./types";
import { useMemo } from "react";
import { DocCtx, SectionBody, SectionCard, exAt, makeCtx } from "./Sections";
import { Journey, type JourneyData } from "./Journey";
import { Affinity, type AffinityData } from "./Affinity";
import { UsabilityMatrix, type UsabilityData } from "./UsabilityMatrix";
import { Heuristic, type HeuristicData } from "./Heuristic";
import { Blueprint, type BlueprintData } from "./Blueprint";
import type { Lang } from "../lib/i18n";
import { cx } from "../components/ui";
import { LogoMark, Wordmark } from "../components/Logo";

const SPAN: Record<number, string> = { 3: "lg:col-span-3", 4: "lg:col-span-4", 5: "lg:col-span-5", 6: "lg:col-span-6", 7: "lg:col-span-7", 8: "lg:col-span-8", 12: "lg:col-span-12" };

/** Renderiza un documento completo con el encabezado de la plantilla (propósito, pregunta guía, instrucciones). */
export function DocumentView({ tpl, title, data, lang, onChange, readOnly = false, showGuide = true, variant = "screen", projectName }: {
  tpl: DocTemplate; title: string; data: DocData; lang: Lang; onChange?: (d: DocData) => void; readOnly?: boolean; showGuide?: boolean; variant?: "screen" | "pdf"; projectName?: string;
}) {
  // Los ejemplos de la plantilla solo se usan como texto guía; el documento empieza vacío
  const ex = useMemo(() => tpl.example?.(lang) ?? {}, [tpl, lang]);
  const ctx = makeCtx(lang, readOnly || !onChange, ex);
  const T = ctx.T;
  const set = (id: string) => (v: unknown) => onChange?.({ ...data, [id]: v });

  const body = (s: Section) => {
    if (s.type !== "custom") return <SectionCard key={s.id} section={s}><SectionBody section={s} value={data[s.id]} set={set(s.id)} /></SectionCard>;
    const e = exAt(ex, s.id);
    const inner = s.component === "journey" ? <Journey data={(data[s.id] as JourneyData) ?? { stages: [] }} set={set(s.id)} ex={e as JourneyData | undefined} />
      : s.component === "affinity" ? <Affinity data={(data[s.id] as AffinityData) ?? { participants: [], notes: [], groups: [] }} set={set(s.id)} ex={e as AffinityData | undefined} />
      : s.component === "usability" ? <UsabilityMatrix data={(data[s.id] as UsabilityData) ?? { tasks: [], users: [], results: {} }} set={set(s.id)} ex={e as UsabilityData | undefined} />
      : s.component === "blueprint" ? <Blueprint data={(data[s.id] as BlueprintData) ?? { stages: [] }} set={set(s.id)} ex={e as BlueprintData | undefined} />
      : <Heuristic data={(data[s.id] as HeuristicData) ?? { framework: "weinschenk", product: "", evaluators: [], answers: {} }} set={set(s.id)} ex={e as HeuristicData | undefined} />;
    return <div key={s.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">{inner}</div>;
  };

  return (
    <DocCtx.Provider value={ctx}>
      <article lang={lang} className="space-y-6">
        {variant === "pdf" ? (
          <header>
            <div className="flex items-center justify-between gap-4 border-b border-line pb-2.5 text-[11px] text-ink-3">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><LogoMark size={16} /><Wordmark height={12} /></span>
              <span className="truncate tabular-nums">{projectName && `${projectName} · `}{new Date().toLocaleDateString(lang === "en" ? "en-US" : "es", { day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink" aria-hidden>{tpl.icon}</span>
              <h1 className="display text-[32px] leading-tight text-balance [overflow-wrap:anywhere]">{title}</h1>
            </div>
            <p className="mt-1 text-[13px] font-medium text-accent-ink">{T(tpl.name)}</p>
            <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-ink-2">{T(tpl.purpose)}</p>
            <p className="mt-3 rounded-lg bg-accent-soft px-3.5 py-2.5 text-[14px] font-medium text-accent-ink">{T(tpl.question)}</p>
          </header>
        ) : (
          <header className="text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink" aria-hidden>{tpl.icon}</span>
            <p className="label">{T(tpl.name)}</p>
            <h1 className="display mt-2 text-4xl leading-tight text-accent sm:text-5xl">{title}</h1>
            <p className="mx-auto mt-3 max-w-2xl text-[15px] text-ink-2">{T(tpl.purpose)}</p>
            <p className="mx-auto mt-3 max-w-2xl text-[17px] font-medium text-good">{T(tpl.question)}</p>
          </header>
        )}
        {showGuide && (
          <div className="rounded-2xl border border-line bg-paper/70 p-4 print:bg-white">
            <p className="text-[12px] font-bold tracking-wide text-ink-2 uppercase">{T("Instrucciones")}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">{tpl.instructions.map((i) => <li key={i}>{T(i)}</li>)}</ol>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-12">
          {tpl.sections.map((s) => <div key={s.id} className={cx("min-w-0", SPAN[s.span ?? 12])}>{body(s)}</div>)}
        </div>
        {tpl.credit && <p className="text-center text-[11px] text-ink-3">{T("Crédito")}: {T(tpl.credit)}</p>}
      </article>
    </DocCtx.Provider>
  );
}
