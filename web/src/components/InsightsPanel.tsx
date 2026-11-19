import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Lightbulb, Pencil, Plus, Search, Ticket as TicketIcon, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/hooks";
import type { Confidence, Insight, Severity, Study } from "../lib/types";
import { Button, Card, Empty, ErrorNote, Field, Modal, SeverityBadge, Tag, cx } from "./ui";

import { plural, t } from "../lib/i18n";
import { NewTicketDialog } from "../tickets/NewTicketDialog";
const SEVERITIES = (): [Severity, string][] => [["low", t("Baja")], ["medium", t("Media")], ["high", t("Alta")], ["critical", t("Crítica")]];
/** Tickets made from or linked to the insight, apart from the one it was converted from (shown on its own line). */
const linkedTickets = (i: Insight) => (i.ticket_numbers ?? []).filter((n) => n !== i.source_ticket?.number);
const CONFIDENCES = (): [Confidence, string][] => [["low", t("Baja")], ["medium", t("Media")], ["high", t("Alta")]];

export function InsightsPanel({ projectId, projectName, studyId, studies, insights, onChange, canEdit = true }: {
  projectId: string; projectName?: string; studyId?: string; studies?: Pick<Study, "id" | "title">[]; insights: Insight[]; onChange: () => void; canEdit?: boolean;
}) {
  const [ticketFor, setTicketFor] = useState<Insight | null>(null);
  const [editing, setEditing] = useState<Insight | "new" | null>(null);
  const [q, setQ] = useState("");
  // The tag filter lives in the URL (?tag=…), so a filtered list can be linked to and survives a reload.
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag");
  const setTag = (next: string | null) => setParams((prev) => { const p = new URLSearchParams(prev); if (next) p.set("tag", next); else p.delete("tag"); return p; }, { replace: true });
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
        {canEdit && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing("new")}>{t("Nuevo insight")}</Button>}
      </div>
      {allTags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {allTags.map((t) => (
            <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}
              className={cx("focus-ring rounded-full border px-2.5 py-1 text-xs font-medium transition", tag === t ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink-2 hover:border-line-2")}>
              #{t}
            </button>
          ))}
          {tag && (
            <button type="button" onClick={() => setTag(null)} className="focus-ring inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-accent-ink hover:underline">
              <X size={12} aria-hidden />{t("Quitar filtro")}
            </button>
          )}
        </div>
      )}

      {insights.length === 0 ? (
        <Empty icon={<Lightbulb size={20} />} title={t("Aún no hay insights")}
          text={t("Registra hallazgos con su severidad, nivel de confianza y etiquetas. Aparecerán en el reporte compartido.")}
          action={canEdit ? <Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>{t("Agregar el primero")}</Button> : undefined} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((i) => (
            <Card key={i.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold leading-snug">{i.title}</h3>
                {/* Always shown, in the quiet ink-3 color: hover-only actions were unreachable by keyboard and on touch screens. */}
                {canEdit && <div className="flex shrink-0 gap-0.5">
                  <button type="button" onClick={() => setEditing(i)} className="focus-ring rounded p-1.5 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label={t("Editar «{a}»", { a: i.title })} title={t("Editar")}><Pencil size={14} /></button>
                  <button type="button" onClick={() => remove(i)} className="focus-ring rounded p-1.5 text-ink-3 hover:bg-ink/5 hover:text-bad" aria-label={t("Eliminar «{a}»", { a: i.title })} title={t("Eliminar")}><Trash2 size={14} /></button>
                </div>}
              </div>
              {i.source_ticket && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3">
                  <TicketIcon size={13} aria-hidden />{t("Viene del ticket")}
                  <Link to={`/projects/${projectId}/tickets/${i.source_ticket.number}`} className="focus-ring min-w-0 truncate rounded font-semibold text-accent-ink hover:underline">
                    <span className="tabular-nums">#{i.source_ticket.number}</span> {i.source_ticket.title}
                  </Link>
                </p>
              )}
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
              {projectName && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3 text-[13px]">
                  {linkedTickets(i).length ? (
                    <span className="flex flex-wrap items-center gap-x-2 text-ink-2">
                      <TicketIcon size={14} aria-hidden className="text-ink-3" />{plural(linkedTickets(i).length, { one: "{n} ticket", other: "{n} tickets" })}
                      {linkedTickets(i).map((n) => <Link key={n} to={`/projects/${projectId}/tickets/${n}`} className="focus-ring rounded font-semibold text-accent-ink tabular-nums hover:underline">#{n}</Link>)}
                    </span>
                  ) : <span className="text-ink-3">{t("Sin tickets")}</span>}
                  {canEdit && <Button size="lg" className="h-11" icon={<Plus size={14} />} onClick={() => setTicketFor(i)}>{t("Crear ticket")}</Button>}
                </div>
              )}
            </Card>
          ))}
          {list.length === 0 && <p className="text-sm text-ink-3">{t("Ningún insight coincide con el filtro.")}</p>}
        </div>
      )}

      {ticketFor && projectName && <NewTicketDialog projectId={projectId} projectName={projectName} insight={ticketFor} onClose={() => setTicketFor(null)} onCreated={onChange} />}
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
      <Field label={t("Título")}><input autoFocus required className="field font-medium" placeholder={t("p. ej. Los cajeros no encuentran cómo aplicar descuentos")} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
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
