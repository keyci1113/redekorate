// "New ticket" and "Create ticket from insight": the same form; the second one carries the insight's evidence and links both ways.
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, FileText, FlaskConical, Lightbulb, X } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { t } from "../lib/i18n";
import type { Insight, Study } from "../lib/types";
import type { DocRecord } from "../docs/types";
import { Avatar } from "../components/Avatar";
import { Button, ErrorNote, SeverityBadge, cx } from "../components/ui";
import { PRIORITIES, TYPES, type LinkTarget, type TicketDetail, type TicketList, type Column, type TicketPriority, type TicketType } from "./model";
import { Dialog, LabelChip, MenuNote, MenuSearch, PriorityMark, columnName, typeLabel } from "./parts";
import { Menu, MenuItem } from "../components/Menu";

interface Chosen { type: Exclude<LinkTarget, "ticket">; id: string; title: string }
const label = "text-[13px] font-semibold";
const input = "field min-h-10 rounded-[10px] border-line-2 py-1.5 text-sm";

/** A field that opens a menu of choices: same look as the inputs around it, the project's own menu instead of the browser's. */
function Picker({ id, label: name, children, menu, search }: { id: string; label: string; children: ReactNode; menu: (close: () => void) => ReactNode; search?: boolean }) {
  return (
    <Menu label={name} width="trigger" button={(p) => (
      <button {...p} id={id} className={cx(input, "flex items-center justify-between gap-2 text-left hover:border-accent/60")}>
        <span className="flex min-w-0 items-center gap-2 truncate">{children}</span><ChevronDown size={15} aria-hidden className="shrink-0 text-ink-3" />
      </button>
    )}>
      {(close) => <div className={search ? "" : "contents"}>{menu(close)}</div>}
    </Menu>
  );
}
const Req = () => <span aria-hidden className="text-bad"> *</span>;
const F = ({ id, text, required, hint, children }: { id: string; text: string; required?: boolean; hint?: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor={id} className={label}>{text}{required && <Req />}</label>{children}{hint && <span className="text-xs text-ink-3">{hint}</span>}</div>
);

export function NewTicketDialog({ projectId, projectName, column, insight, onClose, onCreated }: {
  projectId: string; projectName: string; column?: Column; insight?: Insight; onClose: () => void; onCreated: (t: TicketDetail) => void;
}) {
  const meta = useLoad(() => api.get<TicketList>(`/projects/${projectId}/tickets`), [projectId]);
  const [title, setTitle] = useState(insight?.title ?? "");
  const [type, setType] = useState<TicketType | null>(null);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [milestone, setMilestone] = useState("");
  const [labels, setLabels] = useState<string[]>(insight?.tags ?? []);
  const [draft, setDraft] = useState("");
  const [links, setLinks] = useState<Chosen[]>([]);
  const [another, setAnother] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<number | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const people = meta.data?.people ?? [], milestones = meta.data?.milestones ?? [];
  const next = meta.data ? `#${meta.data.next_number}` : "…";
  const who = people.find((p) => p.id === assignee);

  const addLabel = () => { const v = draft.trim(); if (v && !labels.some((l) => l.toLowerCase() === v.toLowerCase())) setLabels([...labels, v]); setDraft(""); };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !type) { setError(t("Escribe un título y elige un tipo.")); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ ticket: TicketDetail }>(`/projects/${projectId}/tickets`, {
        title: title.trim(), type, description, priority, ...(column ? { column: column.id } : {}), due_date: due || null, milestone_id: milestone || null,
        assignees: assignee ? [assignee] : [], labels: draft.trim() ? [...labels, draft.trim()] : labels,
        links: [...(insight ? [{ target_type: "insight", target_id: insight.id, relation: "evidence" }] : []), ...links.map((l) => ({ target_type: l.type, target_id: l.id }))],
      });
      onCreated(r.ticket);
      if (!another) { onClose(); return; }
      setMade(r.ticket.number); setTitle(""); setDescription(""); setDraft("");
      await meta.reload();
      titleRef.current?.focus();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog onClose={onClose} title={insight ? t("Crear ticket desde un insight") : t("Nuevo ticket")}
      subtitle={insight ? t("En {a} · será {b}", { a: projectName, b: next }) : t("En {a} · será {b} · estado {c}", { a: projectName, b: next, c: column ? columnName(column) : columnName({ name: null, status: "todo" }) })}>
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        {insight && (
          <div className="rounded-xl border border-line bg-paper p-3">
            <p className="text-xs font-semibold text-ink-3">{t("Evidencia que viene del insight")}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 font-semibold"><SeverityBadge severity={insight.severity} />{insight.title}</p>
            {insight.body && <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed whitespace-pre-line text-ink-2">{insight.body}</p>}
            {insight.study_title && <p className="mt-1.5 text-xs text-ink-3">{insight.study_title}</p>}
          </div>
        )}
        <F id="nt-title" text={t("Título")} required hint={insight ? t("Sugerido a partir del título del insight. Edítalo para describir el trabajo.") : undefined}>
          <input id="nt-title" ref={titleRef} data-autofocus type="text" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
        </F>
        <fieldset className="flex flex-col">
          <legend className={cx(label, "mb-1.5")}>{t("Tipo")}<Req /></legend>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((x) => (
              <label key={x} className={cx("inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border bg-surface px-2.5 text-[13px] font-medium has-focus-visible:ring-2 has-focus-visible:ring-accent", type === x ? "border-accent bg-accent-soft" : "border-line-2")}>
                <input type="radio" name="ticket-type" required checked={type === x} onChange={() => setType(x)} className="accent-(--color-accent)" />{typeLabel(x)}
              </label>
            ))}
          </div>
        </fieldset>
        {!insight && (
          <F id="nt-desc" text={t("Descripción")}>
            <textarea id="nt-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={20000} placeholder={t("¿Qué tiene que pasar, y cómo sabremos que está listo?")} className={cx(input, "min-h-16")} />
          </F>
        )}
        <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
          <F id="nt-priority" text={t("Prioridad")}>
            <Picker id="nt-priority" label={t("Prioridad")} menu={(close) => PRIORITIES.map((p) => <MenuItem key={p} checked={p === priority} onSelect={() => { setPriority(p); close(); }}><PriorityMark priority={p} /></MenuItem>)}>
              <PriorityMark priority={priority} />
            </Picker>
          </F>
          <F id="nt-assignee" text={t("Asignado")} hint={t("Solo se puede asignar a colaboradores del proyecto")}>
            <Picker id="nt-assignee" label={t("Asignado")} menu={(close) => <>
              <MenuItem checked={assignee === ""} onSelect={() => { setAssignee(""); close(); }}>{t("Sin asignar")}</MenuItem>
              {people.map((p) => <MenuItem key={p.id} checked={p.id === assignee} onSelect={() => { setAssignee(p.id); close(); }}><Avatar name={p.name} avatar={p.avatar} size={22} /><span className="truncate">{p.name}</span></MenuItem>)}
            </>}>
              {who ? <><Avatar name={who.name} avatar={who.avatar} size={20} /><span className="truncate">{who.name}</span></> : <span className="text-ink-3">{t("Sin asignar")}</span>}
            </Picker>
          </F>
          <F id="nt-due" text={t("Fecha límite")}><input id="nt-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cx(input, "tabular-nums")} /></F>
          <F id="nt-ms" text={t("Hito")}>
            <Picker id="nt-ms" label={t("Hito")} menu={(close) => <>
              <MenuItem checked={milestone === ""} onSelect={() => { setMilestone(""); close(); }}>{t("Sin hito")}</MenuItem>
              {milestones.map((m) => <MenuItem key={m.id} checked={m.id === milestone} onSelect={() => { setMilestone(m.id); close(); }}><span className="truncate">{m.name}</span></MenuItem>)}
            </>}>
              {milestones.find((m) => m.id === milestone)?.name ?? <span className="text-ink-3">{t("Sin hito")}</span>}
            </Picker>
          </F>
        </div>
        <F id="nt-label" text={t("Etiquetas|ticket")}>
          <div className={cx(input, "flex flex-wrap items-center gap-1.5 py-1")}>
            {labels.map((l) => <LabelChip key={l} onRemove={() => setLabels(labels.filter((x) => x !== l))}>{l}</LabelChip>)}
            <input id="nt-label" type="text" value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} onBlur={addLabel}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addLabel(); } }} placeholder={t("Agregar una etiqueta")} className="min-h-7 min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3" />
          </div>
        </F>
        {insight ? (
          <p className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-[13px] font-medium text-accent-ink"><Lightbulb size={15} aria-hidden />{t("El insight y el ticket quedarán vinculados entre sí")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className={label}>{t("Vincular con")}</span>
            <div className="flex flex-wrap items-center gap-2">
              {links.map((l) => (
                <span key={l.id} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-paper py-0.5 pr-1 pl-2.5 text-[13px]">
                  {l.title}<button type="button" onClick={() => setLinks(links.filter((x) => x.id !== l.id))} aria-label={t("Quitar vínculo con {a}", { a: l.title })} className="focus-ring relative rounded-full p-1 text-ink-3 before:absolute before:-inset-2 hover:text-ink"><X size={13} /></button>
                </span>
              ))}
              <LinkPicker projectId={projectId} kinds={["study", "document"]} text={t("Estudio o documento")} icon={<FlaskConical size={14} aria-hidden />} chosen={links} onPick={(c) => setLinks([...links, c])} />
              <LinkPicker projectId={projectId} kinds={["insight"]} text={t("Insight")} icon={<Lightbulb size={14} aria-hidden />} chosen={links} onPick={(c) => setLinks([...links, c])} />
            </div>
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <p role="status" className={made ? "text-[13px] font-medium text-good" : "sr-only"}>{made ? t("Ticket #{n} creado. Puedes crear el siguiente.", { n: made }) : ""}</p>
        <div className="-mx-5 -mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper px-5 py-3">
          {insight ? <span /> : (
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} className="h-4 w-4 accent-(--color-accent)" />{t("Crear otro después de este")}</label>
          )}
          <span className="flex gap-2"><Button type="button" onClick={onClose}>{t("Cancelar")}</Button><Button type="submit" variant="primary" disabled={busy}>{t("Crear ticket")}</Button></span>
        </div>
      </form>
    </Dialog>
  );
}

