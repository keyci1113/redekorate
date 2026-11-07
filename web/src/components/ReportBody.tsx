import type { Block } from "../blocks/types";
import type { Answer, Insight, Session, Severity } from "../lib/types";
import { answersByBlock, answeredBlocks, overview } from "../lib/analytics";
import { formatDuration } from "../lib/hooks";
import { BlockResult } from "../blocks/Results";
import { Card, Empty, SeverityBadge, Stat, Tag, cx, type StatTone } from "./ui";
import { Inbox } from "lucide-react";
import type { StudySettings } from "../lib/settings";

import { t } from "../lib/i18n";
export function Overview({ sessions }: { sessions: Session[] }) {
  const o = overview(sessions);
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

export function BlockResults({ blocks, sessions, answers, settings }: { blocks: Block[]; sessions: Session[]; answers: Answer[]; settings?: StudySettings }) {
  const byBlock = answersByBlock(answers, sessions);
  const qs = answeredBlocks(blocks);
  if (!sessions.some((s) => s.completed_at)) {
    return <Empty icon={<Inbox size={20} />} title={t("Todavía no hay respuestas completas")} text={t("Cuando los participantes terminen el estudio, verás aquí los resultados por pregunta.")} />;
  }
  return (
    <div className="space-y-4">
      {qs.map((b, i) => <BlockResult key={b.id} block={b} index={i + 1} settings={settings} answers={byBlock.get(b.id) ?? []} />)}
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
