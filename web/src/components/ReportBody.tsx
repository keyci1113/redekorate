import type { Block } from "../blocks/types";
import type { Answer, Session } from "../lib/types";
import { answersByBlock, answeredBlocks, overview } from "../lib/analytics";
import { formatDuration } from "../lib/hooks";
import { BlockResult } from "../blocks/Results";
import { Empty, Stat } from "./ui";
import { Inbox } from "lucide-react";
import type { StudySettings } from "../lib/settings";

import { t } from "../lib/i18n";
export function Overview({ sessions }: { sessions: Session[] }) {
  const o = overview(sessions);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label={t("Respuestas completas")} value={o.completed} />
      <Stat label={t("Participantes que iniciaron")} value={o.started} />
      <Stat label={t("Tasa de finalización")} value={`${Math.round(o.completionRate * 100)}%`} sub={o.started ? t("{a} abandonos", { a: o.started - o.completed }) : undefined} />
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
