import type { Block } from "../blocks/types";
import type { Answer, Insight, Session, Severity } from "../lib/types";
import { answersByBlock, answeredBlocks, overview } from "../lib/analytics";
import { formatDuration } from "../lib/hooks";
import { BlockResult } from "../blocks/Results";
import { Card, Empty, SeverityBadge, Stat, Tag, cx, type StatTone } from "./ui";
import { ChevronLeft, ChevronRight, GalleryHorizontal, Inbox, LayoutGrid, Rows3 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StudySettings } from "../lib/settings";

import { t } from "../lib/i18n";
export function Overview({ sessions, answers }: { sessions: Session[]; answers?: Answer[] }) {
  const o = overview(sessions, answers);
  const drops = o.started - o.completed;
  // Finalización: ≥85% bien, 70–84% atención, <70% mal (con al menos 5 personas para no alarmar por una sola)
  const rate = o.completionRate;
  const rateTone: StatTone | undefined = o.started < 5 ? undefined : rate >= 0.85 ? "good" : rate >= 0.7 ? "warn" : "bad";
  const rateNote = rateTone === "bad" ? t("Abandono alto") : rateTone === "warn" ? t("Revisar abandono") : rateTone === "good" ? t("Buena finalización") : undefined;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label={t("Respuestas completas")} value={o.completed} tone={o.started > 0 && o.completed === 0 ? "bad" : undefined} note={o.started > 0 && o.completed === 0 ? t("Nadie ha terminado") : undefined} />
      <Stat label={t("Participantes que iniciaron")} value={o.started} />
      <Stat label={t("Tasa de finalización")} value={`${Math.round(rate * 100)}%`} tone={rateTone} note={rateNote}
        sub={o.started ? t(drops === 1 ? "1 abandono" : "{a} abandonos", { a: drops }) : undefined} />
      <Stat label={t("Tiempo mediano")} value={formatDuration(o.medianMs)} />
    </div>
  );
}

/** How the Results tab lays out its questions: side by side in one scrolling row, in a grid, or stacked full width. */
export type ResultsLayout = "row" | "grid" | "list";
const LAYOUT_KEY = "rk-results-layout";

/** The layout this browser last picked (the row by default). */
export function useResultsLayout(): [ResultsLayout, (l: ResultsLayout) => void] {
  const [layout, setLayout] = useState<ResultsLayout>(() => {
    try { const v = localStorage.getItem(LAYOUT_KEY); return v === "grid" || v === "list" ? v : "row"; } catch { return "row"; }
  });
  return [layout, (l) => { setLayout(l); try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* no storage */ } }];
}

