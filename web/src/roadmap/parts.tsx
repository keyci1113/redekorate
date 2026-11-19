// Shared pieces of the milestone and roadmap screens: state chips, date ranges, the milestone dialog and the timeline.
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { locale, plural, t } from "../lib/i18n";
import { Button, ErrorNote, cx } from "../components/ui";
import { isoDay } from "../tickets/model";
import { Dialog } from "../tickets/parts";
import { barSpan, dayMark, labelPlacement, milestoneNote, shownState, span, timeWindow, type Milestone, type MilestoneState, type ShownState, type Zoom } from "./model";

export const stateLabel = (s: ShownState) => ({ on_track: t("En curso"), at_risk: t("En riesgo"), planned: t("Planeado"), done: t("Hecho") })[s];
const CHIP: Record<ShownState, string> = { on_track: "bg-tk-done text-tk-done-ink", at_risk: "bg-caution-soft text-caution-ink", planned: "bg-ink/5 text-ink-2", done: "bg-tk-progress text-tk-progress-ink" };
export const StateChip = ({ state }: { state: MilestoneState }) => <span className={cx("rounded-full px-2.5 py-[3px] text-xs font-bold whitespace-nowrap", CHIP[shownState(state)])}>{stateLabel(shownState(state))}</span>;

const local = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (iso: string, year: boolean) => new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) }).format(local(iso));
/** "Nov 3 – Dec 12, 2026", with the first year shown only when the two differ. `years: false` leaves both out. */
export function dateRange(begin: string | null, end: string | null, years = true): string {
  if (!begin && !end) return t("Sin fechas");
  if (!begin || !end) return fmt((begin ?? end)!, years);
  return `${fmt(begin, years && begin.slice(0, 4) !== end.slice(0, 4))} – ${fmt(end, years)}`;
}
const inSpan = (days: number) => { const s = span(days); return s.unit === "day" ? plural(s.n, { one: "{n} día", other: "{n} días" }) : plural(s.n, { one: "{n} mes", other: "{n} meses" }); };
/** The line under a milestone: when it is due or starts, why it is at risk, or when it was closed. */
export function noteText(m: Milestone, today: string): string | null {
  const n = milestoneNote(m, today);
  if (!n) return null;
  switch (n.kind) {
    case "closed": return t("Cerrado el {a}", { a: fmt(n.date, false) });
    case "starts": return t("Empieza en {a}", { a: inSpan(n.days) });
    case "overdue": return plural(n.n, { one: "{n} ticket vencido", other: "{n} tickets vencidos" });
    case "late": return t("Debió terminar hace {a}", { a: inSpan(n.days) });
    case "due_open": return `${n.days === 0 ? t("Vence hoy") : t("Vence en {a}", { a: inSpan(n.days) })} · ${plural(n.open, { one: "{n} ticket abierto", other: "{n} tickets abiertos" })}`;
    case "due": return n.days === 0 ? t("Vence hoy") : t("Vence en {a}", { a: inSpan(n.days) });
  }
}

// ── Milestone dialog ────────────────────────────────────────────
export function MilestoneDialog({ projectId, milestone, canDelete, onClose, onSaved }: { projectId: string; milestone?: Milestone; canDelete: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(milestone?.name ?? "");
  const [start, setStart] = useState(milestone?.start_date ?? "");
  const [due, setDue] = useState(milestone?.due_date ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const base = `/projects/${projectId}/milestones`;
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); onSaved(); onClose(); } catch (e) { setError((e as Error).message); setBusy(false); } };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError(t("Escribe un nombre para el hito.")); return; }
    if (start && due && start > due) { setError(t("La fecha de inicio debe ser anterior a la de fin.")); return; }
    const body = { name: name.trim(), start_date: start || null, due_date: due || null };
    void run(() => (milestone ? api.patch(`${base}/${milestone.id}`, body) : api.post(base, body)));
  };
  const input = "field min-h-10 rounded-[10px] border-line-2 py-1.5 text-sm";
  return (
    <Dialog title={milestone ? t("Editar hito") : t("Nuevo hito")} onClose={onClose} width={480}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">{t("Nombre")}
          <input data-autofocus type="text" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={input} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">{t("Inicio|fecha")}<input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={cx(input, "tabular-nums")} /></label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">{t("Fin")}<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cx(input, "tabular-nums")} /></label>
        </div>
        <p className="text-xs text-ink-3">{t("Sin fechas, la hoja de ruta usa las de sus tickets: del primero creado a la fecha límite más lejana.")}</p>
        {error && <ErrorNote>{error}</ErrorNote>}
        {confirm && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{t("Sus tickets se conservan y quedan sin hito. Esto no se puede deshacer.")}</p>}
        <div className="-mx-5 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper px-5 py-3">
          {milestone && canDelete
            ? <Button type="button" variant={confirm ? "danger" : "ghost"} className={confirm ? "" : "text-bad"} disabled={busy} onClick={() => (confirm ? void run(() => api.del(`${base}/${milestone.id}`)) : setConfirm(true))}>{confirm ? t("Sí, eliminar hito") : t("Eliminar hito")}</Button>
            : <span />}
          <span className="flex gap-2"><Button type="button" onClick={onClose}>{t("Cancelar")}</Button><Button type="submit" variant="primary" disabled={busy}>{milestone ? t("Guardar cambios") : t("Crear hito")}</Button></span>
        </div>
      </form>
    </Dialog>
  );
}

