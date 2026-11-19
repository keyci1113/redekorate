// My work: the tickets assigned to me (or created by me, or done recently) across every project, grouped by when they are due.
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { assignedSummary } from "../lib/myWork";
import { plural, t } from "../lib/i18n";
import { Button, Empty, ErrorNote, cx } from "../components/ui";
import { TYPES, isoDay, neighbours, type TicketType } from "../tickets/model";
import { PriorityMark, Skeleton, SourceMark, StatusChip, TypeChip, fmtDay, typeLabel } from "../tickets/parts";
import { Menu, MenuItem } from "../components/Menu";
import { TicketPanel } from "../tickets/TicketDetail";
import { WORK_GROUPS, filterWork, groupWork, workProjects, type WorkData, type WorkGroup, type WorkShow, type WorkTicket } from "../roadmap/model";

const SHOWS: WorkShow[] = ["assigned", "created", "done"];
const showLabel = (s: WorkShow) => ({ assigned: t("Asignados a mí"), created: t("Creados por mí"), done: t("Hechos recientemente") })[s];
const groupLabel = (g: WorkGroup) => ({ overdue: t("Vencidos"), week: t("Vencen esta semana"), later: t("Más adelante"), undated: t("Sin fecha límite") })[g];
const key = (x: WorkTicket) => `${x.project_id}:${x.number}`;

