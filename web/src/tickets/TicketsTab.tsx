// The Tickets tab of a project: toolbar and filters, the board or the list, and the side panel of the open ticket.
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Calendar, ChevronDown, Columns3, Flag, Kanban, List as ListIcon, MessageSquareDot, MoreHorizontal, Plus, Search, Ticket as TicketIcon, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { canEdit as roleCanEdit, isOwner as roleIsOwner } from "../lib/roles";
import { plural, t } from "../lib/i18n";
import { Button, Empty, ErrorNote, cx } from "../components/ui";
import { Avatar } from "../components/Avatar";
import { Toaster, toast } from "../components/Toast";
import {
  BUILT_IN_COLUMNS, DUE_FILTERS, NONE, NO_FILTERS, PRIORITIES, STATUSES, TYPES, allLabels, boardColumns, columnOf, filterCount, filterTickets, isoDay, moveTicket, neighbours, placeOf,
  readView, selectAllState, sortTickets, toggleAll, toggleSort, writeView,
  type Column, type DueFilter, type Filters, type Milestone, type Person, type Sort, type SortKey, type Ticket, type TicketList, type TicketStatus, type ViewState,
} from "./model";
import { AvatarStack, Dialog, LabelChip, MenuNote, MenuSearch, PriorityMark, Skeleton, SourceMark, ColumnChip, TypeChip, columnName, fmtDay, priorityLabel, typeLabel } from "./parts";
import { Menu, MenuItem } from "../components/Menu";
import { TicketPanel } from "./TicketDetail";
import { NewTicketDialog } from "./NewTicketDialog";
import { BoardColumnsDialog } from "./BoardColumnsDialog";

const COLUMN_PREVIEW = 6;   // cards shown per column before "Show N more"
const dueLabel = (d: DueFilter) => ({ overdue: t("Vencidos"), week: t("Próximos 7 días"), month: t("Próximos 30 días"), none: t("Sin fecha") })[d];
const ticketCount = (n: number) => plural(n, { one: "{n} ticket", other: "{n} tickets" });