function LinkPicker({ projectId, kinds, text, icon, chosen, onPick }: { projectId: string; kinds: Chosen["type"][]; text: string; icon: ReactNode; chosen: Chosen[]; onPick: (c: Chosen) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const data = useLoad(async (): Promise<Chosen[]> => {
    if (!open) return [];
    const out: Chosen[] = [];
    if (kinds.includes("study")) out.push(...(await api.get<{ studies: Study[] }>(`/projects/${projectId}/studies`)).studies.map((s) => ({ type: "study" as const, id: s.id, title: s.title })));
    if (kinds.includes("document")) out.push(...(await api.get<{ documents: DocRecord[] }>(`/documents?project_id=${projectId}`)).documents.map((d) => ({ type: "document" as const, id: d.id, title: d.title })));
    if (kinds.includes("insight")) out.push(...(await api.get<{ insights: Insight[] }>(`/projects/${projectId}/insights`)).insights.map((i) => ({ type: "insight" as const, id: i.id, title: i.title })));
    return out;
  }, [open, projectId]);
  const options = (data.data ?? []).filter((o) => !chosen.some((c) => c.id === o.id) && o.title.toLowerCase().includes(q.toLowerCase()));
  const ICON = { study: <FlaskConical size={15} />, document: <FileText size={15} />, insight: <Lightbulb size={15} /> };
  return (
    <Menu label={text} width={320} button={(p) => (
      <button {...p} onClick={() => { setOpen(true); p.onClick(); }} className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-line-2 bg-surface px-2.5 text-[13px] font-medium text-ink-2 hover:bg-ink/5">{icon}{text}</button>
    )}>
      {(close) => <>
        <MenuSearch value={q} onChange={setQ} label={t("Buscar qué vincular")} placeholder={t("Buscar por título")} />
        {data.loading && <MenuNote>{t("Cargando…")}</MenuNote>}
        {!data.loading && !options.length && <MenuNote>{t("Nada que vincular todavía.")}</MenuNote>}
        {options.slice(0, 8).map((o) => <MenuItem key={o.id} onSelect={() => { close(); onPick(o); }}><span aria-hidden className="text-ink-3">{ICON[o.type]}</span><span className="truncate">{o.title}</span></MenuItem>)}
      </>}
    </Menu>
  );
}