/** The row / grid / list switch above the results. */
export function ResultsLayoutToggle({ layout, onChange }: { layout: ResultsLayout; onChange: (l: ResultsLayout) => void }) {
  const btn = (l: ResultsLayout, icon: ReactNode, label: string) => (
    <button type="button" aria-pressed={layout === l} title={label} onClick={() => onChange(l)}
      className={cx("focus-ring flex h-9 w-9 items-center justify-center rounded-md transition", layout === l ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")}>
      {icon}<span className="sr-only">{label}</span>
    </button>
  );
  return (
    <div role="group" aria-label={t("Vista")} className="flex rounded-lg bg-ink/5 p-0.5">
      {btn("row", <GalleryHorizontal size={16} />, t("Tarjetas en fila"))}
      {btn("grid", <LayoutGrid size={16} />, t("Cuadrícula"))}
      {btn("list", <Rows3 size={16} />, t("Lista"))}
    </div>
  );
}

/** Each question's results. Reports and the PDF keep the full-width list; the Results tab passes the layout its viewer picked. */
export function BlockResults({ blocks, sessions, answers, settings, layout = "list", toolbar }: {
  blocks: Block[]; sessions: Session[]; answers: Answer[]; settings?: StudySettings; layout?: ResultsLayout;
  /** Controls shown on the right of the "n questions" bar (the layout switch); without them there is no bar. */
  toolbar?: ReactNode;
}) {
  const byBlock = answersByBlock(answers, sessions);
  const qs = answeredBlocks(blocks);
  if (!sessions.some((s) => s.completed_at)) {
    return <Empty icon={<Inbox size={20} />} title={t("Todavía no hay respuestas completas")} text={t("Cuando los participantes terminen el estudio, verás aquí los resultados por pregunta.")} />;
  }
  const cards = qs.map((b, i) => ({ id: b.id, el: <BlockResult block={b} index={i + 1} settings={settings} answers={byBlock.get(b.id) ?? []} compact={layout !== "list"} /> }));
  if (layout === "row") return <ResultsRow cards={cards} toolbar={toolbar} />;
  const bar = toolbar && <ResultsBar count={cards.length}>{toolbar}</ResultsBar>;
  if (layout === "grid") return <div>{bar}<div className="grid gap-4 lg:grid-cols-2">{cards.map((c) => <div key={c.id}>{c.el}</div>)}</div></div>;
  return <div>{bar}<div className="space-y-4">{cards.map((c) => <div key={c.id}>{c.el}</div>)}</div></div>;
}

function ResultsBar({ count, children }: { count: number; children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <p className="text-[13px] text-ink-3">{t(count === 1 ? "1 pregunta" : "{a} preguntas", { a: count })}</p>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/** The questions side by side in one row that scrolls sideways (trackpad, shift + wheel, swipe, arrow keys or the buttons). */
function ResultsRow({ cards, toolbar }: { cards: { id: string; el: ReactNode }[]; toolbar?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: false });
  const update = () => {
    const el = ref.current;
    if (el) setEnds({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cards.length]);
  // Brings the next (or previous) card's left edge to the row's left edge.
  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const lefts = [...el.children].map((c) => (c as HTMLElement).offsetLeft); // the row is relative, so these are offsets inside it
    const x = el.scrollLeft;
    const to = dir > 0 ? lefts.find((l) => l > x + 1) : [...lefts].reverse().find((l) => l < x - 1);
    el.scrollTo({ left: to ?? (dir > 0 ? el.scrollWidth : 0), behavior: "smooth" });
  };
  const nav = (dir: 1 | -1, disabled: boolean, label: string, icon: ReactNode) => (
    <button type="button" onClick={() => step(dir)} disabled={disabled} aria-label={label} title={label}
      className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition hover:text-ink disabled:opacity-40">{icon}</button>
  );
  return (
    <div>
      <ResultsBar count={cards.length}>
        {nav(-1, ends.start, t("Pregunta anterior"), <ChevronLeft size={16} />)}
        {nav(1, ends.end, t("Siguiente pregunta"), <ChevronRight size={16} />)}
        {toolbar}
      </ResultsBar>
      <div ref={ref} onScroll={update} tabIndex={0} role="region" aria-label={t("Resultados por pregunta")}
        className="focus-ring relative flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto rounded-xl pb-3">
        {cards.map((c) => <div key={c.id} className="w-[min(26rem,85vw)] shrink-0 snap-start">{c.el}</div>)}
      </div>
    </div>
  );
}

const ORDER: Severity[] = ["critical", "high", "medium", "low"];
const EDGE: Record<Severity, string> = { critical: "border-l-bad", high: "border-l-bad/60", medium: "border-l-warn", low: "border-l-line-2" };

/** Hallazgos ordenados por severidad; el borde izquierdo marca qué tan grave es cada uno. */
export function KeyFindings({ insights, heading: H = "h3" }: { insights: Insight[]; heading?: "h3" | "h4" }) {
  const sorted = [...insights].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  return (
    <div className="space-y-3">
      {sorted.map((i, n) => (
        <Card key={i.id} className={cx("flex gap-4 border-l-4 p-5 break-inside-avoid", EDGE[i.severity])}>
          <span className="display w-8 shrink-0 text-3xl leading-none text-ink-3">{n + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <H className="font-semibold">{i.title}</H>
              <SeverityBadge severity={i.severity} />
            </div>
            {i.body && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{i.body}</p>}
            {i.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{i.tags.map((tag) => <Tag key={tag}>#{tag}</Tag>)}</div>}
          </div>
        </Card>
      ))}
    </div>
  );
}
