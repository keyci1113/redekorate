// One ticket: the side panel that opens next to the board or the list, and the full page.
// Both are built from the same sections; only the layout differs.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, ChevronDown, ChevronRight, ChevronUp, Copy, FileText, FlaskConical, Lightbulb, Link2, Maximize2, MessageSquareDot, Plus, Ticket as TicketIcon, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { copy, useLoad } from "../lib/hooks";
import { canComment, canEdit as roleCanEdit, isOwner as roleIsOwner } from "../lib/roles";
import { plural, relTime, t } from "../lib/i18n";
import { isSendShortcut } from "../lib/keys";
import type { ProjectRole, Severity, Study } from "../lib/types";
import type { DocRecord } from "../docs/types";
import { Avatar } from "../components/Avatar";
import { BackLink, Button, ErrorNote, SeverityBadge, cx, severityLabel } from "../components/ui";
import {
  BUILT_IN_COLUMNS, PRIORITIES, STATUSES, TYPES, applyMention, columnOf, isoDay, mentionOptions, mentionQuery, severityFromPriority, splitMentions,
  type LinkTarget, type Milestone, type Person, type PersonRef, type Reporter, type TicketActivity, type TicketComment, type TicketDetail, type TicketList, type TicketPriority, type TicketStatus, type TicketType,
} from "./model";
import { Dialog, LabelChip, MenuNote, MenuSearch, PersonChip, PriorityMark, Skeleton, ColumnChip, StatusChip, TypeChip, columnName, fmtDay, fmtDayLong, fmtMoment, priorityLabel, statusLabel, typeLabel } from "./parts";
import { Menu, MenuItem } from "../components/Menu";

type Patch = Partial<{ title: string; description: string; type: TicketType; status: TicketStatus; column: string; priority: TicketPriority; due_date: string | null; milestone_id: string | null; milestone_name: string; assignees: string[]; watchers: string[]; labels: string[] }>;
const roleLabel = (r: ProjectRole) => ({ owner: t("Dueño/a"), editor: t("Editor"), commenter: t("Comentarista"), viewer: t("Solo lectura") })[r];
const firstName = (name: string | null) => (name ?? "").trim().split(/\s+/)[0] || t("quien reportó");

/** Loads a ticket with the project's people and milestones, and exposes every change the screens make. */
function useTicket(projectId: string, number: number, onChanged?: () => void) {
  const detail = useLoad(() => api.get<{ ticket: TicketDetail; role: ProjectRole; ticket_only?: boolean }>(`/projects/${projectId}/tickets/${number}`), [projectId, number]);
  const meta = useLoad(() => api.get<TicketList>(`/projects/${projectId}/tickets`), [projectId]);
  const [error, setError] = useState<string | null>(null);
  const base = `/projects/${projectId}/tickets/${number}`;
  const ticket = detail.data?.ticket ?? null, role = detail.data?.role;

  /** Sends a change and shows the server's version; a refusal leaves the ticket as it was and says why. */
  async function run(send: () => Promise<{ ticket: TicketDetail }>, optimistic?: Partial<TicketDetail>) {
    const before = detail.data;
    if (before && optimistic) detail.setData({ ...before, ticket: { ...before.ticket, ...optimistic } });
    setError(null);
    try {
      const r = await send();
      detail.setData({ ticket: r.ticket, role: before?.role ?? "viewer", ticket_only: before?.ticket_only });
      onChanged?.();
      return true;
    } catch (e) {
      if (before) detail.setData(before);
      setError(t("No se pudo guardar el cambio: {a}", { a: (e as Error).message }));
      return false;
    }
  }
  return {
    ticket, role, loading: detail.loading && !detail.data, loadError: detail.error, reload: detail.reload, error, clearError: () => setError(null),
    people: meta.data?.people ?? [], milestones: meta.data?.milestones ?? [], reloadMeta: meta.reload,
    /** Everyone a comment can @mention: the ticket people plus those who would get to read this ticket only. */
    mentionable: [...(meta.data?.people ?? []), ...(meta.data?.mention_only ?? []).map((p) => ({ ...p, ticket_only: true }))],
    /** This person reads the ticket only because someone @mentioned them on it. */
    ticketOnly: !!detail.data?.ticket_only,
    columns: meta.data?.columns?.length ? meta.data.columns : BUILT_IN_COLUMNS,
    patch: (p: Patch, optimistic?: Partial<TicketDetail>) => run(() => api.patch(base, p), optimistic),
    comment: (body: string, visibility: "internal" | "email_to_reporter") => run(() => api.post(`${base}/comments`, { body, visibility })),
    editComment: (id: string, body: string) => run(() => api.patch(`${base}/comments/${id}`, { body })),
    deleteComment: (id: string) => run(() => api.del(`${base}/comments/${id}`)),
    link: (target_type: LinkTarget, target: { id?: string; number?: number }) => run(() => api.post(`${base}/links`, { target_type, target_id: target.id, target_number: target.number })),
    unlink: (id: string) => run(() => api.del(`${base}/links/${id}`)),
    toInsight: (body: { title: string; body: string; severity: Severity; tags: string[] }) => run(() => api.post(`${base}/insight`, body)),
    eraseReporter: () => run(() => api.del(`${base}/reporter`)),
    removeAttachment: (url: string) => run(() => api.del(`${base}/attachments`, { url })),
  };
}
type TicketApi = ReturnType<typeof useTicket>;
interface Ctx { api: TicketApi; ticket: TicketDetail; projectId: string; canEdit: boolean; canWrite: boolean; reporter: Reporter | null }

// ── Side panel ──────────────────────────────────────────────────
const PANEL_WIDTH = 440, PANEL_GAP = 24;
/** The panel is fixed to the right edge of the window. This empty box sits beside the board and takes
 *  only as much width as the panel covers, so nothing ends up hidden under it. */
function PanelRoom() {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const row = box.current?.parentElement;
      if (!row) return;
      const free = document.documentElement.clientWidth - row.getBoundingClientRect().right;
      setWidth(Math.max(0, PANEL_WIDTH + PANEL_GAP - free));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  // The row's own gap already separates the board from this box, so it is left out of the width.
  return <div ref={box} aria-hidden className={width > 0 ? "hidden shrink-0 lg:block" : "hidden"} style={{ width: Math.max(0, width - PANEL_GAP) }} />;
}