// ── Timeline ────────────────────────────────────────────────────
export type BarKind = ShownState | "live" | "closed";
export interface TimelineItem { id: string; name: string; sub: string; begin: string | null; end: string | null; kind: BarKind; text: string; label: string; to?: string }
export interface TimelineGroup { id: string; title: string; items: TimelineItem[] }

const BAR: Record<BarKind, string> = {
  on_track: "border-accent bg-accent-soft text-accent-ink", at_risk: "border-caution bg-caution-soft text-caution-ink",
  done: "border-tk-progress-ink bg-tk-progress text-tk-progress-ink", planned: "border-dashed border-line-2 bg-ink/5 text-ink-2",
  live: "border-accent bg-accent text-on-accent", closed: "border-line-2 bg-ink/15 text-ink",
};
export const kindLabel = (k: BarKind) => (k === "live" ? t("Estudio activo") : k === "closed" ? t("Estudio cerrado") : stateLabel(k));
const monthName = (year: number, month: number, withYear: boolean) => new Intl.DateTimeFormat(locale(), { month: "short", ...(withYear ? { year: "numeric" } : {}) }).format(new Date(year, month - 1, 1));

/** Zoom, window navigation and the legend above a timeline. */
export function TimelineControls({ zoom, setZoom, shift, setShift, kinds, children }: { zoom: Zoom; setZoom: (z: Zoom) => void; shift: number; setShift: (n: number) => void; kinds: BarKind[]; children?: ReactNode }) {
  const w = timeWindow(zoom, isoDay(new Date()), shift);
  const first = w.columns[0], last = w.columns[w.columns.length - 1];
  const range = `${monthName(first.year, first.month, true)} – ${monthName(last.year, zoom === "month" ? last.month : last.month + 2, true)}`;
  const nav = "focus-ring flex h-11 w-11 items-center justify-center rounded-[10px] border border-line-2 bg-surface text-ink-2 hover:bg-ink/5";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={t("Zoom")} className="flex gap-1 rounded-[10px] bg-ink/5 p-1">
          {(["month", "quarter"] as const).map((z) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => { setZoom(z); setShift(0); }}
              className={cx("focus-ring min-h-9 rounded-lg px-3.5 text-[13px]", zoom === z ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2")}>{z === "month" ? t("Mes") : t("Trimestre")}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className={nav} onClick={() => setShift(shift - 1)} aria-label={t("Antes|periodo")} title={t("Antes|periodo")}><ChevronLeft size={16} /></button>
          <button type="button" className={nav} onClick={() => setShift(shift + 1)} aria-label={t("Después|periodo")} title={t("Después|periodo")}><ChevronRight size={16} /></button>
          {shift !== 0 && <button type="button" onClick={() => setShift(0)} className="focus-ring min-h-11 rounded-lg px-2.5 text-[13px] font-semibold text-accent-ink hover:underline">{t("Hoy")}</button>}
        </div>
        <span className="text-[13px] font-semibold text-ink-2 tabular-nums first-letter:uppercase" aria-live="polite">{range}</span>
        {children}
      </div>
      <div aria-label={t("Leyenda")} className="flex flex-wrap gap-4">
        {kinds.map((k) => <span key={k} className="inline-flex items-center gap-1.5 text-xs text-ink-2"><span aria-hidden className={cx("h-2.5 w-[18px] rounded-[3px] border", BAR[k])} />{kindLabel(k)}</span>)}
      </div>
    </div>
  );
}

/** Items on a time axis, in groups. Each bar is a link (when it has a destination) that carries its full description for screen readers. */
export function Timeline({ groups, zoom, shift }: { groups: TimelineGroup[]; zoom: Zoom; shift: number }) {
  const today = isoDay(new Date());
  const w = timeWindow(zoom, today, shift);
  const mark = dayMark(today, w);
  const grid = "grid grid-cols-[240px_minmax(0,1fr)] items-center";
  const lines = <div aria-hidden className="absolute inset-0 flex">{w.columns.map((c) => <span key={c.key} className="border-l border-line/60" style={{ width: `${c.share}%` }} />)}</div>;
  const hidden = groups.flatMap((g) => g.items).filter((i) => !i.begin || !i.end || !barSpan(i.begin, i.end, w)).length;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div className={cx(grid, "border-b border-line text-xs font-semibold text-ink-3")}>
            <div className="px-4 py-2.5">{t("Elemento")}</div>
            <div className="relative flex">
              {w.columns.map((c, i) => <span key={c.key} className="border-l border-line/60 px-2 py-2.5 first-letter:uppercase" style={{ width: `${c.share}%` }}>
                {zoom === "month" ? monthName(c.year, c.month, i === 0 || c.month === 1) : `${t("T{n}", { n: c.quarter })} ${c.year}`}</span>)}
            </div>
          </div>
          {groups.map((g) => (
            <section key={g.id} aria-label={g.title}>
              <h2 className="border-b border-line/60 bg-paper px-4 py-2 text-[13px] font-bold">{g.title}<span className="font-semibold text-ink-3 tabular-nums"> · {g.items.length}</span></h2>
              {g.items.length === 0 && <p className="px-4 py-3 text-[13px] text-ink-3">{t("Nada que mostrar aquí.")}</p>}
              {g.items.map((it) => {
                const pos = it.begin && it.end ? barSpan(it.begin, it.end, w) : null;
                const cls = cx("focus-ring absolute top-1/2 flex h-8 -translate-y-1/2 items-center overflow-hidden border px-2 text-xs font-bold whitespace-nowrap", BAR[it.kind],
                  pos?.cutStart ? "rounded-l-none border-l-0" : "rounded-l-lg", pos?.cutEnd ? "rounded-r-none border-r-0" : "rounded-r-lg");
                const style = pos ? { left: `${pos.left}%`, width: `${pos.width}%` } : undefined;
                const place = pos ? labelPlacement(pos, it.text) : "inside";
                const inner = place === "inside" ? <span aria-hidden className="truncate">{it.text}</span> : null;
                return (
                  <div key={it.id} className={cx(grid, "min-h-[52px] border-b border-line/60")}>
                    <div className="flex min-w-0 flex-col gap-0.5 px-4 py-2"><span className="truncate text-[13px] font-semibold">{it.name}</span><span className="truncate text-xs text-ink-3 tabular-nums">{it.sub}</span></div>
                    <div className="relative h-[52px]">
                      {lines}
                      {mark !== null && <span aria-hidden className="absolute inset-y-0 w-px bg-accent" style={{ left: `${mark}%` }} />}
                      {pos && (it.to
                        ? <Link to={it.to} aria-label={it.label} title={it.label} className={cls} style={style}>{inner}</Link>
                        : <span role="img" aria-label={it.label} title={it.label} className={cls} style={style}>{inner}</span>)}
                      {pos && place !== "inside" && (
                        // Too short for its label: the label sits beside the bar instead of being cut off.
                        <span aria-hidden className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-bold whitespace-nowrap text-ink-2"
                          style={place === "after" ? { left: `calc(${pos.left + pos.width}% + 6px)` } : { right: `calc(${100 - pos.left}% + 6px)` }}>{it.text}</span>
                      )}
                      {!pos && <span className="absolute inset-y-0 left-3 flex items-center text-xs text-ink-3">{!it.begin || !it.end ? t("Sin fechas") : it.end < w.start ? t("← Antes de este periodo") : t("Después de este periodo →")}</span>}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
          {mark !== null && (
            <div className={grid}>
              <div />
              <div className="relative h-8">
                <span aria-hidden className="absolute top-0 h-2 w-px bg-accent" style={{ left: `${mark}%` }} />
                <span className="absolute top-2 -translate-x-1/2 text-xs font-bold whitespace-nowrap text-accent-ink tabular-nums" style={{ left: `clamp(48px, ${mark}%, calc(100% - 48px))` }}>{t("Hoy · {a}", { a: fmt(today, false) })}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      {hidden > 0 && <p className="border-t border-line/60 px-4 py-2.5 text-xs text-ink-3">{plural(hidden, { one: "{n} elemento queda fuera de este periodo o no tiene fechas.", other: "{n} elementos quedan fuera de este periodo o no tienen fechas." })}</p>}
    </div>
  );
}

/** A milestone as a timeline item. `to` is left out on the public roadmap, where there is nothing to open. */
export function milestoneItem(m: Pick<Milestone, "id" | "name" | "begin_date" | "end_date" | "total" | "done" | "state" | "progress">, to?: string): TimelineItem {
  const kind = shownState(m.state), range = dateRange(m.begin_date, m.end_date, false);
  return { id: m.id, name: m.name, sub: `${range} · ${t("{a} de {b}", { a: m.done, b: m.total })}`, begin: m.begin_date, end: m.end_date, kind, to,
    text: `${stateLabel(kind)} · ${m.progress}%`, label: t("{a}: {b}, {c}% hecho, {d}", { a: m.name, b: stateLabel(kind), c: m.progress, d: range }) };
}
