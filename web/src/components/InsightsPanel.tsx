import { useMemo, useState, type FormEvent } from "react";
import { Check, Lightbulb, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/hooks";
import type { Confidence, Insight, Severity, Study } from "../lib/types";
import { Button, Card, Empty, ErrorNote, Field, Modal, SeverityBadge, Tag, cx } from "./ui";

import { t } from "../lib/i18n";
const SEVERITIES = (): [Severity, string][] => [["low", t("Baja")], ["medium", t("Media")], ["high", t("Alta")], ["critical", t("Crítica")]];
const CONFIDENCES = (): [Confidence, string][] => [["low", t("Baja")], ["medium", t("Media")], ["high", t("Alta")]];

export function InsightsPanel({ projectId, studyId, studies, insights, onChange }: {
  projectId: string; studyId?: string; studies?: Pick<Study, "id" | "title">[]; insights: Insight[]; onChange: () => void;
}) {
  const [editing, setEditing] = useState<Insight | "new" | null>(null);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [review, setReview] = useState<"all" | "pending" | "reviewed">("all");
  const pendingCount = insights.filter((i) => !i.reviewed_at).length;
  const allTags = useMemo(() => [...new Set(insights.flatMap((i) => i.tags))].sort(), [insights]);
  const list = insights.filter((i) =>
    (review === "all" || (review === "pending" ? !i.reviewed_at : !!i.reviewed_at)) &&
    (!tag || i.tags.includes(tag)) && (!q || `${i.title} ${i.body}`.toLowerCase().includes(q.toLowerCase())));

  async function toggleReviewed(i: Insight) {
    await api.patch(`/insights/${i.id}`, { reviewed: !i.reviewed_at });
    onChange();
  }

  async function remove(i: Insight) {
    if (!confirm(t("¿Eliminar el insight \"{a}\"?", { a: i.title }))) return;
    await api.del(`/insights/${i.id}`);
    onChange();
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder={t("Buscar insights…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div role="radiogroup" aria-label={t("Revisión")} className="inline-flex rounded-lg bg-ink/5 p-0.5">
          {([["all", t("Todos")], ["pending", t("Pendientes ({a})", { a: pendingCount })], ["reviewed", t("Revisados")]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={review === v} onClick={() => setReview(v)}
              className={cx("focus-ring min-h-9 rounded-md px-3 text-sm font-medium", review === v ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>{l}</button>
          ))}
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing("new")}>{t("Nuevo insight")}</Button>
      </div>
      {allTags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {allTags.map((t) => (
            <button key={t} onClick={() => setTag(tag === t ? null : t)}
              className={cx("focus-ring rounded-full border px-2.5 py-1 text-xs font-medium transition", tag === t ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink-2 hover:border-line-2")}>
              #{t}
            </button>
          ))}
        </div>
      )}

      {insights.length === 0 ? (
        <Empty icon={<Lightbulb size={20} />} title={t("Aún no hay insights")}
          text={t("Registra hallazgos con su severidad, nivel de confianza y etiquetas. Aparecerán en el reporte compartido.")}
          action={<Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>{t("Agregar el primero")}</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((i) => (
            <Card key={i.id} className="group flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold leading-snug">{i.title}</h3>
                <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => setEditing(i)} className="focus-ring rounded p-1 text-ink-3 hover:text-ink" aria-label={t("Editar")}><Pencil size={14} /></button>
                  <button onClick={() => remove(i)} className="focus-ring rounded p-1 text-ink-3 hover:text-bad" aria-label={t("Eliminar")}><Trash2 size={14} /></button>
                </div>
              </div>
              {i.body && <p className="mt-2 line-clamp-4 text-sm leading-relaxed whitespace-pre-line text-ink-2">{i.body}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                <SeverityBadge severity={i.severity} />
                <button type="button" aria-pressed={!!i.reviewed_at} onClick={() => toggleReviewed(i)}
                  className={cx("focus-ring inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", i.reviewed_at ? "border-good/40 bg-good-soft text-good" : "border-line text-ink-2 hover:border-line-2")}>
                  <Check size={12} aria-hidden />{i.reviewed_at ? t("Revisado") : t("Marcar como revisado")}
                </button>
                <span className="text-xs text-ink-3">{t("Confianza")} {CONFIDENCES().find((c) => c[0] === i.confidence)?.[1].toLowerCase()}</span>
                {i.tags.map((t) => <Tag key={t}>#{t}</Tag>)}
              </div>
              <p className="mt-2 text-[11px] text-ink-3">{i.study_title && !studyId ? `${i.study_title} · ` : ""}{timeAgo(i.created_at)}</p>
            </Card>
          ))}
          {list.length === 0 && <p className="text-sm text-ink-3">{t("Ningún insight coincide con el filtro.")}</p>}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? t("Nuevo insight") : t("Editar insight")} wide>
        {editing && (
          <InsightForm initial={editing === "new" ? undefined : editing} studies={studies} defaultStudy={studyId}
            onSubmit={async (v) => {
              if (editing === "new") await api.post("/insights", { ...v, project_id: projectId });
              else await api.patch(`/insights/${editing.id}`, v);
              setEditing(null); onChange();
            }} />
        )}
      </Modal>
    </div>
  );
}

function InsightForm({ initial, studies, defaultStudy, onSubmit }: {
  initial?: Insight; studies?: Pick<Study, "id" | "title">[]; defaultStudy?: string;
  onSubmit: (v: Record<string, unknown>) => Promise<void>;
}) {
  const [v, setV] = useState({
    title: initial?.title ?? "", body: initial?.body ?? "", tags: initial?.tags.join(", ") ?? "",
    severity: initial?.severity ?? "medium", confidence: initial?.confidence ?? "medium",
    study_id: initial?.study_id ?? defaultStudy ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    try {
      await onSubmit({
        title: v.title, body: v.body, severity: v.severity, confidence: v.confidence,
        tags: v.tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
        ...(initial ? {} : { study_id: v.study_id || null }),
      });
    } catch (err) { setError((err as Error).message); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t("Redekorate")}><input autoFocus required className="field font-medium" placeholder={t("p. ej. Los cajeros no encuentran cómo aplicar descuentos")} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
      <Field label={t("Detalle y evidencia")} hint={t("Qué observaste, citas, cuántos participantes, recomendación.")}>
        <textarea className="field min-h-32" value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Severidad")}>
          <select className="field" value={v.severity} onChange={(e) => setV({ ...v, severity: e.target.value as Severity })}>
            {SEVERITIES().map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label={t("Confianza")}>
          <select className="field" value={v.confidence} onChange={(e) => setV({ ...v, confidence: e.target.value as Confidence })}>
            {CONFIDENCES().map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t("Etiquetas")} hint={t("Separadas por comas: navegación, checkout, copy")}>
        <input className="field" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} />
      </Field>
      {studies && !initial && (
        <Field label={t("Estudio relacionado")}>
          <select className="field" value={v.study_id} onChange={(e) => setV({ ...v, study_id: e.target.value })}>
            <option value="">{t("— Ninguno (insight del proyecto)")}</option>
            {studies.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Field>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end"><Button variant="primary">{t("Guardar insight")}</Button></div>
    </form>
  );
}