export function TicketPanel({ projectId, projectName, number, position, onGo, onClose, onChanged, onDeleted }: {
  projectId: string; /** Shown as a field when the panel is opened outside its project (My work). */ projectName?: string; number: number; position: { index: number; total: number; prev: number | null; next: number | null };
  onGo: (n: number) => void; onClose: () => void; onChanged: () => void; onDeleted: () => void;
}) {
  const tk = useTicket(projectId, number, onChanged);
  const aside = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { aside.current?.focus(); }, []);
  useEffect(() => { if (tk.loadError && !tk.ticket) onDeleted(); /* the ticket no longer exists */ }, [tk.loadError, tk.ticket, onDeleted]);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const el = e.target as HTMLElement;
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (el.closest("input, textarea, select, [role='menu'], [role='listbox']")) return;
    if (e.key === "ArrowUp" && position.prev !== null) { e.preventDefault(); onGo(position.prev); }
    if (e.key === "ArrowDown" && position.next !== null) { e.preventDefault(); onGo(position.next); }
  };
  const icon = "focus-ring flex h-11 w-11 items-center justify-center rounded-[10px] text-ink-2 hover:bg-ink/5 disabled:opacity-40";
  const ctx = tk.ticket ? context(tk, projectId) : null;

  return (
    <>
    <PanelRoom />
    <aside ref={aside} tabIndex={-1} aria-label={t("Vista previa del ticket #{n}", { n: number })} onKeyDown={onKey}
      className="tk-panel fixed inset-0 z-40 flex flex-col overflow-y-auto border-line bg-surface outline-none lg:left-auto lg:w-[440px] lg:rounded-l-2xl lg:border-l lg:shadow-[-8px_0_24px_rgb(26_21_35/0.08)]">
      <div className="sticky top-0 z-[2] flex items-center justify-between gap-2 border-b border-line bg-surface py-1.5 pr-2 pl-5">
        <span className="text-[13px] text-ink-3 tabular-nums">{position.index > 0 ? t("{a} de {b}", { a: position.index, b: position.total }) : `#${number}`}</span>
        <span className="flex items-center gap-0.5">
          <button type="button" className={icon} disabled={position.prev === null} onClick={() => position.prev !== null && onGo(position.prev)} aria-label={t("Ticket anterior")} title={t("Ticket anterior")}><ChevronUp size={16} /></button>
          <button type="button" className={icon} disabled={position.next === null} onClick={() => position.next !== null && onGo(position.next)} aria-label={t("Ticket siguiente")} title={t("Ticket siguiente")}><ChevronDown size={16} /></button>
          <span aria-hidden className="mx-1 h-5 w-px bg-line" />
          <button type="button" className={icon} onClick={async () => { await copy(`${location.origin}/projects/${projectId}/tickets/${number}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }} aria-label={t("Copiar link de #{n}", { n: number })} title={t("Copiar link de #{n}", { n: number })}><Link2 size={15} /></button>
          <Link to={`/projects/${projectId}/tickets/${number}`} className={icon} aria-label={t("Abrir en página completa")} title={t("Abrir en página completa")}><Maximize2 size={15} /></Link>
          <button type="button" className={icon} onClick={onClose} aria-label={t("Cerrar vista previa")} title={t("Cerrar vista previa")}><X size={16} /></button>
        </span>
      </div>
      <span role="status" className="sr-only">{copied ? t("Link copiado") : ""}</span>
      {tk.loading || !ctx ? <DetailSkeleton /> : (
        <div className="flex flex-col px-6 pt-5 pb-8">
          <Heading ctx={ctx} />
          {tk.error && <div className="mt-3"><ErrorNote>{tk.error}</ErrorNote></div>}
          <PeopleSection ctx={ctx} people={tk.people} />
          {projectName && <div className="pt-2"><Row label={t("Proyecto")}><Link to={`/projects/${projectId}?tab=tickets&ticket=${number}`} className="focus-ring inline-flex min-h-11 items-center rounded-lg px-2.5 text-[13px] font-semibold text-accent-ink hover:underline">{projectName}</Link></Row></div>}
          <FieldRows ctx={ctx} milestones={tk.milestones} onMilestoneCreated={tk.reloadMeta} />
          <div className="mt-2 flex flex-col gap-6 border-t border-line/60 pt-5">
            <Description ctx={ctx} />
            <Evidence ctx={ctx} />
            <Linked ctx={ctx} />
            {ctx.reporter && <section><H3>{t("Detalles")}</H3><div className="flex flex-col gap-2.5"><WidgetDetails reporter={ctx.reporter} /></div></section>}
            <Conversation ctx={ctx} people={tk.mentionable} />
            <Activity items={ctx.ticket.activity} />
          </div>
        </div>
      )}
    </aside>
    </>
  );
}

// ── Full page ───────────────────────────────────────────────────
export function TicketFull({ projectId, projectName, projectColor, number, onDeleted }: { projectId: string; projectName: string; projectColor?: string; number: number; onDeleted: () => void }) {
  const tk = useTicket(projectId, number);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"merge" | "erase" | "delete" | null>(null);
  if (tk.loading) return <DetailSkeleton />;
  if (tk.loadError || !tk.ticket) return <div className="space-y-3"><ErrorNote>{tk.loadError ?? t("Ticket no encontrado")}</ErrorNote><Button onClick={() => tk.reload()}>{t("Reintentar")}</Button></div>;
  const ctx = context(tk, projectId), x = tk.ticket, r = ctx.reporter;
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); setConfirm(null); } catch (e) { alert((e as Error).message); } };
  return (
    <>
      <BackLink to={`/projects/${projectId}?tab=tickets`} color={projectColor} label={projectName} section={t("Tickets")} />
      <div className="mt-4"><Heading ctx={ctx} large /></div>
      {r && <p className="mt-1 text-[13px] text-ink-3">{t("El título se tomó del mensaje. Edítalo como cualquier ticket.")}</p>}
      {tk.ticketOnly && <p className="mt-1 text-[13px] text-ink-3">{t("Te mencionaron en este ticket: puedes leerlo, pero no ves los demás tickets del proyecto.")}</p>}
      {tk.error && <div className="mt-3"><ErrorNote>{tk.error}</ErrorNote></div>}
      <div className="mt-6 flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-6">
          <Box><Description ctx={ctx} /></Box>
          <Box><Evidence ctx={ctx} always /><div className="mt-5"><Linked ctx={ctx} /></div></Box>
          <Box><Conversation ctx={ctx} people={tk.mentionable} /></Box>
          <Box><Activity items={x.activity} /></Box>
        </div>
        <aside aria-label={t("Detalles del ticket")} className="flex w-full flex-[1_1_360px] flex-col gap-4 lg:max-w-[400px]">
          <Box><PeopleSection ctx={ctx} people={tk.people} /><FieldRows ctx={ctx} milestones={tk.milestones} onMilestoneCreated={tk.reloadMeta} /></Box>
          {r && <WidgetDetails reporter={r} />}
          {x.similar && (
            <Box>
              <p className="text-[13px] font-semibold text-ink-2">{t("Se parece a")}</p>
              <Link to={`/projects/${projectId}/tickets/${x.similar.number}`} className="focus-ring mt-1 block rounded text-sm font-semibold hover:underline"><span className="text-ink-3 tabular-nums">#{x.similar.number}</span> {x.similar.title}</Link>
              {ctx.canEdit && <>
                <Button className="mt-3 min-h-11" onClick={() => setConfirm("merge")}>{t("Fusionar en #{n}", { n: x.similar.number })}</Button>
                <p className="mt-2 text-xs text-ink-3">{r ? t("Al fusionar, el mensaje, la captura y los detalles de {a} pasan a #{n}, y las respuestas le siguen llegando.", { a: firstName(r.name), n: x.similar.number }) : t("Al fusionar, la conversación, las personas y los vínculos pasan a #{n} y este ticket se elimina.", { n: x.similar.number })}</p>
              </>}
            </Box>
          )}
          <div className="flex flex-col gap-2 px-1 text-[13px] text-ink-3">
            <p>{x.source === "widget" ? t("Creado por el widget de feedback el {a}", { a: fmtMoment(x.created_at) }) : t("Creado por {a} el {b}", { a: x.created_by_name ?? t("alguien"), b: fmtDayLong(x.created_at) })}{x.source === "insight" ? ` ${t("desde un insight")}` : ""}</p>
            <p>{t("Actualizado {a}", { a: relTime(x.updated_at) })}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button className="min-h-11" icon={<Copy size={14} />} onClick={async () => { await copy(location.href); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? t("Link copiado") : t("Copiar link de #{n}", { n: x.number })}</Button>
              {r && !r.erased_at && ctx.canEdit && <Button className="min-h-11" onClick={() => setConfirm("erase")}>{t("Eliminar los datos personales de quien reportó")}</Button>}
              {roleIsOwner(tk.role) && <Button className="min-h-11 text-bad" icon={<Trash2 size={14} />} onClick={() => setConfirm("delete")}>{t("Eliminar ticket")}</Button>}
            </div>
          </div>
        </aside>
      </div>
      {confirm === "merge" && x.similar && (
        <ConfirmBox title={t("¿Fusionar #{a} en #{b}?", { a: x.number, b: x.similar.number })} body={t("La conversación, las personas y los vínculos pasan a #{b}. El ticket #{a} se elimina y esto no se puede deshacer.", { a: x.number, b: x.similar.number })}
          action={t("Fusionar en #{n}", { n: x.similar.number })} onClose={() => setConfirm(null)}
          onConfirm={() => act(async () => { await api.post(`/projects/${projectId}/tickets/${x.number}/merge`, { into: x.similar!.number }); location.assign(`/projects/${projectId}/tickets/${x.similar!.number}`); })} />
      )}
      {confirm === "erase" && (
        <ConfirmBox title={t("¿Eliminar los datos personales de quien reportó?")} body={t("Se borran su nombre, correo, identificador, datos del dispositivo, datos personalizados y adjuntos. El ticket y su texto se conservan. Esto no se puede deshacer.")}
          action={t("Eliminar datos")} danger onClose={() => setConfirm(null)} onConfirm={() => act(() => tk.eraseReporter())} />
      )}
      {confirm === "delete" && (
        <ConfirmBox title={t("¿Eliminar el ticket #{n}?", { n: x.number })} body={t("Se eliminan sus comentarios y su historial. Los insights vinculados se conservan, pero pierden el vínculo. Esto no se puede deshacer.")}
          action={t("Eliminar ticket")} danger onClose={() => setConfirm(null)} onConfirm={() => act(async () => { await api.post(`/projects/${projectId}/tickets/delete`, { numbers: [x.number] }); onDeleted(); })} />
      )}
    </>
  );
}

function ConfirmBox({ title, body, action, danger, onClose, onConfirm }: { title: string; body: string; action: string; danger?: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog title={title} onClose={onClose} width={480} footer={<><Button size="lg" data-autofocus onClick={onClose}>{t("Cancelar")}</Button><Button size="lg" variant={danger ? "danger" : "primary"} onClick={onConfirm}>{action}</Button></>}>
      <p className="text-sm text-ink-2">{body}</p>
    </Dialog>
  );
}

const context = (tk: TicketApi, projectId: string): Ctx => ({
  api: tk, ticket: tk.ticket!, projectId, canEdit: roleCanEdit(tk.role), canWrite: canComment(tk.role),
  reporter: tk.ticket!.reporters[0] ?? null,
});
const Box = ({ children }: { children: ReactNode }) => <div className="rounded-2xl border border-line bg-surface p-5">{children}</div>;
const H3 = ({ children, count }: { children: ReactNode; count?: number }) => <h3 className="mb-2.5 text-sm font-bold">{children}{count !== undefined && <span className="font-semibold text-ink-3 tabular-nums"> · {count}</span>}</h3>;

function DetailSkeleton() {
  return <div className="flex flex-col gap-4 p-6" aria-busy="true" aria-label={t("Cargando ticket")}><Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
}

// ── Sections ────────────────────────────────────────────────────
function Heading({ ctx, large }: { ctx: Ctx; large?: boolean }) {
  const { ticket: x, reporter } = ctx;
  const [title, setTitle] = useState(x.title);
  useEffect(() => { setTitle(x.title); }, [x.title]);
  const save = () => { const v = title.trim(); if (!v) setTitle(x.title); else if (v !== x.title) void ctx.api.patch({ title: v }, { title: v }); };
  const Tag = large ? "h1" : "h2";
  const style = cx("w-full font-extrabold tracking-[-0.01em] text-ink", large ? "text-[28px] leading-tight" : "text-xl leading-snug");
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-ink-3 tabular-nums">#{x.number}</span>
        <TypeChip type={x.type} /><ColumnChip column={columnOf(x, ctx.api.columns)} />
        {x.source === "widget" && <span className="inline-flex items-center gap-1 rounded-full border border-line-2 px-2 py-[3px] text-xs font-semibold text-ink-2"><MessageSquareDot size={14} aria-hidden />{reporter?.ref ? t("Widget · {a}", { a: reporter.ref }) : t("Widget")}</span>}
      </div>
      {ctx.canEdit ? (
        <Tag className="mt-2.5 mb-1">
          <textarea rows={1} value={title} aria-label={t("Título del ticket")} maxLength={300} onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))} onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
            className={cx(style, "focus-ring -mx-1.5 block resize-none rounded-lg bg-transparent px-1.5 py-0.5 [field-sizing:content] hover:bg-ink/5")} />
        </Tag>
      ) : <Tag className={cx(style, "mt-2.5 mb-1")}>{x.title}</Tag>}
    </>
  );
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid min-h-11 grid-cols-[104px_minmax(0,1fr)] items-center gap-3"><span className="text-[13px] text-ink-3">{label}</span><span className="min-w-0">{children}</span></div>
);
const fieldBtn = "focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-ink hover:bg-ink/5";
const Block = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2 border-b border-line/60 py-3"><span className="text-[13px] font-semibold text-ink-2">{label}</span><div className="min-w-0">{children}</div></div>
);

function PeoplePicker({ label, text, people, chosen, note, onChange }: { label: string; text: string; people: Person[]; chosen: PersonRef[]; note?: string; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const ids = chosen.map((p) => p.id);
  return (
    <Menu label={label} width={300} button={(p) => <button {...p} className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-line-2 px-3 text-[13px] font-semibold text-ink-2 hover:bg-ink/5"><Plus size={12} aria-hidden />{text}</button>}>
      {() => <>
        <MenuSearch value={q} onChange={setQ} label={t("Buscar personas")} placeholder={t("Buscar colaboradores del proyecto")} />
        {people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).map((p) => (
          <MenuItem key={p.id} kind="checkbox" checked={ids.includes(p.id)} onSelect={() => onChange(ids.includes(p.id) ? ids.filter((i) => i !== p.id) : [...ids, p.id])}>
            <Avatar name={p.name} avatar={p.avatar} size={24} /><span className="min-w-0 flex-1 truncate">{p.name}</span><span className="text-xs text-ink-3">{roleLabel(p.role)}</span>
          </MenuItem>
        ))}
        {note && <MenuNote>{note}</MenuNote>}
      </>}
    </Menu>
  );
}

function PeopleSection({ ctx, people }: { ctx: Ctx; people: Person[] }) {
  const { ticket: x, reporter: r, canEdit } = ctx;
  const [copied, setCopied] = useState(false);
  const pick = (list: PersonRef[]) => (ids: string[]) => ids.map((id) => list.find((p) => p.id === id) ?? people.find((p) => p.id === id)!).filter(Boolean);
  const setAssignees = (ids: string[]) => void ctx.api.patch({ assignees: ids }, { assignees: pick(x.assignees)(ids) });
  const setWatchers = (ids: string[]) => void ctx.api.patch({ watchers: ids }, { watchers: pick(x.watchers)(ids) });
  return (
    <section aria-label={t("Personas")}>
      {r && (
        <Block label={t("Reportado por")}>
          {r.erased_at ? <p className="text-[13px] text-ink-3">{t("Sus datos personales se eliminaron el {a}.", { a: fmtDayLong(r.erased_at) })}</p> : (
            <div className="flex flex-wrap gap-3">
              <Avatar name={r.name ?? "?"} size={36} />
              <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-0.5">
                <span className="font-bold">{r.name ?? t("Sin nombre")}{r.verified && <span className="text-xs font-medium text-tk-done-ink"> · {t("usuario verificado")}</span>}</span>
                {r.email && (
                  <span className="flex flex-wrap items-center gap-1.5 text-[13px]">
                    <a href={`mailto:${r.email}`} className="focus-ring rounded font-semibold text-accent-ink hover:underline">{r.email}</a>
                    <button type="button" onClick={async () => { await copy(r.email!); setCopied(true); setTimeout(() => setCopied(false), 1600); }} aria-label={t("Copiar correo {a}", { a: r.email })}
                      className="focus-ring relative inline-flex min-h-8 items-center gap-1 rounded-lg border border-line-2 px-2 text-xs font-semibold text-ink-2 before:absolute before:-inset-1.5 hover:bg-ink/5"><Copy size={13} aria-hidden />{copied ? t("Copiado") : t("Copiar")}</button>
                  </span>
                )}
                <span className="text-xs text-ink-3">{t("Reportado el {a}", { a: fmtMoment(r.metadata.sent_at ?? r.created_at) })}{r.metadata.page_url ? ` ${t("desde {a}", { a: hostOf(r.metadata.page_url) })}` : ""} · {plural(r.reports_count, { one: "{n} reporte en total", other: "{n} reportes en total" })}</span>
                {r.email && canEdit && <div className="pt-1.5"><a href="#ticket-reply" className="focus-ring inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:border-line-2">{t("Responder a {a}", { a: firstName(r.name) })}</a></div>}
              </div>
            </div>
          )}
          {ctx.ticket.reporters.length > 1 && <p className="mt-2 text-xs text-ink-3">{plural(ctx.ticket.reporters.length - 1, { one: "+{n} persona más reportó lo mismo (tickets fusionados).", other: "+{n} personas más reportaron lo mismo (tickets fusionados)." })}</p>}
        </Block>
      )}
      <Block label={t("Asignado a")}>
        <div className="flex flex-wrap items-center gap-2">
          {x.assignees.map((p) => <PersonChip key={p.id} person={p} removeLabel={t("Quitar asignación de {a}", { a: p.name })} onRemove={canEdit ? () => setAssignees(x.assignees.filter((a) => a.id !== p.id).map((a) => a.id)) : undefined} />)}
          {!x.assignees.length && !canEdit && <span className="text-[13px] text-ink-3">{t("Sin asignar")}</span>}
          {canEdit && <PeoplePicker label={t("Asignar personas")} text={t("Asignar")} people={people} chosen={x.assignees} note={t("Solo se puede asignar a colaboradores del proyecto.")} onChange={setAssignees} />}
        </div>
      </Block>
      <Block label={t("Mencionados")}>
        <div className="flex flex-wrap items-center gap-2">
          {x.watchers.map((p) => <PersonChip key={p.id} person={p} removeLabel={t("Quitar mención de {a}", { a: p.name })} onRemove={canEdit ? () => setWatchers(x.watchers.filter((a) => a.id !== p.id).map((a) => a.id)) : undefined} />)}
          {canEdit && <PeoplePicker label={t("Mencionar personas")} text={t("Mencionar personas")} people={people} chosen={x.watchers} onChange={setWatchers} />}
        </div>
        <p className="mt-2 text-xs text-ink-3">{t("Las personas mencionadas reciben aviso de las novedades de este ticket. También puedes mencionar a alguien con @ en un comentario.")}</p>
      </Block>
    </section>
  );
}
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };

function FieldRows({ ctx, milestones, onMilestoneCreated }: { ctx: Ctx; milestones: Milestone[]; onMilestoneCreated: () => void }) {
  const { ticket: x, canEdit } = ctx;
  const [label, setLabel] = useState("");
  const [ms, setMs] = useState("");
  const caret = <ChevronDown size={12} aria-hidden className="text-ink-3" />;
  const cols = ctx.api.columns, here = columnOf(x, cols);
  const choice = <T extends string>(name: string, value: T, options: readonly T[], text: (v: T) => string, render: (v: T) => ReactNode, key: "type" | "priority") =>
    canEdit ? (
      <Menu label={name} width={220} button={(p) => <button {...p} aria-label={`${name}: ${text(value)}`} className={fieldBtn}>{render(value)}{caret}</button>}>
        {(close) => options.map((o) => <MenuItem key={o} checked={o === value} onSelect={() => { close(); if (o !== value) void ctx.api.patch({ [key]: o }, { [key]: o }); }}>{render(o)}</MenuItem>)}
      </Menu>
    ) : <span className="px-2.5">{render(value)}</span>;
  const addLabel = (e: FormEvent) => { e.preventDefault(); const v = label.trim(); if (v && !x.labels.includes(v)) void ctx.api.patch({ labels: [...x.labels, v] }, { labels: [...x.labels, v] }); setLabel(""); };
  return (
    <div className="py-2">
      <Row label={t("Estado")}>
        {canEdit ? (
          <Menu label={t("Estado")} width={220} button={(p) => <button {...p} aria-label={`${t("Estado")}: ${columnName(here)}`} className={fieldBtn}><ColumnChip column={here} />{caret}</button>}>
            {(close) => cols.map((c) => <MenuItem key={c.id} checked={c.id === here.id} onSelect={() => { close(); if (c.id !== here.id) void ctx.api.patch({ column: c.id }, { column: c.id, status: c.status }); }}><ColumnChip column={c} /></MenuItem>)}
          </Menu>
        ) : <span className="px-2.5"><ColumnChip column={here} /></span>}
      </Row>
      <Row label={t("Tipo")}>{choice(t("Tipo"), x.type, TYPES, typeLabel, (v) => <TypeChip type={v} />, "type")}</Row>
      <Row label={t("Prioridad")}>{choice(t("Prioridad"), x.priority, PRIORITIES, priorityLabel, (v) => <PriorityMark priority={v} />, "priority")}</Row>
      <Row label={t("Fecha límite")}>
        {canEdit ? (
          <span className="flex items-center gap-1">
            <input type="date" value={x.due_date ?? ""} aria-label={x.due_date ? t("Fecha límite: {a}", { a: fmtDayLong(x.due_date) }) : t("Fecha límite")}
              onChange={(e) => void ctx.api.patch({ due_date: e.target.value || null }, { due_date: e.target.value || null })}
              className="focus-ring min-h-11 rounded-lg bg-transparent px-2.5 text-[13px] text-ink tabular-nums hover:bg-ink/5" />
          </span>
        ) : <span className="px-2.5 text-[13px] tabular-nums">{x.due_date ? fmtDayLong(x.due_date) : "—"}</span>}
      </Row>
      <Row label={t("Hito")}>
        {canEdit ? (
          <Menu label={t("Hito")} width={260} button={(p) => <button {...p} aria-label={t("Hito: {a}", { a: x.milestone ?? t("Sin hito") })} className={fieldBtn}>{x.milestone ?? <span className="text-ink-3">{t("Sin hito")}</span>}{caret}</button>}>
            {(close) => <>
              {milestones.map((m) => <MenuItem key={m.id} checked={m.id === x.milestone_id} onSelect={() => { close(); void ctx.api.patch({ milestone_id: m.id }, { milestone_id: m.id, milestone: m.name }); }}>{m.name}</MenuItem>)}
              <MenuItem checked={x.milestone_id === null} onSelect={() => { close(); void ctx.api.patch({ milestone_id: null }, { milestone_id: null, milestone: null }); }}>{t("Sin hito")}</MenuItem>
              <form className="mt-1 flex flex-col gap-1.5 border-t border-line p-1 pt-2" onSubmit={async (e) => { e.preventDefault(); const v = ms.trim(); if (!v) return; setMs(""); close(); if (await ctx.api.patch({ milestone_name: v })) onMilestoneCreated(); }}>
                <MenuSearch value={ms} onChange={setMs} label={t("Nombre del hito nuevo")} placeholder={t("Crear hito…")} />
                <Button type="submit" size="lg" disabled={!ms.trim()}>{t("Crear y asignar")}</Button>
              </form>
            </>}
          </Menu>
        ) : <span className="px-2.5 text-[13px]">{x.milestone ?? "—"}</span>}
      </Row>
      <Row label={t("Etiquetas|ticket")}>
        <span className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">
          {x.labels.map((l) => <LabelChip key={l} onRemove={canEdit ? () => void ctx.api.patch({ labels: x.labels.filter((y) => y !== l) }, { labels: x.labels.filter((y) => y !== l) }) : undefined}>{l}</LabelChip>)}
          {!x.labels.length && !canEdit && <span className="text-[13px] text-ink-3">—</span>}
          {canEdit && <form onSubmit={addLabel}><label><span className="sr-only">{t("Agregar una etiqueta")}</span><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder={t("Agregar una etiqueta")} className="focus-ring min-h-9 w-36 rounded-lg bg-transparent px-2 text-[13px] placeholder:text-ink-3 hover:bg-ink/5" /></label></form>}
        </span>
      </Row>
    </div>
  );
}

function Description({ ctx }: { ctx: Ctx }) {
  const { ticket: x, reporter: r, canEdit } = ctx;
  const [text, setText] = useState(x.description);
  useEffect(() => { setText(x.description); }, [x.description]);
  const shot = r?.attachments.screenshot;
  // Editors can take out any attachment of the report (a screenshot with private data, a file nobody needs); the text stays.
  const [removing, setRemoving] = useState<{ url: string; what: string } | null>(null);
  const removeButton = (url: string, what: string) => canEdit && (
    <button type="button" onClick={() => setRemoving({ url, what })} aria-label={t("Quitar {a}", { a: what })} title={t("Quitar {a}", { a: what })}
      className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-ink/5 hover:text-bad"><Trash2 size={15} aria-hidden /></button>
  );
  if (r) {
    const kind = r.metadata.kind ? { broken: t("Algo no funciona"), idea: t("Idea"), question: t("Pregunta") }[r.metadata.kind] : null;
    return (
      <section>
        <H3>{t("Lo que envió")}</H3>
        {kind && <p className="mb-2 text-[13px] font-semibold text-ink-2">{kind}</p>}
        <blockquote className="rounded-xl border-l-[3px] border-accent bg-paper px-4 py-3 text-sm leading-relaxed whitespace-pre-line">{x.description || t("(sin mensaje)")}</blockquote>
        {shot && (
          <div className="mt-3">
            <img src={shot} alt={t("Captura de pantalla enviada con el reporte")} className="max-h-56 w-full rounded-xl border border-line bg-paper object-contain" />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <a href={shot} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-11 items-center rounded text-[13px] font-semibold text-accent-ink hover:underline">{t("Abrir en tamaño completo")}</a>
              {removeButton(shot, t("la captura de pantalla"))}
            </div>
          </div>
        )}
        {r.attachments.recording && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-ink-2">{t("Grabación de pantalla")}</p>
              {removeButton(r.attachments.recording, t("la grabación de pantalla"))}
            </div>
            <video src={r.attachments.recording} controls preload="metadata" className="max-h-72 w-full rounded-xl border border-line bg-black" aria-label={t("Grabación de pantalla enviada con el reporte")} />
          </div>
        )}
        {!!r.attachments.files?.length && (
          <ul className="mt-3 flex flex-col gap-1">
            {r.attachments.files.map((f) => (
              <li key={f.url} className="flex items-center justify-between gap-2"><a href={f.url} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2 text-[13px] font-semibold text-accent-ink hover:bg-ink/5"><FileText size={15} aria-hidden className="shrink-0" /><span className="truncate">{f.name}</span></a>{removeButton(f.url, f.name)}</li>
            ))}
          </ul>
        )}
        {removing && (
          <ConfirmBox title={t("¿Quitar {a}?", { a: removing.what })} body={t("Se borra del reporte y del servidor. El mensaje y el resto del ticket se conservan. Esto no se puede deshacer.")}
            action={t("Quitar")} danger onClose={() => setRemoving(null)} onConfirm={() => { const url = removing.url; setRemoving(null); void ctx.api.removeAttachment(url); }} />
        )}
      </section>
    );
  }
  return (
    <section>
      <H3>{t("Descripción")}</H3>
      {canEdit ? (
        <label><span className="sr-only">{t("Descripción")}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== x.description) void ctx.api.patch({ description: text }, { description: text }); }} maxLength={20000}
            placeholder={t("¿Qué tiene que pasar, y cómo sabremos que está listo?")} className="field min-h-24 leading-relaxed [field-sizing:content]" /></label>
      ) : <p className="text-sm leading-relaxed whitespace-pre-line text-ink-2">{x.description || t("Sin descripción.")}</p>}
    </section>
  );
}

function Evidence({ ctx, always }: { ctx: Ctx; always?: boolean }) {
  const insights = ctx.ticket.links.filter((l) => l.target_type === "insight");
  if (!insights.length && !always) return null;
  return (
    <section>
      <H3>{t("Evidencia")}</H3>
      {!insights.length && <p className="text-[13px] text-ink-3">{t("Este ticket aún no tiene un insight vinculado.")}</p>}
      <div className="flex flex-col gap-2">
        {insights.map((l) => (
          <div key={l.id} className="flex items-start gap-3 rounded-xl border border-line bg-paper p-3">
            {l.severity && <SeverityBadge severity={l.severity} />}
            <Link to={`/projects/${ctx.projectId}?tab=insights`} className="focus-ring min-w-0 flex-1 rounded">
              <span className="block text-sm font-semibold">{l.title}</span>
              <span className="block text-xs text-ink-3">{t("Insight")}{l.study_title ? ` · ${t("de {a}", { a: l.study_title })}` : ""}{l.evidence_count ? ` · ${plural(l.evidence_count, { one: "{n} cita", other: "{n} citas" })}` : ""}</span>
            </Link>
            {ctx.canEdit && <button type="button" onClick={() => void ctx.api.unlink(l.id)} aria-label={t("Quitar vínculo con {a}", { a: l.title })} className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-ink/5 hover:text-ink"><X size={15} /></button>}
          </div>
        ))}
      </div>
    </section>
  );
}

const LINK_ICON: Record<LinkTarget, ReactNode> = { insight: <Lightbulb size={15} />, study: <FlaskConical size={15} />, document: <FileText size={15} />, ticket: <TicketIcon size={15} /> };

function Linked({ ctx }: { ctx: Ctx }) {
  const { ticket: x, projectId, canEdit } = ctx;
  const links = x.links.filter((l) => l.target_type !== "insight");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const options = useLoad(async () => {
    if (!open) return null;
    const [s, d, tk] = await Promise.all([
      api.get<{ studies: Study[] }>(`/projects/${projectId}/studies`), api.get<{ documents: DocRecord[] }>(`/documents?project_id=${projectId}`), api.get<TicketList>(`/projects/${projectId}/tickets`),
    ]);
    return { studies: s.studies, documents: d.documents, tickets: tk.tickets.filter((o) => o.number !== x.number) };
  }, [open, projectId]);
  const href = (l: (typeof links)[number]) => l.target_type === "study" ? `/studies/${l.target_id}/results` : l.target_type === "document" ? `/docs/${l.target_id}` : `/projects/${projectId}/tickets/${l.number}`;
  const kind = (k: LinkTarget) => ({ insight: t("Insight"), study: t("Estudio"), document: t("Documento"), ticket: t("Ticket") })[k];
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  if (!links.length && !canEdit) return null;
  return (
    <section>
      <H3>{t("Vinculado")}</H3>
      <ul className="flex flex-col gap-1">
        {links.map((l) => (
          <li key={l.id} className="flex items-center gap-1">
            <Link to={href(l)} className="focus-ring flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-[13px] hover:bg-ink/5">
              <span aria-hidden className="text-ink-3">{LINK_ICON[l.target_type]}</span>
              <span className="min-w-0 truncate"><span className="text-ink-3">{l.target_type === "ticket" ? t("Relacionado con #{n}", { n: l.number }) : kind(l.target_type)} · </span><span className="font-semibold">{l.title}</span></span>
            </Link>
            {canEdit && <button type="button" onClick={() => void ctx.api.unlink(l.id)} aria-label={t("Quitar vínculo con {a}", { a: l.title })} className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-ink/5 hover:text-ink"><X size={15} /></button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Menu label={t("Vincular estudio, documento o ticket")} width={320} button={(p) => (
            <button {...p} onClick={() => { setOpen(true); (p.onClick as () => void)(); }} className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium hover:border-line-2"><Link2 size={14} aria-hidden />{t("Vincular estudio, documento o ticket")}</button>
          )}>
            {(close) => <>
              <MenuSearch value={q} onChange={setQ} label={t("Buscar qué vincular")} placeholder={t("Buscar por título o número")} />
              {options.loading && <MenuNote>{t("Cargando…")}</MenuNote>}
              {options.data && <>
                {options.data.tickets.filter((o) => match(`#${o.number} ${o.title}`)).slice(0, 6).map((o) => <MenuItem key={o.id} onSelect={() => { close(); void ctx.api.link("ticket", { number: o.number }); }}><span aria-hidden className="text-ink-3">{LINK_ICON.ticket}</span><span className="truncate"><span className="text-ink-3 tabular-nums">#{o.number}</span> {o.title}</span></MenuItem>)}
                {options.data.studies.filter((o) => match(o.title)).slice(0, 6).map((o) => <MenuItem key={o.id} onSelect={() => { close(); void ctx.api.link("study", { id: o.id }); }}><span aria-hidden className="text-ink-3">{LINK_ICON.study}</span><span className="truncate">{o.title}</span></MenuItem>)}
                {options.data.documents.filter((o) => match(o.title)).slice(0, 6).map((o) => <MenuItem key={o.id} onSelect={() => { close(); void ctx.api.link("document", { id: o.id }); }}><span aria-hidden className="text-ink-3">{LINK_ICON.document}</span><span className="truncate">{o.title}</span></MenuItem>)}
              </>}
            </>}
          </Menu>
          <Link to={`/projects/${projectId}/new?ticket=${x.number}`} className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium hover:border-line-2"><FlaskConical size={14} aria-hidden />{t("Crear estudio")}</Link>
          {x.converted_insight_id
            ? <Link to={`/projects/${projectId}?tab=insights`} className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium hover:border-line-2"><Lightbulb size={14} aria-hidden />{t("Ver insight")}</Link>
            : x.type !== "research_request" && <button type="button" onClick={() => setConverting(true)} className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium hover:border-line-2"><Lightbulb size={14} aria-hidden />{t("Convertir en insight")}</button>}
        </div>
      )}
      {converting && <ConvertDialog ticket={x} error={ctx.api.error} onClose={() => { setConverting(false); ctx.api.clearError(); }} onConvert={async (b) => { if (await ctx.api.toInsight(b)) setConverting(false); }} />}
    </section>
  );
}

