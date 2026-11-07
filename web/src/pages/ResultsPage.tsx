import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, Download, ExternalLink, Link2, PenLine, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo, useLoad } from "../lib/hooks";
import type { Answer, Insight, Session, Share, Study } from "../lib/types";
import type { Block, CardSortValue, ChoiceValue, FirstClickValue, PreferenceValue, TreeTestValue } from "../blocks/types";
import { isSuccess } from "../blocks/logic";
import { classify } from "../blocks/kano";
import type { StudySettings } from "../lib/settings";
import { isDirect, screenName, type PrototypeTaskValue } from "../blocks/prototype";
import { blockDef } from "../blocks/registry";
import { susScore, answeredBlocks } from "../lib/analytics";
import { Button, Card, Empty, ErrorNote, Spinner, StatusBadge, Tabs, cx } from "../components/ui";
import { BlockResults, Overview } from "../components/ReportBody";
import { InsightsPanel } from "../components/InsightsPanel";
import { ReportPdfButton, StudyReportPdf } from "../components/ReportPdf";
import type { Project } from "../lib/types";
import { ShareLink, studyUrl } from "./BuilderPage";
import { templateByKey } from "../templates/catalog";

import { t } from "../lib/i18n";
interface Results { study: Study; sessions: Session[]; answers: Answer[]; insights: Insight[] }
type TabId = "summary" | "responses" | "insights" | "share";