export function MyWorkPage() {
  const [params, setParams] = useSearchParams();
  const show = (SHOWS as string[]).includes(params.get("show") ?? "") ? (params.get("show") as WorkShow) : "assigned";
  const project = params.get("project"), type = (TYPES as readonly string[]).includes(params.get("type") ?? "") ? (params.get("type") as TicketType) : null;
  const open = params.get("ticket");   // "<project id>:<number>"
  const set = (next: Record<string, string | null>) => setParams((prev) => { const p = new URLSearchParams(prev); for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); } return p; }, { replace: true });
  const load = useLoad(() => api.get<WorkData>(`/my-work?show=${show}`), [show]);
  const today = isoDay(new Date());
  const all = load.data?.tickets ?? [];
  const visible = useMemo(() => filterWork(all, { project, type }), [all, project, type]);
  const groups = useMemo(() => groupWork(visible, today), [visible, today]);
  const projects = useMemo(() => workProjects(all), [all]);
  const order = show === "done" ? visible : WORK_GROUPS.flatMap((g) => groups[g]);
  const openTicket = order.find((x) => key(x) === open) ?? null;
  const index = openTicket ? order.indexOf(openTicket) : -1;
  const position = neighbours(order.map((_, i) => i), index);
  const c = load.data?.counts;
  const pill = "focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-surface px-3 text-[13px] font-medium hover:bg-ink/5";
  const close = () => { set({ ticket: null }); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-work-link="${open}"]`)?.focus()); };

  const row = (x: WorkTicket) => {
    const selected = key(x) === open, late = show !== "done" && x.due_date !== null && x.due_date < today;
    return (
      <li key={key(x)} className={cx("relative grid grid-cols-[minmax(0,3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 border-b border-line/60 px-4 py-3.5 last:border-b-0 hover:bg-paper max-sm:grid-cols-2", selected && "bg-accent-soft hover:bg-accent-soft")}>
        <span className="flex min-w-0 flex-col gap-1 max-sm:col-span-2">
          <span className="flex flex-wrap items-center gap-2">
            <Link to={`?${(() => { const p = new URLSearchParams(params); p.set("ticket", key(x)); return p; })()}`} replace data-work-link={key(x)} aria-current={selected ? "true" : undefined}
              className="font-semibold outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-accent focus-visible:after:ring-inset">{x.title}</Link>
            <TypeChip type={x.type} /><SourceMark ticket={{ ...x, widget_ref: null }} />
          </span>
          <span className="text-xs text-ink-3 tabular-nums">{x.project_name} · #{x.number}</span>
        </span>
        <span><StatusChip status={x.status} /></span>
        <span><PriorityMark priority={x.priority} /></span>
        <span className={cx("text-[13px] tabular-nums", late ? "font-bold text-bad" : "text-ink-2")}>{x.due_date ? (late ? t("{a} · vencido", { a: fmtDay(x.due_date) }) : fmtDay(x.due_date)) : "—"}</span>
      </li>
    );
  };
  const list = (items: WorkTicket[]) => <ul className="overflow-hidden rounded-2xl border border-line bg-surface">{items.map(row)}</ul>;

  return (
    <div className="page">
      <div className="flex items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div>
            <h1 className="page-title">{t("Mi trabajo")}</h1>
            {c && <p className="mt-2 text-[15px] text-ink-2">{c.open === 0 ? t("No tienes tickets abiertos asignados.") : assignedSummary(c.open, c.projects)}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label={t("Mostrar")} className="flex gap-1 rounded-[10px] bg-ink/5 p-1">
              {SHOWS.map((s) => <button key={s} type="button" aria-pressed={show === s} onClick={() => set({ show: s === "assigned" ? null : s, ticket: null })}
                className={cx("focus-ring min-h-9 rounded-lg px-3.5 text-[13px] whitespace-nowrap", show === s ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2")}>{showLabel(s)}</button>)}
            </div>
            <Menu label={t("Filtrar por proyecto")} width={280} button={(p) => <button {...p} className={cx(pill, project ? "border-accent text-ink" : "border-dashed border-line-2 text-ink-2")}>{project ? projects.find((x) => x.id === project)?.name ?? t("Proyecto") : t("Proyecto")}<ChevronDown size={12} aria-hidden /></button>}>
              {(closeMenu) => <>
                <MenuItem checked={!project} onSelect={() => { set({ project: null }); closeMenu(); }}>{t("Todos los proyectos")}</MenuItem>
                {projects.map((x) => <MenuItem key={x.id} checked={project === x.id} onSelect={() => { set({ project: x.id }); closeMenu(); }}><span className="truncate">{x.name}</span></MenuItem>)}
              </>}
            </Menu>
            <Menu label={t("Filtrar por tipo")} width={230} button={(p) => <button {...p} className={cx(pill, type ? "border-accent text-ink" : "border-dashed border-line-2 text-ink-2")}>{type ? typeLabel(type) : t("Tipo")}<ChevronDown size={12} aria-hidden /></button>}>
              {(closeMenu) => <>
                <MenuItem checked={!type} onSelect={() => { set({ type: null }); closeMenu(); }}>{t("Todos los tipos")}</MenuItem>
                {TYPES.map((x) => <MenuItem key={x} checked={type === x} onSelect={() => { set({ type: x }); closeMenu(); }}><TypeChip type={x} /></MenuItem>)}
              </>}
            </Menu>
          </div>

          {load.loading && !load.data ? <div className="flex flex-col gap-3" aria-busy="true" aria-label={t("Cargando tu trabajo")}><Skeleton className="h-6 w-32" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
            : load.error ? <div className="space-y-3"><ErrorNote>{load.error}</ErrorNote><Button onClick={() => load.reload()}>{t("Reintentar")}</Button></div>
            : all.length === 0 ? <Empty icon={<ClipboardCheck size={20} />} title={show === "assigned" ? t("Nada asignado a ti por ahora") : show === "created" ? t("No has creado tickets abiertos") : t("Nada terminado en los últimos 14 días")} text={t("Los tickets viven en la pestaña Tickets de cada proyecto.")} action={<Link to="/projects" className="focus-ring inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:border-line-2">{t("Ir a proyectos")}</Link>} />
            : visible.length === 0 ? <Empty icon={<ClipboardCheck size={20} />} title={t("Ningún ticket coincide con los filtros")} action={<Button onClick={() => set({ project: null, type: null })}>{t("Limpiar filtros")}</Button>} />
            : show === "done" ? list(visible)
            : WORK_GROUPS.filter((g) => groups[g].length).map((g) => (
              <section key={g} className="flex flex-col gap-2.5">
                <h2 className={cx("text-sm font-bold", g === "overdue" && "text-bad")}>{groupLabel(g)}<span className="font-semibold text-ink-3 tabular-nums"> · {groups[g].length}</span></h2>
                {list(groups[g])}
              </section>
            ))}
        </div>
        {openTicket && (
          <TicketPanel key={open} projectId={openTicket.project_id} projectName={openTicket.project_name} number={openTicket.number} position={{ ...position, prev: position.prev, next: position.next }}
            onGo={(i) => set({ ticket: key(order[i]) })} onClose={close} onChanged={() => void load.reload()} onDeleted={() => { set({ ticket: null }); void load.reload(); }} />
        )}
      </div>
    </div>
  );
}

/** The My work card on Home: how much is open and overdue, and the three tickets that need me first. */
export function MyWorkCard() {
  const load = useLoad(() => api.get<WorkData>("/my-work"), []);
  const today = isoDay(new Date());
  if (!load.data || load.data.counts.open === 0) return null;
  const c = load.data.counts;
  return (
    <section aria-labelledby="home-my-work" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-6 py-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="home-my-work" className="text-lg font-bold">{t("Mi trabajo")}</h2>
        <span className="flex gap-1.5">
          {c.overdue > 0 && <span className="rounded-full bg-tk-bug px-2 py-[3px] text-xs font-bold text-tk-bug-ink tabular-nums">{plural(c.overdue, { one: "{n} vencido", other: "{n} vencidos" })}</span>}
          <span className="rounded-full bg-ink/5 px-2 py-[3px] text-xs font-bold text-ink-2 tabular-nums">{plural(c.open, { one: "{n} abierto", other: "{n} abiertos" })}</span>
        </span>
      </div>
      <ul className="flex flex-col">
        {load.data.tickets.slice(0, 3).map((x) => {
          const late = x.due_date !== null && x.due_date < today;
          return (
            <li key={key(x)}>
              <Link to={`/my-work?ticket=${key(x)}`} className="focus-ring flex min-h-11 items-center gap-3 rounded-[10px] px-2 py-2.5 hover:bg-ink/5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-[13px] font-semibold">{x.title}</span><span className="truncate text-xs text-ink-3 tabular-nums">{x.project_name} · #{x.number}</span></span>
                {x.due_date && <span className={cx("shrink-0 text-xs tabular-nums", late ? "font-bold text-bad" : "text-ink-2")}>{late ? t("{a} · vencido", { a: fmtDay(x.due_date) }) : fmtDay(x.due_date)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link to="/my-work" className="focus-ring inline-flex min-h-11 items-center self-start rounded text-[13px] font-semibold text-accent-ink hover:underline">{t("Abrir Mi trabajo")}</Link>
    </section>
  );
}