const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

/** "Convert to insight": the insight prefilled from the ticket, to edit and confirm. */
function ConvertDialog({ ticket, error, onClose, onConvert }: { ticket: TicketDetail; error: string | null; onClose: () => void; onConvert: (b: { title: string; body: string; severity: Severity; tags: string[] }) => Promise<void> }) {
  const [title, setTitle] = useState(ticket.title);
  const [body, setBody] = useState(ticket.description ?? "");
  const [severity, setSeverity] = useState<Severity>(severityFromPriority(ticket.priority));
  const [tags, setTags] = useState(ticket.labels.join(", "));
  const [saving, setSaving] = useState(false);
  // A ref, not only state: two clicks in the same frame both see saving === false before React re-renders.
  const pending = useRef(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.current || !title.trim()) return;
    pending.current = true; setSaving(true);
    try { await onConvert({ title: title.trim(), body, severity, tags: tags.split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean) }); }
    finally { pending.current = false; setSaving(false); }
  }
  const label = "mb-1.5 block text-[13px] font-semibold";
  return (
    <Dialog title={t("Convertir en insight")} subtitle={t("Revisa el insight antes de crearlo. El ticket queda vinculado a él.")} onClose={onClose}
      footer={<>
        <Button type="button" onClick={onClose}>{t("Cancelar")}</Button>
        <Button type="submit" form="ticket-to-insight" variant="primary" disabled={saving || !title.trim()}>{saving ? t("Creando…") : t("Crear insight")}</Button>
      </>}>
      <form id="ticket-to-insight" onSubmit={submit} className="flex flex-col gap-3.5">
        <label><span className={label}>{t("Título")}</span>
          <input data-autofocus type="text" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} className="field" /></label>
        <label><span className={label}>{t("Detalle y evidencia")}</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} className="field min-h-28 leading-relaxed" /></label>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label><span className={label}>{t("Severidad")}</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className="field">
              {SEVERITIES.map((s) => <option key={s} value={s}>{severityLabel(s)}</option>)}
            </select></label>
          <label><span className={label}>{t("Etiquetas")}</span>
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("separadas por coma")} className="field" /></label>
        </div>
        <p className="text-xs text-ink-3">{t("La severidad sale de la prioridad del ticket ({a}).", { a: priorityLabel(ticket.priority) })}</p>
        {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
      </form>
    </Dialog>
  );
}