export function ResultsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<TabId>(params.get("tab") === "insights" ? "insights" : "summary");
  const { data, error, loading, reload } = useLoad(() => api.get<Results>(`/studies/${id}/results`), [id]);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <div className="p-10"><ErrorNote>{error}</ErrorNote></div>;
  const { study, sessions, answers, insights } = data;

  return (
    <div className="page">
      <Link to={`/projects/${study.project_id}`} className="text-sm text-ink-3 hover:text-ink">{t("← Proyecto")}</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label">{templateByKey(study.method)?.name ?? study.method}</p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="page-title">{study.title}</h1>
            <StatusBadge status={study.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/studies/${study.id}/edit`}><Button variant="ghost" icon={<PenLine size={15} />}>{t("Editar")}</Button></Link>
          <Button icon={<Download size={15} />} onClick={() => exportCsv(study, sessions, answers)} disabled={!sessions.length}>{t("CSV")}</Button>
          <ReportPdfButton title={study.title} load={async () => {
            const { project } = await api.get<{ project: Project }>(`/projects/${study.project_id}`).catch(() => ({ project: null as Project | null }));
            return <StudyReportPdf r={{ study, sessions, answers, insights }} projectName={project?.name} projectColor={project?.color} />;
          }} />
          <Button variant="primary" icon={<Link2 size={15} />} onClick={() => setTab("share")}>{t("Compartir reporte")}</Button>
        </div>
      </div>

      {study.status === "live" && (
        <Card className="mt-6 flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm font-medium">{t("Link para participantes")}</p>
          <div className="min-w-64 flex-1"><ShareLink url={studyUrl(study.public_slug)} /></div>
        </Card>
      )}

      <div className="mt-8"><Overview sessions={sessions} /></div>

      <div className="mt-8">
        <Tabs value={tab} onChange={setTab} items={[
          { id: "summary", label: t("Resultados") },
          { id: "responses", label: t("Participantes"), count: sessions.length },
          { id: "insights", label: t("Insights"), count: insights.length },
          { id: "share", label: t("Compartir") },
        ]} />
      </div>
      <div className="mt-6">
        {tab === "summary" && <BlockResults blocks={study.blocks} sessions={sessions} answers={answers} settings={study.settings as StudySettings} />}
        {tab === "responses" && <Responses study={study} sessions={sessions} answers={answers} onChange={reload} />}
        {tab === "insights" && <InsightsPanel projectId={study.project_id} studyId={study.id} insights={insights} onChange={reload} />}
        {tab === "share" && <SharePanel study={study} />}
      </div>
    </div>
  );
}

export function formatAnswer(block: Block, value: unknown, settings?: StudySettings): string {
  if (value === undefined || value === null) return "—";
  const lbl = (opts: { id: string; label: string }[], id: string) => opts.find((o) => o.id === id)?.label ?? id;
  switch (block.type) {
    case "choice": {
      const v = value as ChoiceValue;
      return v.selected.map((id) => (id === "__other" ? t("Otro: {a}", { a: v.other ?? "" }) : lbl(block.options, id))).join(", ");
    }
    case "yes_no": return value === "yes" ? block.yesLabel : block.noLabel;
    case "sus": return `${susScore(value as number[]).toFixed(1)} (SUS)`;
    case "ranking": return (value as string[]).map((id, i) => `${i + 1}. ${lbl(block.items, id)}`).join("  ");
    case "matrix": return block.rows.map((r) => `${r.label}: ${lbl(block.columns, (value as Record<string, string>)[r.id] ?? "—")}`).join(" | ");
    case "card_sort": return (value as CardSortValue).groups.filter((g) => g.cardIds.length).map((g) => `[${g.name || t("sin nombre")}] ${g.cardIds.map((c) => lbl(block.cards, c)).join(", ")}`).join("  ");
    case "tree_test": {
      const v = value as TreeTestValue;
      return `${v.selected.replaceAll("/", " › ")} ${block.correct.length ? (block.correct.includes(v.selected) ? "✓" : "✗") : ""}${v.backtracks ? ` (${v.backtracks} retrocesos)` : ""}`;
    }
    case "preference": { const v = value as PreferenceValue; return `${lbl(block.options, v.choice)}${v.why ? ` — "${v.why}"` : ""}`; }
    case "five_second": return t("Vio la imagen");
    case "first_click": {
      const v = value as FirstClickValue; const ok = isSuccess(block, v);
      return `x ${Math.round(v.x * 100)}%, y ${Math.round(v.y * 100)}% · ${(v.ms / 1000).toFixed(1)} s${ok === null ? "" : ok ? " ✓" : " ✗"}`;
    }
    case "kano": {
      const v = value as Record<string, { f: number; d: number; imp?: number }>;
      return block.features.map((f) => v[f.id] ? `${f.label}: ${classify(v[f.id].f, v[f.id].d)}${v[f.id].imp ? ` (${v[f.id].imp}/10)` : ""}` : "").filter(Boolean).join(" | ");
    }
    case "prototype_task": {
      const v = value as PrototypeTaskValue, p = settings?.prototypes?.find((x) => x.id === block.prototypeId);
      const res = v.outcome === "success" ? (isDirect(v, block.expectedPath) ? t("Éxito directo") : t("Éxito indirecto")) : t("No la completó");
      return t("{a} · {b} s · {c} clics fuera · ruta: {d}", { a: res, b: (v.ms / 1000).toFixed(1), c: v.clicks.filter((c) => !c.h).length, d: v.path.map((x) => screenName(p, x.s)).join(" → ") });
    }
    default: return String(value);
  }
}

function Responses({ study, sessions, answers, onChange }: { study: Study; sessions: Session[]; answers: Answer[]; onChange: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const qs = answeredBlocks(study.blocks);
  if (!sessions.length) return <Empty icon={<Plus size={20} />} title={t("Aún no hay participantes")} text={t("Comparte el link del estudio para empezar a recibir respuestas.")} />;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {sessions.map((s, idx) => {
        const mine = answers.filter((a) => a.session_id === s.id);
        const dur = s.completed_at ? new Date(s.completed_at).getTime() - new Date(s.started_at).getTime() : 0;
        const meta = Object.entries(s.participant ?? {}).filter(([k]) => k !== "preview");
        return (
          <div key={s.id} className={cx(idx > 0 && "border-t border-line")}>
            <button onClick={() => setOpen(open === s.id ? null : s.id)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-paper/50">
              <span className="w-24 text-sm font-medium tabular-nums">#{sessions.length - idx}</span>
              <span className="flex-1 text-sm text-ink-2">{timeAgo(s.started_at)}{s.device && <span className="ml-2 text-xs text-ink-3">· {s.device === "mobile" ? t("Móvil") : s.device === "tablet" ? t("Tablet") : t("Escritorio")}</span>}{meta.length > 0 && <span className="ml-2 text-xs text-ink-3">{meta.map(([k, v]) => `${k}=${v}`).join(" · ")}</span>}</span>
              <span className="hidden text-sm tabular-nums text-ink-3 sm:block">{mine.length}/{qs.length} {t("respuestas")}</span>
              <span className="w-24 text-right text-sm tabular-nums text-ink-3">{dur ? `${Math.round(dur / 1000)} s` : ""}</span>
              <span className={cx("w-24 rounded-full px-2 py-0.5 text-center text-xs font-medium", s.completed_at ? "bg-good-soft text-good" : "bg-ink/5 text-ink-3")}>{s.completed_at ? t("Completa") : t("Incompleta")}</span>
              <ChevronDown size={16} className={cx("text-ink-3 transition", open === s.id && "rotate-180")} />
            </button>
            {open === s.id && (
              <div className="border-t border-line bg-paper/40 px-5 py-4">
                <dl className="space-y-3">
                  {qs.map((b) => {
                    const a = mine.find((x) => x.block_id === b.id);
                    return (
                      <div key={b.id} className="grid gap-1 sm:grid-cols-[1fr_1.3fr] sm:gap-6">
                        <dt className="text-sm text-ink-3">{b.title}</dt>
                        <dd className="text-sm whitespace-pre-line">{formatAnswer(b, a?.value, study.settings as StudySettings)}</dd>
                      </div>
                    );
                  })}
                </dl>
                <div className="mt-4 flex justify-end">
                  <Button size="sm" variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" icon={<Trash2 size={14} />} onClick={async () => {
                    if (!confirm(t("¿Eliminar esta respuesta? Úsalo para descartar pruebas o respuestas inválidas."))) return;
                    await api.del(`/studies/${study.id}/sessions/${s.id}`); onChange();
                  }}>{t("Descartar respuesta")}</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SharePanel({ study }: { study: Study }) {
  const { data, reload } = useLoad(() => api.get<{ shares: Share[] }>(`/studies/${study.id}/shares`), [study.id]);
  const shares = data?.shares ?? [];
  const url = (t: string) => `${window.location.origin}/r/${t}`;
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="font-semibold">{t("Reporte público de solo lectura")}</h2>
        <p className="mt-1 text-sm text-ink-2">{t("Cualquier persona con el link verá los resultados agregados y los insights de este estudio, sin necesidad de cuenta. Los datos personales de los participantes nunca se muestran.")}</p>
      </div>
      {shares.map((s) => (
        <Card key={s.id} className="p-4">
          <ShareLink url={url(s.token)} />
          <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
            <span>{t("Creado")} {timeAgo(s.created_at)}</span>
            <div className="flex gap-3">
              <a href={url(s.token)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-accent">{t("Abrir")} <ExternalLink size={12} /></a>
              <button className="font-medium text-bad" onClick={async () => { if (confirm(t("¿Revocar este link? Dejará de funcionar de inmediato."))) { await api.del(`/studies/${study.id}/shares/${s.id}`); reload(); } }}>{t("Revocar")}</button>
            </div>
          </div>
        </Card>
      ))}
      <Button variant={shares.length ? "secondary" : "primary"} icon={<Plus size={15} />} onClick={async () => { await api.post(`/studies/${study.id}/shares`); reload(); }}>
        {shares.length ? t("Crear otro link") : t("Crear link del reporte")}
      </Button>
    </div>
  );
}

function exportCsv(study: Study, sessions: Session[], answers: Answer[]) {
  const qs = answeredBlocks(study.blocks);
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ["participante", "inicio", "completado", ...qs.map((b) => `${blockDef(b.type)?.label}: ${b.title}`)];
  const rows = sessions.map((s, i) => [
    String(sessions.length - i), s.started_at, s.completed_at ?? "",
    ...qs.map((b) => formatAnswer(b, answers.find((a) => a.session_id === s.id && a.block_id === b.id)?.value, study.settings as StudySettings)),
  ]);
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${study.title.replace(/[^\w\- ]+/g, "").trim() || "estudio"}.csv`;
  a.click();
}