export function TicketsTab({ projectId, projectName, onCount, onLinksChange }: { projectId: string; projectName: string; onCount?: (n: number) => void; onLinksChange?: () => void }) {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readView(params), [params]);
  const setState = (next: Partial<ViewState>) => setParams((prev) => writeView(prev, { ...readView(prev), ...next }), { replace: true });
  const setFilters = (f: Partial<Filters>) => setState({ filters: { ...state.filters, ...f } });

  const load = useLoad(() => api.get<TicketList>(`/projects/${projectId}/tickets`), [projectId]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cols, setCols] = useState<Column[]>(BUILT_IN_COLUMNS);
  const [creating, setCreating] = useState<Column | null>(null);
  const [editingColumns, setEditingColumns] = useState(false);
  const [deleting, setDeleting] = useState<number[] | null>(null);
  useEffect(() => { if (load.data) { setTickets(load.data.tickets); setCols(load.data.columns?.length ? load.data.columns : BUILT_IN_COLUMNS); } }, [load.data]);
  useEffect(() => { onCount?.(tickets.length); }, [tickets.length, onCount]);

  const role = load.data?.role, canEdit = roleCanEdit(role), isOwner = roleIsOwner(role);
  const people = load.data?.people ?? [], milestones = load.data?.milestones ?? [];
  const today = isoDay(new Date());
  const visible = useMemo(() => filterTickets(tickets, state.filters, today), [tickets, state.filters, today]);
  const columns = useMemo(() => boardColumns(visible, cols), [visible, cols]);
  const rows = useMemo(() => sortTickets(visible, state.sort, cols), [visible, state.sort, cols]);
  const order = state.view === "list" ? rows.map((r) => r.number) : cols.flatMap((col) => columns[col.id].map((c) => c.number));
  const labels = useMemo(() => allLabels(tickets), [tickets]);
  const hrefFor = (ticket: number | null) => `?${writeView(params, { ...state, ticket })}`;

  /** Applies a change at once and puts the previous list back, with a message, if the server refuses it. */
  async function optimistic(next: Ticket[], send: () => Promise<{ tickets: Ticket[] }>) {
    const before = tickets;
    setTickets(next); setNotice(null);
    try { setTickets((await send()).tickets); return true; }
    catch (e) { setTickets(before); setNotice(t("No se pudo guardar el cambio: {a}", { a: (e as Error).message })); return false; }
  }
  const move = (number: number, column: string, before: number | null, list = tickets) =>
    optimistic(moveTicket(list, number, column, before, cols), () => api.post(`/projects/${projectId}/tickets/move`, { number, column, before }));
  /** A move from a card's menu: confirmed with a toast that can put the card back where it was. */
  async function moveFromMenu(number: number, column: string) {
    const from = placeOf(tickets, number, cols), to = cols.find((c) => c.id === column);
    if (!(await move(number, column, null)) || !from || !to) return;
    toast(t("Movido a «{a}»", { a: columnName(to) }), { action: { label: t("Deshacer"), run: () => void move(number, from.column, from.before, latest.current) } });
  }
  // The undo runs later, from the toast, so it needs the list as it is then.
  const latest = useRef(tickets);
  latest.current = tickets;
  const bulk = (patch: Record<string, unknown>) => {
    const numbers = [...selected];
    const to = cols.find((c) => c.id === patch.column);
    const shown: Partial<Ticket> = { ...(to ? { column: to.id, status: to.status } : {}), ...("priority" in patch ? { priority: patch.priority as Ticket["priority"] } : {}) };
    return optimistic(tickets.map((x) => (selected.has(x.number) ? { ...x, ...shown } : x)),
      () => api.post(`/projects/${projectId}/tickets/bulk`, { numbers, patch }));
  };
  async function remove(numbers: number[]) {
    const r = await api.post<{ tickets: Ticket[] }>(`/projects/${projectId}/tickets/delete`, { numbers });
    setTickets(r.tickets); setSelected(new Set()); setDeleting(null);
    if (state.ticket && numbers.includes(state.ticket)) setState({ ticket: null });
    onLinksChange?.();
  }
  const closePanel = () => {
    const n = state.ticket;
    setState({ ticket: null });
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-ticket-link="${n}"]`)?.focus());
  };

  if (load.loading && !load.data) return <LoadingState view={state.view} />;
  if (load.error) return <div className="space-y-3"><ErrorNote>{load.error}</ErrorNote><Button onClick={() => load.reload()}>{t("Reintentar")}</Button></div>;

  const active = filterCount(state.filters) > 0;
  const openNew = (column?: Column) => setCreating(column ?? cols.find((c) => c.status === "todo") ?? cols[0]);

  return (
    <div className="flex items-start gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Toolbar state={state} setState={setState} setFilters={setFilters} people={people} milestones={milestones} labels={labels} canEdit={canEdit} onNew={() => openNew()} onColumns={() => setEditingColumns(true)} hrefView={(view) => `?${writeView(params, { ...state, view })}`} widgetHref={`/projects/${projectId}/widget`} />
        {active && <ActiveFilters filters={state.filters} setFilters={setFilters} people={people} milestones={milestones} onClear={() => setState({ filters: NO_FILTERS })} />}
        {notice && <p role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad-soft px-4 py-2.5 text-sm text-bad">{notice}<button type="button" onClick={() => setNotice(null)} aria-label={t("Cerrar aviso")} className="focus-ring rounded p-1"><X size={14} /></button></p>}

        {tickets.length === 0 ? (
          <Empty icon={<TicketIcon size={20} />} title={t("Aún no hay tickets")} text={t("Convierte hallazgos y pendientes en trabajo con responsable y fecha.")}
            action={canEdit ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => openNew()}>{t("Crear un ticket")}</Button> : undefined} />
        ) : visible.length === 0 ? (
          <Empty icon={<Search size={20} />} title={t("Ningún ticket coincide con los filtros")} text={t("Prueba con menos filtros o con otra búsqueda.")}
            action={<Button onClick={() => setState({ filters: NO_FILTERS })}>{t("Limpiar filtros")}</Button>} />
        ) : state.view === "board" ? (
          <Board projectId={projectId} cols={cols} columns={columns} canEdit={canEdit} open={state.ticket} hrefFor={hrefFor} onMove={move} onMenuMove={(n, c) => void moveFromMenu(n, c)} onAdd={openNew} />
        ) : (
          <>
            {canEdit && selected.size > 0 && (
              <BulkBar count={selected.size} cols={cols} people={people} milestones={milestones} canDelete={isOwner} onPatch={bulk}
                onDelete={() => setDeleting([...selected])} onClear={() => setSelected(new Set())} />
            )}
            <ListTable rows={rows} cols={cols} total={tickets.length} sort={state.sort} onSort={(key) => setState({ sort: toggleSort(state.sort, key) })} open={state.ticket} hrefFor={hrefFor}
              selectable={canEdit} selected={selected} setSelected={setSelected} />
          </>
        )}
      </div>

      {state.ticket !== null && (
        <TicketPanel key={state.ticket} projectId={projectId} number={state.ticket} position={neighbours(order, state.ticket)} onGo={(n) => setState({ ticket: n })} onClose={closePanel}
          onChanged={() => { void load.reload(); onLinksChange?.(); }} onDeleted={() => { setState({ ticket: null }); void load.reload(); onLinksChange?.(); }} />
      )}

      {editingColumns && <BoardColumnsDialog projectId={projectId} columns={cols} tickets={tickets} onClose={() => setEditingColumns(false)}
        onSaved={(r) => { setCols(r.columns); setTickets(r.tickets); setEditingColumns(false); }} />}
      {creating && <NewTicketDialog projectId={projectId} projectName={projectName} column={creating} onClose={() => setCreating(null)} onCreated={() => { void load.reload(); onLinksChange?.(); }} />}
      {deleting && <DeleteDialog tickets={tickets.filter((x) => deleting.includes(x.number))} onClose={() => setDeleting(null)} onConfirm={() => remove(deleting)} />}
      <Toaster />
    </div>
  );
}

// ── Toolbar and filters ─────────────────────────────────────────
function Pill({ children, count, ...rest }: { children: ReactNode; count?: number } & Record<string, unknown>) {
  return (
    <button {...rest} className={cx("focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-surface px-3 text-[13px] font-medium hover:bg-ink/5",
      count ? "border-accent text-ink" : "border-dashed border-line-2 text-ink-2")}>
      {children}{count ? <span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-bold text-accent-ink tabular-nums">{count}</span> : null}<ChevronDown size={12} aria-hidden />
    </button>
  );
}
const toggleIn = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

function Toolbar({ state, setState, setFilters, people, milestones, labels, canEdit, onNew, onColumns, hrefView, widgetHref }: {
  state: ViewState; setState: (s: Partial<ViewState>) => void; setFilters: (f: Partial<Filters>) => void;
  people: Person[]; milestones: Milestone[]; labels: string[]; canEdit: boolean; onNew: () => void; onColumns: () => void; hrefView: (v: "board" | "list") => string; widgetHref: string;
}) {
  const f = state.filters;
  const [who, setWho] = useState("");
  const milestoneName = f.milestone === NONE ? t("Sin hito") : milestones.find((m) => m.id === f.milestone)?.name ?? t("Todos");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <nav aria-label={t("Vistas de tickets")} className="flex gap-1 rounded-[10px] bg-ink/5 p-1">
          {([["board", t("Tablero"), <Kanban size={16} key="b" />], ["list", t("Lista"), <ListIcon size={16} key="l" />]] as const).map(([view, label, icon]) => (
            <Link key={view} to={hrefView(view)} replace aria-current={state.view === view ? "page" : undefined}
              className={cx("focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[13px]", state.view === view ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2")}>
              {icon}{label}
            </Link>
          ))}
        </nav>
        <label className="flex min-h-11 max-w-[280px] flex-[1_1_200px] items-center gap-2 rounded-[10px] border border-line-2 bg-surface px-3 text-ink-3 focus-within:border-accent">
          <Search size={16} aria-hidden /><span className="sr-only">{t("Buscar tickets")}</span>
          <input type="search" value={f.q} onChange={(e) => setFilters({ q: e.target.value })} placeholder={t("Buscar tickets")} className="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Menu label={t("Filtrar por persona asignada")} button={(p) => <Pill {...p} count={f.assignee.length}>{t("Asignado")}</Pill>}>
            {() => <>
              <MenuSearch value={who} onChange={setWho} label={t("Buscar personas")} placeholder={t("Buscar personas")} />
              <MenuItem kind="checkbox" checked={f.assignee.includes(NONE)} onSelect={() => setFilters({ assignee: toggleIn(f.assignee, NONE) })}>{t("Sin asignar")}</MenuItem>
              {people.filter((p) => p.name.toLowerCase().includes(who.toLowerCase())).map((p) => (
                <MenuItem key={p.id} kind="checkbox" checked={f.assignee.includes(p.id)} onSelect={() => setFilters({ assignee: toggleIn(f.assignee, p.id) })}><Avatar name={p.name} avatar={p.avatar} size={22} />{p.name}</MenuItem>
              ))}
            </>}
          </Menu>
          <Menu label={t("Filtrar por tipo")} button={(p) => <Pill {...p} count={f.type.length}>{t("Tipo")}</Pill>}>
            {() => TYPES.map((x) => <MenuItem key={x} kind="checkbox" checked={f.type.includes(x)} onSelect={() => setFilters({ type: toggleIn(f.type, x) })}><TypeChip type={x} /></MenuItem>)}
          </Menu>
          <Menu label={t("Filtrar por prioridad")} button={(p) => <Pill {...p} count={f.priority.length}>{t("Prioridad")}</Pill>}>
            {() => PRIORITIES.map((x) => <MenuItem key={x} kind="checkbox" checked={f.priority.includes(x)} onSelect={() => setFilters({ priority: toggleIn(f.priority, x) })}><PriorityMark priority={x} /></MenuItem>)}
          </Menu>
          <Menu label={t("Filtrar por etiqueta")} button={(p) => <Pill {...p} count={f.label.length}>{t("Etiqueta")}</Pill>}>
            {() => labels.length ? labels.map((x) => <MenuItem key={x} kind="checkbox" checked={f.label.includes(x)} onSelect={() => setFilters({ label: toggleIn(f.label, x) })}>{x}</MenuItem>) : <MenuNote>{t("Aún no hay etiquetas en este proyecto.")}</MenuNote>}
          </Menu>
          <Menu label={t("Filtrar por fecha límite")} button={(p) => <Pill {...p} count={f.due ? 1 : 0}>{t("Fecha límite")}</Pill>}>
            {(close) => DUE_FILTERS.map((x) => <MenuItem key={x} checked={f.due === x} onSelect={() => { setFilters({ due: f.due === x ? null : x }); close(); }}>{dueLabel(x)}</MenuItem>)}
          </Menu>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Menu label={t("Filtrar por hito")} button={(p) => (
          <button {...p} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line-2 bg-surface px-3 text-[13px] font-semibold hover:bg-ink/5">
            <Flag size={14} aria-hidden />{t("Hito: {a}", { a: milestoneName })}<ChevronDown size={12} aria-hidden />
          </button>
        )}>
          {(close) => <>
            <MenuItem checked={f.milestone === null} onSelect={() => { setFilters({ milestone: null }); close(); }}>{t("Todos")}</MenuItem>
            {milestones.map((m) => <MenuItem key={m.id} checked={f.milestone === m.id} onSelect={() => { setFilters({ milestone: m.id }); close(); }}>{m.name}</MenuItem>)}
            <MenuItem checked={f.milestone === NONE} onSelect={() => { setFilters({ milestone: NONE }); close(); }}>{t("Sin hito")}</MenuItem>
          </>}
        </Menu>
        <Link to={widgetHref} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line-2 bg-surface px-3 text-[13px] font-semibold hover:bg-ink/5"><MessageSquareDot size={15} aria-hidden />{t("Widget de feedback")}</Link>
        {canEdit && <button type="button" onClick={onColumns} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line-2 bg-surface px-3 text-[13px] font-semibold hover:bg-ink/5"><Columns3 size={15} aria-hidden />{t("Columnas")}</button>}
        {canEdit && <Button variant="primary" size="lg" icon={<Plus size={16} />} onClick={onNew}>{t("Nuevo ticket")}</Button>}
      </div>
    </div>
  );
}

function ActiveFilters({ filters: f, setFilters, people, milestones, onClear }: { filters: Filters; setFilters: (f: Partial<Filters>) => void; people: Person[]; milestones: Milestone[]; onClear: () => void }) {
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(f.q.trim() ? [{ key: "q", label: t("Búsqueda: {a}", { a: f.q.trim() }), remove: () => setFilters({ q: "" }) }] : []),
    ...f.assignee.map((id) => ({ key: `a${id}`, label: t("Asignado: {a}", { a: id === NONE ? t("Sin asignar") : people.find((p) => p.id === id)?.name ?? "?" }), remove: () => setFilters({ assignee: f.assignee.filter((x) => x !== id) }) })),
    ...f.type.map((x) => ({ key: `t${x}`, label: t("Tipo: {a}", { a: typeLabel(x) }), remove: () => setFilters({ type: f.type.filter((y) => y !== x) }) })),
    ...f.priority.map((x) => ({ key: `p${x}`, label: t("Prioridad: {a}", { a: priorityLabel(x) }), remove: () => setFilters({ priority: f.priority.filter((y) => y !== x) }) })),
    ...f.label.map((x) => ({ key: `l${x}`, label: t("Etiqueta: {a}", { a: x }), remove: () => setFilters({ label: f.label.filter((y) => y !== x) }) })),
    ...(f.due ? [{ key: "due", label: t("Fecha límite: {a}", { a: dueLabel(f.due) }), remove: () => setFilters({ due: null }) }] : []),
    ...(f.milestone ? [{ key: "ms", label: t("Hito: {a}", { a: f.milestone === NONE ? t("Sin hito") : milestones.find((m) => m.id === f.milestone)?.name ?? "?" }), remove: () => setFilters({ milestone: null }) }] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-ink-3">{t("Filtrado por")}</span>
      {chips.map((c) => (
        <span key={c.key} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-accent-soft py-0.5 pr-1 pl-3 font-medium text-accent-ink">
          {c.label}
          <button type="button" onClick={c.remove} aria-label={t("Quitar filtro: {a}", { a: c.label })} className="focus-ring relative rounded-full p-1 before:absolute before:-inset-2 hover:bg-ink/10"><X size={13} /></button>
        </span>
      ))}
      <button type="button" onClick={onClear} className="focus-ring min-h-11 rounded-lg px-2 font-semibold text-accent-ink hover:underline">{t("Limpiar filtros")}</button>
    </div>
  );
}

// ── Board ───────────────────────────────────────────────────────
function Board({ projectId, cols, columns, canEdit, open, hrefFor, onMove, onMenuMove, onAdd }: {
  cols: Column[]; columns: Record<string, Ticket[]>; canEdit: boolean; open: number | null; hrefFor: (n: number) => string;
  onMove: (number: number, column: string, before: number | null) => void; onMenuMove: (number: number, column: string) => void; onAdd: (c: Column) => void; projectId: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<{ status: string; before: number | null } | null>(null);
  const dragging = useRef<number | null>(null);
  const drop = (e: DragEvent, status: string, before: number | null) => {
    e.preventDefault(); e.stopPropagation();
    const n = dragging.current;
    dragging.current = null; setOver(null);
    if (n !== null && n !== before) onMove(n, status, before);
  };
  const hover = (e: DragEvent, status: string, before: number | null) => {
    if (dragging.current === null) return;
    e.preventDefault(); e.stopPropagation();
    if (over?.status !== status || over.before !== before) setOver({ status, before });
  };
  return (
    <>
      <p className="text-[13px] text-ink-3">{canEdit ? t("Arrastra las tarjetas entre columnas para cambiar el estado, o usa el menú de cada tarjeta.") : t("Abre una tarjeta para ver su detalle.")}</p>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[1100px] items-start gap-4">
          {cols.map((col) => {
            const status = col.id, cards = columns[status] ?? [], shown = expanded.has(status) ? cards : cards.slice(0, COLUMN_PREVIEW);
            return (
              <section key={status} aria-label={t("{a}, {b}", { a: columnName(col), b: ticketCount(cards.length) })}
                onDragOver={(e) => hover(e, status, null)} onDrop={(e) => drop(e, status, null)}
                className={cx("flex min-h-40 min-w-[260px] flex-[1_1_260px] flex-col gap-2.5 rounded-[14px] border border-tk-column-line bg-tk-column p-3", over?.status === status && over.before === null && "outline-2 outline-accent")}>
                <div className="flex items-center justify-between gap-2 px-1 py-0.5">
                  <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold"><ColumnChip column={col} /><span className="font-semibold text-ink-3 tabular-nums">{cards.length}</span></h2>
                  {canEdit && <button type="button" onClick={() => onAdd(col)} aria-label={t("Agregar ticket en {a}", { a: columnName(col) })} className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-ink/5"><Plus size={16} /></button>}
                </div>
                {shown.map((c) => (
                  <Card key={c.id} projectId={projectId} ticket={c} cols={cols} href={hrefFor(c.number)} selected={open === c.number} canEdit={canEdit} dropTarget={over?.status === status && over.before === c.number}
                    onDragStart={() => { dragging.current = c.number; }} onDragEnd={() => { dragging.current = null; setOver(null); }}
                    onDragOver={(e) => hover(e, status, c.number)} onDrop={(e) => drop(e, status, c.number)} onStatus={(s) => onMenuMove(c.number, s)} />
                ))}
                {cards.length > shown.length && (
                  <button type="button" onClick={() => setExpanded(new Set(expanded).add(status))} className="focus-ring min-h-11 rounded-lg text-center text-[13px] font-semibold text-accent-ink hover:underline">
                    {t("Mostrar {n} más", { n: cards.length - shown.length })}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Card({ projectId, ticket: c, cols, href, selected, canEdit, dropTarget, onDragStart, onDragEnd, onDragOver, onDrop, onStatus }: {
  projectId: string; ticket: Ticket; cols: Column[]; href: string; selected: boolean; canEdit: boolean; dropTarget: boolean;
  onDragStart: () => void; onDragEnd: () => void; onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void; onStatus: (column: string) => void;
}) {
  return (
    <article draggable={canEdit} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(c.number)); onDragStart(); }} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop}
      className={cx("relative flex flex-col gap-2.5 rounded-xl border bg-surface p-3.5 shadow-[0_1px_2px_rgb(26_21_35/0.04)] hover:bg-paper",
        selected ? "border-accent outline-2 outline-accent" : "border-line", dropTarget && "shadow-[0_-3px_0_0_var(--color-accent)]", canEdit && "cursor-grab active:cursor-grabbing")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-3 tabular-nums">#{c.number}</span>
        <span className="flex items-center gap-1">
          <TypeChip type={c.type} />
          {canEdit && (
            <Menu label={t("Mover #{n} a otro estado", { n: c.number })} width={220} button={(p) => (
              <button {...p} aria-label={t("Cambiar estado de #{n}", { n: c.number })} className="focus-ring relative z-10 -my-2 -mr-2 flex h-11 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-ink/5 hover:text-ink"><MoreHorizontal size={16} /></button>
            )}>
              {(close) => <>
                <MenuNote>{t("Mover a")}</MenuNote>
                {cols.map((col) => { const here = columnOf(c, cols).id === col.id; return <MenuItem key={col.id} checked={here} onSelect={() => { close(); if (!here) onStatus(col.id); }}><ColumnChip column={col} /></MenuItem>; })}
              </>}
            </Menu>
          )}
        </span>
      </div>
      <Link to={href} replace data-ticket-link={c.number} aria-current={selected ? "true" : undefined} draggable={false}
        className="rounded leading-snug font-semibold text-ink outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-accent">
        {c.title}
      </Link>
      {(c.labels.length > 0 || c.source === "widget" || c.from_insight || c.converted_insight_id) && (
        <div className="flex flex-wrap items-center gap-1.5">{c.labels.map((l) => <LabelChip key={l}>{l}</LabelChip>)}<SourceMark ticket={c} projectId={projectId} /></div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2.5">
        <span className="flex items-center gap-3">
          <PriorityMark priority={c.priority} />
          {c.due_date && <span className="inline-flex items-center gap-1 text-xs text-ink-3 tabular-nums"><Calendar size={14} aria-hidden /><span className="sr-only">{t("Fecha límite")}</span>{fmtDay(c.due_date)}</span>}
        </span>
        <AvatarStack people={c.assignees} />
      </div>
    </article>
  );
}

// ── List ────────────────────────────────────────────────────────
const sortName = (k: SortKey) => ({ number: t("número"), title: t("título"), status: t("estado"), priority: t("prioridad"), assignee: t("persona asignada"), due: t("fecha límite"), milestone: t("hito"), labels: t("etiquetas") })[k];
const COLS = (): [SortKey, string][] => [["number", "#"], ["title", t("Título")], ["status", t("Estado")], ["priority", t("Prioridad")], ["assignee", t("Asignado")], ["due", t("Fecha límite")], ["milestone", t("Hito")], ["labels", t("Etiquetas|ticket")]];

function ListTable({ rows, cols, total, sort, onSort, open, hrefFor, selectable, selected, setSelected }: {
  rows: Ticket[]; cols: Column[]; total: number; sort: Sort; onSort: (k: SortKey) => void; open: number | null; hrefFor: (n: number) => string;
  selectable: boolean; selected: Set<number>; setSelected: (s: Set<number>) => void;
}) {
  const visible = rows.map((r) => r.number);
  const all = selectAllState(visible, selected);
  const master = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (master.current) master.current.indeterminate = all === "some"; }, [all]);
  const toggle = (n: number) => { const next = new Set(selected); if (next.has(n)) next.delete(n); else next.add(n); setSelected(next); };
  const cell = "border-b border-line/60 p-3";
  const hidden = total - rows.length;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <caption className="sr-only">{selected.size ? plural(selected.size, { one: "Tickets, {n} seleccionado", other: "Tickets, {n} seleccionados" }) : t("Tickets, ordenados por {a}", { a: sortName(sort.key) })}</caption>
          <thead>
            <tr>
              {selectable && (
                <th scope="col" className="w-11 border-b border-line py-1 pr-0 pl-2">
                  <label className="flex h-11 w-11 items-center justify-center"><span className="sr-only">{t("Seleccionar todos")}</span>
                    <input ref={master} type="checkbox" checked={all === "all"} onChange={() => setSelected(toggleAll(visible, selected))} className="h-4 w-4 accent-(--color-accent)" /></label>
                </th>
              )}
              {COLS().map(([key, label]) => (
                <th key={key} scope="col" aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className="border-b border-line px-3 py-1 text-left text-xs font-semibold text-ink-3">
                  <button type="button" onClick={() => onSort(key)} className={cx("focus-ring inline-flex min-h-11 items-center gap-1 rounded whitespace-nowrap", sort.key === key && "text-ink")}>
                    {label}{sort.key === key && (sort.dir === "asc" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cx("hover:bg-paper", open === r.number && "bg-accent-soft hover:bg-accent-soft", selected.has(r.number) && open !== r.number && "bg-ink/[0.03]")}>
                {selectable && (
                  <td className="border-b border-line/60 py-0 pr-0 pl-2">
                    <label className="flex h-11 w-11 items-center justify-center"><span className="sr-only">{t("Seleccionar #{n}", { n: r.number })}</span>
                      <input type="checkbox" checked={selected.has(r.number)} onChange={() => toggle(r.number)} className="h-4 w-4 accent-(--color-accent)" /></label>
                  </td>
                )}
                <td className={cx(cell, "text-[13px] font-semibold text-ink-3 tabular-nums")}>#{r.number}</td>
                <td className={cx(cell, "min-w-[280px]")}>
                  <span className="flex flex-wrap items-center gap-2">
                    <Link to={hrefFor(r.number)} replace data-ticket-link={r.number} aria-current={open === r.number ? "true" : undefined} className="focus-ring rounded font-semibold text-ink hover:underline">{r.title}</Link>
                    <SourceMark ticket={r} /><TypeChip type={r.type} />
                  </span>
                </td>
                <td className={cell}><ColumnChip column={columnOf(r, cols)} /></td>
                <td className={cell}><PriorityMark priority={r.priority} /></td>
                <td className={cell}>
                  {r.assignees.length ? <span className="flex items-center gap-2 text-[13px] whitespace-nowrap"><AvatarStack people={r.assignees} max={2} />{r.assignees.length === 1 ? r.assignees[0].name : null}</span> : <span className="text-[13px] text-ink-3">{t("Sin asignar")}</span>}
                </td>
                <td className={cx(cell, "text-[13px] whitespace-nowrap tabular-nums")}>{r.due_date ? fmtDay(r.due_date) : <span className="text-ink-3">—</span>}</td>
                <td className={cx(cell, "text-[13px]")}>{r.milestone ?? <span className="text-ink-3">—</span>}</td>
                <td className={cell}><span className="flex flex-wrap gap-1.5">{r.labels.map((l) => <LabelChip key={l}>{l}</LabelChip>)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px] text-ink-3 tabular-nums">
        <span>{t("Mostrando {a} de {b}", { a: rows.length, b: ticketCount(total) })}{hidden > 0 ? ` · ${plural(hidden, { one: "{n} oculto por los filtros", other: "{n} ocultos por los filtros" })}` : ""}</span>
        <span>{t("Orden: {a}, {b}", { a: sortName(sort.key), b: sort.dir === "asc" ? t("ascendente") : t("descendente") })}</span>
      </div>
    </div>
  );
}

function BulkBar({ count, cols, people, milestones, canDelete, onPatch, onDelete, onClear }: {
  count: number; cols: Column[]; people: Person[]; milestones: Milestone[]; canDelete: boolean; onPatch: (p: Record<string, unknown>) => void; onDelete: () => void; onClear: () => void;
}) {
  const [label, setLabel] = useState("");
  const btn = "focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-white/30 px-3 text-[13px] font-semibold text-white hover:bg-white/10";
  const B = (text: string) => (p: Record<string, unknown>) => <button {...p} className={btn}>{text}<ChevronDown size={12} aria-hidden /></button>;
  return (
    <div role="region" aria-label={t("Acciones en lote")} className="flex flex-wrap items-center gap-2.5 rounded-[14px] bg-[#1A1523] px-4 py-3 text-white shadow-(--shadow-lift)">
      <span className="mr-1.5 font-bold tabular-nums" aria-live="polite">{plural(count, { one: "{n} seleccionado", other: "{n} seleccionados" })}</span>
      <Menu label={t("Cambiar estado")} button={B(t("Estado"))}>{(close) => cols.map((col) => <MenuItem key={col.id} onSelect={() => { close(); onPatch({ column: col.id }); }}><ColumnChip column={col} /></MenuItem>)}</Menu>
      <Menu label={t("Asignar a")} button={B(t("Asignado"))}>
        {(close) => <>
          {people.map((p) => <MenuItem key={p.id} onSelect={() => { close(); onPatch({ assignees: [p.id] }); }}><Avatar name={p.name} avatar={p.avatar} size={22} />{p.name}</MenuItem>)}
          <MenuItem onSelect={() => { close(); onPatch({ assignees: [] }); }}>{t("Sin asignar")}</MenuItem>
        </>}
      </Menu>
      <Menu label={t("Cambiar prioridad")} button={B(t("Prioridad"))}>{(close) => PRIORITIES.map((x) => <MenuItem key={x} onSelect={() => { close(); onPatch({ priority: x }); }}><PriorityMark priority={x} /></MenuItem>)}</Menu>
      <Menu label={t("Mover a hito")} button={B(t("Hito"))}>
        {(close) => <>
          {milestones.map((m) => <MenuItem key={m.id} onSelect={() => { close(); onPatch({ milestone_id: m.id }); }}>{m.name}</MenuItem>)}
          <MenuItem onSelect={() => { close(); onPatch({ milestone_id: null }); }}>{t("Sin hito")}</MenuItem>
        </>}
      </Menu>
      <Menu label={t("Agregar etiqueta")} button={B(t("Etiquetas|ticket"))}>
        {(close) => (
          <form onSubmit={(e) => { e.preventDefault(); if (label.trim()) { onPatch({ add_labels: [label.trim()] }); setLabel(""); close(); } }} className="flex flex-col gap-1.5 p-1">
            <MenuSearch value={label} onChange={setLabel} label={t("Etiqueta a agregar")} placeholder={t("Agregar una etiqueta")} />
            <Button type="submit" variant="primary" size="lg" disabled={!label.trim()}>{t("Agregar a los seleccionados")}</Button>
          </form>
        )}
      </Menu>
      {canDelete && <button type="button" onClick={onDelete} className={cx(btn, "border-[#FCA5A5]/60 text-[#FCA5A5]")}><Trash2 size={14} aria-hidden />{t("Eliminar")}</button>}
      <button type="button" onClick={onClear} className="focus-ring ml-auto min-h-11 rounded-[10px] px-3 text-[13px] font-semibold text-white/85 hover:text-white">{t("Quitar selección")}</button>
    </div>
  );
}

export function DeleteDialog({ tickets, onClose, onConfirm }: { tickets: Pick<Ticket, "number" | "title">[]; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = tickets.length;
  const what = plural(n, { one: "{n} ticket", other: "{n} tickets" });
  return (
    <Dialog title={t("¿Eliminar {a}?", { a: what })} onClose={onClose} width={520}
      footer={<>
        <Button size="lg" data-autofocus onClick={onClose}>{t("Cancelar")}</Button>
        <Button size="lg" variant="danger" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await onConfirm(); } catch (e) { setError((e as Error).message); setBusy(false); } }}>{t("Eliminar {a}", { a: what })}</Button>
      </>}>
      <p className="text-sm text-ink-2">{t("Estos tickets, sus comentarios y su historial de actividad se eliminarán. Los insights vinculados se conservan, pero pierden el vínculo.")} <strong className="text-ink">{t("Esto no se puede deshacer.")}</strong></p>
      <ul className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-paper p-3 text-sm">
        {tickets.map((x) => <li key={x.number} className="flex gap-2"><span className="font-semibold text-ink-3 tabular-nums">#{x.number}</span><span>{x.title}</span></li>)}
      </ul>
      <p className="text-[13px] text-ink-3">{t("Solo quien es dueño del proyecto puede eliminar tickets. Para conservar el historial, mejor muévelos a Hecho.")}</p>
      {error && <ErrorNote>{error}</ErrorNote>}
    </Dialog>
  );
}

function LoadingState({ view }: { view: "board" | "list" }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={t("Cargando tickets")}>
      <Skeleton className="h-11 w-full max-w-xl" />
      {view === "board"
        ? <div className="flex gap-4 overflow-hidden">{STATUSES.map((s) => <div key={s} className="flex min-w-[260px] flex-1 flex-col gap-2.5 rounded-[14px] border border-tk-column-line bg-tk-column p-3"><Skeleton className="h-6 w-24" /><Skeleton className="h-28 bg-surface" /><Skeleton className="h-28 bg-surface" /></div>)}</div>
        : <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
    </div>
  );
}