function Fold({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <details className="group overflow-hidden rounded-2xl border border-line bg-surface">
      <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 py-3 font-bold [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} aria-hidden className="group-open:hidden" /><ChevronDown size={14} aria-hidden className="hidden group-open:block" />{title}{badge}
      </summary>
      <div className="border-t border-line/60 px-5 pt-1 pb-3.5">{children}</div>
    </details>
  );
}
const Pair = ({ k, children }: { k: string; children: ReactNode }) => <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-3 py-[7px] text-[13px]"><dt className="text-ink-3">{k}</dt><dd className="leading-snug [overflow-wrap:anywhere]">{children}</dd></div>;
const Sub = ({ children }: { children: ReactNode }) => <span className="block text-xs text-ink-3">{children}</span>;

function WidgetDetails({ reporter: r }: { reporter: Reporter }) {
  const m = r.metadata, custom = Object.entries(r.custom_data ?? {});
  if (r.erased_at) return null;
  return (
    <>
      <Fold title={t("Metadatos")}>
        <dl>
          <Pair k={t("Origen")}>{r.ref ? t("Widget de feedback · {a}", { a: r.ref }) : t("Widget de feedback")}</Pair>
          {m.page_url && <Pair k={t("Página")}><a href={m.page_url} target="_blank" rel="noreferrer" className="focus-ring rounded text-ink underline">{m.page_url}</a>{m.page_title && <Sub>{m.page_title}</Sub>}</Pair>}
          {m.os && <Pair k={t("Sistema")}>{m.os}</Pair>}
          {m.browser && <Pair k={t("Navegador")}>{m.browser}</Pair>}
          {(m.window_size || m.screen_resolution) && <Pair k={t("Tamaño de pantalla")}>{m.window_size && <>{m.window_size}<Sub>{t("Ventana del navegador")}</Sub></>}{m.screen_resolution && <>{m.screen_resolution}<Sub>{t("Resolución")}</Sub></>}</Pair>}
          {m.pixel_ratio !== undefined && <Pair k={t("Densidad de píxeles")}>{String(m.pixel_ratio)}</Pair>}
          {m.color_depth && <Pair k={t("Profundidad de color")}>{m.color_depth}</Pair>}
          {m.language && <Pair k={t("Idioma")}>{m.language}</Pair>}
          {m.timezone && <Pair k={t("Zona horaria")}>{m.timezone}</Pair>}
          {m.approx_location && <Pair k={t("Ubicación")}>{m.approx_location}<Sub>{t("Aproximada, a partir de la dirección IP")}</Sub></Pair>}
          <Pair k={t("Enviado")}>{fmtMoment(m.sent_at ?? r.created_at)}</Pair>
        </dl>
      </Fold>
      {!!m.console_errors?.length && (
        <Fold title={t("Errores de la consola")} badge={<span className="ml-1 rounded-full bg-tk-bug px-2 py-0.5 text-xs font-bold text-tk-bug-ink tabular-nums">{m.console_errors.length}</span>}>
          <ol className="flex flex-col gap-1.5 py-1.5">{m.console_errors.map((e, i) => <li key={i} className="rounded-lg bg-paper px-2.5 py-1.5 font-mono text-[12px] [overflow-wrap:anywhere]">{e}</li>)}</ol>
        </Fold>
      )}
      <Fold title={t("Datos del usuario")} badge={r.verified ? <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-tk-done px-2 py-0.5 text-xs font-bold text-tk-done-ink"><BadgeCheck size={13} aria-hidden />{t("Verificado")}</span> : undefined}>
        <dl>
          <Pair k={t("Usuario")}>{r.external_user_id && <span className="font-semibold">{r.external_user_id}</span>}{r.name && <Sub>{r.name}</Sub>}{r.email && <Sub>{r.email}</Sub>}{m.approx_location && <Sub>{m.approx_location}</Sub>}</Pair>
          {r.first_seen && <Pair k={t("Primera vez")}>{fmtDayLong(r.first_seen)}</Pair>}
          {r.last_seen && <Pair k={t("Última vez")}>{relTime(r.last_seen)}</Pair>}
          <Pair k={t("Reportes enviados")}><span className="tabular-nums">{r.reports_count}</span></Pair>
        </dl>
      </Fold>
      <Fold title={t("Datos personalizados")}>
        {custom.length ? <dl>{custom.map(([k, v]) => <Pair key={k} k={k}><code className="text-[12px]">{JSON.stringify(v)}</code></Pair>)}</dl>
          : <p className="py-2 text-[13px] text-ink-3">{t("No se capturaron datos personalizados.")} <Link to="/help" className="focus-ring rounded font-semibold text-accent-ink hover:underline">{t("Saber más")}</Link></p>}
      </Fold>
    </>
  );
}

// ── Conversation ────────────────────────────────────────────────
const visibilityLabel = (c: TicketComment, to: string) => c.visibility === "email_to_reporter" ? t("Correo a {a}", { a: to }) : c.visibility === "reply_from_reporter" ? t("Respuesta por correo") : t("Interno");

function Conversation({ ctx, people }: { ctx: Ctx; people: Person[] }) {
  const { ticket: x, reporter: r } = ctx;
  const { user: me } = useAuth();
  const canReply = !!r?.email && ctx.canEdit;
  const [mode, setMode] = useState<"internal" | "email_to_reporter">("internal");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pick, setPick] = useState(0);
  const [caret, setCaret] = useState(0);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const to = firstName(r?.name ?? null);
  const query = mode === "internal" ? mentionQuery(body, caret) : null;
  const options = query ? mentionOptions(people, query.query) : [];
  const listOpen = options.length > 0;

  const choose = (name: string) => {
    const next = applyMention(body, caret, name);
    setBody(next.body); setCaret(next.caret); setPick(0);
    requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(next.caret, next.caret); });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSendShortcut(e)) { e.preventDefault(); void submit(); return; }
    if (!listOpen) return;
    if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); setPick((pick + 1) % options.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); setPick((pick - 1 + options.length) % options.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(options[Math.min(pick, options.length - 1)].name); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setCaret(-1); }
  };
  const submit = async () => {
    if (busy || !body.trim()) return;
    setBusy(true);
    if (await ctx.api.comment(body.trim(), mode)) setBody("");
    setBusy(false);
  };
  const tab = (id: typeof mode, label: string) => (
    <button type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
      className={cx("focus-ring min-h-11 rounded-lg px-3 text-[13px]", mode === id ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2")}>{label}</button>
  );
  const label = mode === "internal" ? t("Comentario interno") : t("Responder a {a}", { a: to });
  return (
    <section id="ticket-reply">
      <H3 count={x.comments.length}>{r ? t("Conversación") : t("Comentarios")}</H3>
      <ul className="flex flex-col gap-4">
        {x.comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <Avatar name={c.name ?? "?"} avatar={c.avatar} size={28} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="font-semibold">{c.name ?? t("Cuenta eliminada")}</span>
                <span className="text-xs text-ink-3">{r ? `${visibilityLabel(c, to)} · ` : ""}{fmtMoment(c.created_at)}{c.edited_at && <span title={fmtMoment(c.edited_at)}> · {t("editado")}</span>}</span>
                {c.user_id === me?.id && c.visibility === "internal" && editing !== c.id && <button type="button" onClick={() => setEditing(c.id)} className="focus-ring rounded text-xs text-ink-3 underline hover:text-ink">{t("Editar")}</button>}
                {(c.user_id === me?.id || roleIsOwner(ctx.api.role)) && c.visibility === "internal" && <button type="button" onClick={() => void ctx.api.deleteComment(c.id)} className="focus-ring rounded text-xs text-ink-3 underline hover:text-bad">{t("Borrar")}</button>}
              </p>
              {editing === c.id ? <CommentEditor initial={c.body} onCancel={() => setEditing(null)} onSave={async (next) => { if (await ctx.api.editComment(c.id, next)) setEditing(null); }} /> : (
                <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-line">
                  {splitMentions(c.body, people).map((part, i) => part.mention ? <span key={i} className="font-semibold text-accent-ink">{part.text}</span> : <span key={i}>{part.text}</span>)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {ctx.canWrite && (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mt-4 flex flex-col gap-2">
          {canReply && <div role="tablist" aria-label={t("Tipo de mensaje")} className="flex w-fit gap-1 rounded-[10px] bg-ink/5 p-1">{tab("email_to_reporter", t("Responder a {a}", { a: to }))}{tab("internal", t("Comentario interno"))}</div>}
          <div className="relative">
            <label><span className="sr-only">{label}</span>
              <textarea ref={box} value={body} maxLength={4000} role="combobox" aria-expanded={listOpen} aria-controls="mention-list" aria-autocomplete="list"
                aria-activedescendant={listOpen ? `mention-${options[Math.min(pick, options.length - 1)].id}` : undefined}
                onChange={(e) => { setBody(e.target.value); setCaret(e.target.selectionStart); setPick(0); }} onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)} onKeyDown={onKey}
                placeholder={mode === "internal" ? t("Agrega un comentario…") : t("Escribe tu respuesta a {a}…", { a: to })} className="field min-h-20" /></label>
            {listOpen && (
              <ul id="mention-list" role="listbox" aria-label={t("Personas para mencionar")} className="absolute right-0 bottom-full left-0 z-10 mb-1 rounded-xl border border-line bg-surface p-1.5 shadow-(--shadow-lift)">
                {options.map((p, i) => (
                  <li key={p.id} id={`mention-${p.id}`} role="option" aria-selected={i === pick} onMouseDown={(e) => { e.preventDefault(); choose(p.name); }}
                    className={cx("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13px]", i === pick && "bg-accent-soft")}>
                    <Avatar name={p.name} avatar={p.avatar} size={24} /><span className="flex-1">{p.name}</span><span className="text-xs text-ink-3">{p.ticket_only ? t("Solo verá este ticket") : roleLabel(p.role)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink-3">{mode === "internal" ? (r ? t("Solo tu equipo ve los comentarios internos. Escribe @ para mencionar a alguien.") : t("Escribe @ para mencionar a alguien.")) : t("Se envía por correo a {a}.", { a: r?.email ?? "" })} {t("⌘/Ctrl + Enter para enviar")}</span>
            <Button type="submit" variant="primary" size="lg" disabled={busy || !body.trim()}>{mode === "internal" ? t("Comentar") : t("Enviar correo")}</Button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Editing one's own comment in place: ⌘/Ctrl+Enter saves, Escape cancels. */
function CommentEditor({ initial, onSave, onCancel }: { initial: string; onSave: (body: string) => Promise<void>; onCancel: () => void }) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy || !body.trim()) return;
    if (body.trim() === initial) { onCancel(); return; }
    setBusy(true);
    try { await onSave(body.trim()); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="mt-1 flex flex-col gap-2">
      <label><span className="sr-only">{t("Editar comentario")}</span>
        <textarea autoFocus value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} className="field min-h-20"
          onKeyDown={(e) => {
            if (isSendShortcut(e)) { e.preventDefault(); void save(); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
          }} /></label>
      <span className="flex justify-end gap-2">
        <Button type="button" size="sm" onClick={onCancel}>{t("Cancelar")}</Button>
        <Button type="submit" size="sm" variant="primary" disabled={busy || !body.trim()}>{t("Guardar")}</Button>
      </span>
    </form>
  );
}

// ── Activity ────────────────────────────────────────────────────
const isStatus = (v: string | null): v is TicketStatus => (STATUSES as readonly string[]).includes(v ?? "");
const isType = (v: string | null): v is TicketType => (TYPES as readonly string[]).includes(v ?? "");
const isPriority = (v: string | null): v is TicketPriority => (PRIORITIES as readonly string[]).includes(v ?? "");
const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>;

/** What an activity entry says, after the actor's name. */
function activityText(a: TicketActivity): ReactNode {
  const from = a.from_value, to = a.to_value;
  switch (a.action) {
    case "created": return to === "insight" ? t("creó este ticket desde un insight") : to === "widget" ? t("recibió este ticket desde el widget de feedback") : t("creó este ticket");
    case "status": return <>{t("cambió el estado de")} <B>{isStatus(from) ? statusLabel(from) : from}</B> {t("a")} <B>{isStatus(to) ? statusLabel(to) : to}</B></>;
    case "type": return <>{t("cambió el tipo de")} <B>{isType(from) ? typeLabel(from) : from}</B> {t("a")} <B>{isType(to) ? typeLabel(to) : to}</B></>;
    case "priority": return <>{t("cambió la prioridad de")} <B>{isPriority(from) ? priorityLabel(from) : from}</B> {t("a")} <B>{isPriority(to) ? priorityLabel(to) : to}</B></>;
    case "due_date": return to ? <>{t("puso la fecha límite en")} <B>{fmtDay(to)}</B></> : t("quitó la fecha límite");
    case "milestone": return to ? <>{t("agregó este ticket al hito")} <B>{to}</B></> : <>{t("quitó este ticket del hito")} <B>{from}</B></>;
    case "title": return <>{t("cambió el título a")} <B>{to}</B></>;
    case "description": return t("editó la descripción");
    case "assigned": return <>{t("asignó a")} <B>{to}</B></>;
    case "unassigned": return <>{t("quitó la asignación de")} <B>{from}</B></>;
    case "tagged": return <>{t("mencionó a")} <B>{to}</B></>;
    case "untagged": return <>{t("quitó la mención de")} <B>{from}</B></>;
    case "label_added": return <>{t("agregó la etiqueta")} <B>{to}</B></>;
    case "label_removed": return <>{t("quitó la etiqueta")} <B>{from}</B></>;
    case "study_created": return <>{t("creó el estudio")} <B>{to}</B> {t("desde este ticket")}</>;
    case "insight_created": return <>{t("creó el insight")} <B>«{to}»</B></>;
    case "linked": return t("vinculó este ticket");
    case "unlinked": return t("quitó un vínculo");
    case "merged": return <>{t("fusionó")} <B>{from}</B> {t("en este ticket")}</>;
    case "reporter_erased": return t("eliminó los datos personales de quien reportó");
    case "attachment_removed": return from === "screenshot" ? t("quitó la captura de pantalla del reporte") : from === "recording" ? t("quitó la grabación de pantalla del reporte") : <>{t("quitó el adjunto")} <B>{from}</B></>;
    default: return a.action;
  }
}

function Activity({ items }: { items: TicketActivity[] }) {
  return (
    <section>
      <H3>{t("Actividad")}</H3>
      <ul className="flex flex-col gap-3">
        {items.map((a) => (
          <li key={a.id} className="flex items-start gap-2.5 text-[13px] text-ink-2">
            <Avatar name={a.actor_name ?? "·"} avatar={a.actor_avatar} size={22} />
            <span className="min-w-0 flex-1"><span className="font-semibold text-ink">{a.actor_name ?? t("Redekorate")}</span> {activityText(a)}</span>
            <time dateTime={a.created_at} title={fmtMoment(a.created_at)} className="shrink-0 text-xs text-ink-3 tabular-nums">{fmtDay(isoDay(new Date(a.created_at)))}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
