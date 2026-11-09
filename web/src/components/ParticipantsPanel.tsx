import { useState, type FormEvent } from "react";
import { Check, Mail, Phone, Plus, Pencil, Search, ShieldCheck, Trash2, UsersRound, X } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/hooks";
import type { Participant, ParticipantStudyStatus, Study } from "../lib/types";
import { Button, Card, Empty, ErrorNote, Field, Modal, Tag, cx } from "./ui";

import { t } from "../lib/i18n";
const STATUSES = (): [ParticipantStudyStatus, string][] => [["invited", t("Invitado")], ["completed", t("Completó")], ["no_show", t("No asistió")], ["declined", t("Rechazó")]];
const statusTone = (s: ParticipantStudyStatus) => s === "completed" ? "border-good/30 bg-good-soft text-good" : s === "declined" || s === "no_show" ? "border-bad/30 bg-bad-soft text-bad" : "border-line text-ink-2";

export function ParticipantsPanel({ projectId, studies, participants, onChange, canEdit = true }: {
  projectId: string; studies: Pick<Study, "id" | "title">[]; participants: Participant[]; onChange: () => void; canEdit?: boolean;
}) {
  const [editing, setEditing] = useState<Participant | "new" | null>(null);
  const [q, setQ] = useState("");
  const list = participants.filter((p) => !q || `${p.name} ${p.email} ${p.phone} ${p.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  async function remove(p: Participant) {
    if (!confirm(t("¿Eliminar al participante \"{a}\"?", { a: p.name }))) return;
    await api.del(`/participants/${p.id}`);
    onChange();
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder={t("Buscar participantes…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {canEdit && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing("new")}>{t("Nuevo participante")}</Button>}
      </div>

      {participants.length === 0 ? (
        <Empty icon={<UsersRound size={20} />} title={t("Aún no hay participantes")}
          text={t("Lleva aquí tu base de reclutamiento: contacto, consentimiento y en qué estudios ha participado cada quién.")}
          action={canEdit ? <Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>{t("Agregar el primero")}</Button> : undefined} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((p) => (
            <Card key={p.id} className="group flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold leading-snug">{p.name}</h3>
                {canEdit && <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => setEditing(p)} className="focus-ring rounded p-1 text-ink-3 hover:text-ink" aria-label={t("Editar")}><Pencil size={14} /></button>
                  <button onClick={() => remove(p)} className="focus-ring rounded p-1 text-ink-3 hover:text-bad" aria-label={t("Eliminar")}><Trash2 size={14} /></button>
                </div>}
              </div>
              <div className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-ink-2">
                {p.email && <span className="flex items-center gap-1.5"><Mail size={12} className="text-ink-3" /> {p.email}</span>}
                {p.phone && <span className="flex items-center gap-1.5"><Phone size={12} className="text-ink-3" /> {p.phone}</span>}
              </div>
              {p.notes && <p className="mt-2 line-clamp-3 text-sm leading-relaxed whitespace-pre-line text-ink-2">{p.notes}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                {p.consent
                  ? <span className="flex items-center gap-1 rounded-full border border-good/30 bg-good-soft px-2 py-0.5 text-xs font-medium text-good"><ShieldCheck size={12} /> {t("Consentimiento")}</span>
                  : <span className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-3">{t("Sin consentimiento")}</span>}
                {p.tags.map((tag) => <Tag key={tag}>#{tag}</Tag>)}
              </div>
              {p.studies.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.studies.map((s) => (
                    <span key={s.study_id} className={cx("rounded-full border px-2 py-0.5 text-[11px] font-medium", statusTone(s.status))}>
                      {s.study_title} · {STATUSES().find(([k]) => k === s.status)?.[1]}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-ink-3">{timeAgo(p.created_at)}</p>
            </Card>
          ))}
          {list.length === 0 && <p className="text-sm text-ink-3">{t("Ningún participante coincide con la búsqueda.")}</p>}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? t("Nuevo participante") : t("Editar participante")} wide>
        {editing && (
          <ParticipantForm studies={studies} initial={editing === "new" ? undefined : editing}
            onSubmit={async (v) => {
              if (editing === "new") await api.post("/participants", { ...v, project_id: projectId });
              else await api.patch(`/participants/${editing.id}`, v);
              setEditing(null); onChange();
            }}
            onLinkChange={onChange} />
        )}
      </Modal>
    </div>
  );
}

function ParticipantForm({ studies, initial, onSubmit, onLinkChange }: {
  studies: Pick<Study, "id" | "title">[]; initial?: Participant;
  onSubmit: (v: Record<string, unknown>) => Promise<void>; onLinkChange: () => void;
}) {
  const [v, setV] = useState({
    name: initial?.name ?? "", email: initial?.email ?? "", phone: initial?.phone ?? "",
    tags: initial?.tags.join(", ") ?? "", notes: initial?.notes ?? "", consent: initial?.consent ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [studyId, setStudyId] = useState("");
  const [status, setStatus] = useState<ParticipantStudyStatus>("invited");
  const linked = new Set((initial?.studies ?? []).map((s) => s.study_id));
  const available = studies.filter((s) => !linked.has(s.id));

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    try {
      await onSubmit({ name: v.name, email: v.email, phone: v.phone, notes: v.notes, consent: v.consent, tags: v.tags.split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean) });
    } catch (err) { setError((err as Error).message); }
  }
  async function addLink() {
    if (!initial || !studyId) return;
    await api.post(`/participants/${initial.id}/studies`, { study_id: studyId, status });
    setStudyId(""); onLinkChange();
  }
  async function removeLink(sid: string) {
    if (!initial) return;
    await api.del(`/participants/${initial.id}/studies/${sid}`);
    onLinkChange();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Nombre")}><input autoFocus required className="field font-medium" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label={t("Teléfono")}><input className="field" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
        <Field label={t("Correo")}><input type="email" className="field" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label={t("Etiquetas")} hint={t("Separadas por comas: VIP, móvil, remoto")}><input className="field" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} /></Field>
      </div>
      <Field label={t("Notas")}><textarea className="field min-h-24" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-paper/60 px-3 py-2.5 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-accent" checked={v.consent} onChange={(e) => setV({ ...v, consent: e.target.checked })} />
        <span>{t("Dio su consentimiento informado")}</span>
        {initial?.consent_at && <span className="ml-auto text-xs text-ink-3">{timeAgo(initial.consent_at)}</span>}
      </label>

      {initial && (
        <div className="rounded-xl border border-line p-3">
          <p className="label mb-2">{t("Historial de estudios")}</p>
          {initial.studies.length === 0 && <p className="text-sm text-ink-3">{t("Aún no lo has vinculado a ningún estudio.")}</p>}
          <ul className="space-y-1.5">
            {initial.studies.map((s) => (
              <li key={s.study_id} className="flex items-center gap-2 rounded-lg bg-paper px-2.5 py-1.5 text-[13px]">
                <span className="flex-1 truncate">{s.study_title}</span>
                <span className={cx("rounded-full border px-2 py-0.5 text-[11px] font-medium", statusTone(s.status))}>{STATUSES().find(([k]) => k === s.status)?.[1]}</span>
                <button type="button" onClick={() => removeLink(s.study_id)} className="text-ink-3 hover:text-bad"><X size={13} /></button>
              </li>
            ))}
          </ul>
          {available.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select className="field h-9 w-44 py-0" value={studyId} onChange={(e) => setStudyId(e.target.value)} aria-label={t("Estudio")}>
                <option value="">{t("— Elige un estudio —")}</option>
                {available.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              <select className="field h-9 w-32 py-0" value={status} onChange={(e) => setStatus(e.target.value as ParticipantStudyStatus)} aria-label={t("Estado")}>
                {STATUSES().map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button type="button" onClick={addLink} disabled={!studyId} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-on-accent disabled:opacity-40"><Check size={13} /> {t("Vincular")}</button>
            </div>
          )}
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end"><Button variant="primary">{t("Guardar participante")}</Button></div>
    </form>
  );
}
