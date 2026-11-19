// Small building blocks shared by the ticket screens: chips, people, dates, and the menu and dialog primitives.
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Check, Lightbulb, MessageSquareDot, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { cx } from "../components/ui";
import { locale, t } from "../lib/i18n";
import { isStockColumnName, type Column, type PersonRef, type Ticket, type TicketPriority, type TicketStatus, type TicketType } from "./model";

// ── Texts ───────────────────────────────────────────────────────
export const statusLabel = (s: TicketStatus) => ({ todo: t("Por hacer"), in_progress: t("En progreso"), in_review: t("En revisión"), done: t("Hecho") })[s];
export const typeLabel = (x: TicketType) => ({ task: t("Tarea"), bug: t("Bug"), research_request: t("Pedido de investigación"), design_change: t("Cambio de diseño") })[x];
export const priorityLabel = (p: TicketPriority) => ({ urgent: t("Urgente"), high: t("Alta"), medium: t("Media"), low: t("Baja") })[p];

// ── Dates ───────────────────────────────────────────────────────
const localDay = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
/** "Nov 18" — a due date on a card or a row. */
export const fmtDay = (iso: string) => new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric" }).format(localDay(iso));
/** "Nov 20, 2026" — a due date in a field. */
export const fmtDayLong = (iso: string) => new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric", year: "numeric" }).format(localDay(iso));
/** "Nov 11, 2026 · 4:02 pm" — a moment (comment, report, activity). */
export function fmtMoment(iso: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat(locale(), { hour: "numeric", minute: "2-digit" }).format(d).toLowerCase();
  return `${day} · ${time}`;
}

// ── Chips ───────────────────────────────────────────────────────
const STATUS_STYLE: Record<TicketStatus, [string, string]> = {
  todo: ["bg-tk-todo text-tk-todo-ink", "bg-tk-todo-ink"],
  in_progress: ["bg-tk-progress text-tk-progress-ink", "bg-tk-progress-ink"],
  in_review: ["bg-tk-review text-tk-review-ink", "bg-tk-review-ink"],
  done: ["bg-tk-done text-tk-done-ink", "bg-tk-done-ink"],
};
/**
 * The name of a board column: its own, or the translated status of a built-in one. A saved column that
 * still carries the stock name of its status ("Por hacer", "To do"…) is shown in the app's language too.
 */
export const columnName = (c: Pick<Column, "name" | "status">) => c.name && !isStockColumnName(c.name, c.status) ? c.name : statusLabel(c.status);
/** A board column as a chip: the color says what it counts as, the text is the column's name. */
export function ColumnChip({ column }: { column: Pick<Column, "name" | "status"> }) {
  const [chip, dot] = STATUS_STYLE[column.status];
  return (
    <span className={cx("inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-[3px] text-xs font-bold whitespace-nowrap", chip)}>
      <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", dot)} /><span className="truncate">{columnName(column)}</span>
    </span>
  );
}
/** Status as a colored dot plus its name: never color alone. */
export function StatusChip({ status }: { status: TicketStatus }) {
  const [chip, dot] = STATUS_STYLE[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-xs font-bold whitespace-nowrap", chip)}>
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", dot)} />{statusLabel(status)}
    </span>
  );
}

const TYPE_STYLE: Record<TicketType, string> = {
  task: "bg-tk-task text-tk-task-ink", bug: "bg-tk-bug text-tk-bug-ink",
  research_request: "bg-tk-research text-tk-research-ink", design_change: "bg-tk-design text-tk-design-ink",
};
export function TypeChip({ type }: { type: TicketType }) {
  return <span className={cx("inline-flex items-center rounded-md px-2 py-[3px] text-xs font-semibold whitespace-nowrap", TYPE_STYLE[type])}>{typeLabel(type)}</span>;
}

const PRIORITY_STYLE: Record<TicketPriority, [string, string, number]> = {
  urgent: ["text-tk-urgent", "bg-tk-urgent", 4], high: ["text-tk-high", "bg-tk-high", 3],
  medium: ["text-tk-medium", "bg-tk-medium", 2], low: ["text-tk-low", "bg-tk-low", 1],
};
/** Priority as four bars (more filled = more urgent) plus its name. */
export function PriorityMark({ priority }: { priority: TicketPriority }) {
  const [ink, bar, filled] = PRIORITY_STYLE[priority];
  return (
    <span className={cx("inline-flex items-center gap-1.5 align-middle text-xs font-semibold whitespace-nowrap", ink)}>
      <span aria-hidden className="inline-flex h-[13px] items-end gap-0.5">
        {[4, 7, 10, 13].map((h, i) => <span key={h} style={{ height: h }} className={cx("w-[3px] rounded-[1px]", i < filled ? bar : "bg-tk-bar-off")} />)}
      </span>
      {priorityLabel(priority)}
    </span>
  );
}

export function LabelChip({ children, onRemove }: { children: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line-2 px-2 py-0.5 text-xs whitespace-nowrap text-ink-2">
      {children}
      {onRemove && <button type="button" onClick={onRemove} aria-label={t("Quitar etiqueta {a}", { a: children })} className="focus-ring relative -mr-1 rounded-full p-0.5 text-ink-3 before:absolute before:-inset-3 hover:text-ink"><X size={12} /></button>}
    </span>
  );
}

/** Where a ticket came from, when it was not written by hand. */
export function SourceMark({ ticket, projectId }: { ticket: Pick<Ticket, "source" | "from_insight" | "widget_ref" | "converted_insight_id">; projectId?: string }) {
  if (ticket.source === "widget") return <span title={t("Enviado desde el widget de feedback")} className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap text-accent-ink"><MessageSquareDot size={14} aria-hidden />{t("Widget")}</span>;
  // A ticket that was converted into an insight points to it; "From an insight" is only for tickets created from one.
  if (ticket.converted_insight_id && !ticket.from_insight) {
    const inner = <><Lightbulb size={14} aria-hidden />{t("Insight creado")}</>;
    const cls = "inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap text-accent-ink";
    // relative z-10 keeps the link clickable above a card's stretched title link.
    return projectId ? <Link to={`/projects/${projectId}?tab=insights`} className={cx(cls, "focus-ring relative z-10 rounded hover:underline")}>{inner}</Link> : <span className={cls}>{inner}</span>;
  }
  if (ticket.from_insight) return <span className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap text-accent-ink"><Lightbulb size={14} aria-hidden />{t("Desde un insight")}</span>;
  return null;
}

/** Overlapping avatars with the names available to screen readers and on hover. */
export function AvatarStack({ people, size = 24, max = 3 }: { people: PersonRef[]; size?: number; max?: number }) {
  if (!people.length) return null;
  const names = people.map((p) => p.name).join(", ");
  return (
    <span role="img" aria-label={names} title={names} className="inline-flex shrink-0 items-center">
      {people.slice(0, max).map((p, i) => <Avatar key={p.id} name={p.name} avatar={p.avatar} size={size} className={cx("ring-2 ring-surface", i > 0 && "-ml-1.5")} />)}
      {people.length > max && <span className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-paper-2 text-[10px] font-bold text-ink-2 ring-2 ring-surface tabular-nums" style={{ width: size, height: size }}>+{people.length - max}</span>}
    </span>
  );
}

/** A removable person (assignee or tagged). */
export function PersonChip({ person, removeLabel, onRemove }: { person: PersonRef; removeLabel?: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-2 pl-0.5 text-[13px] font-medium">
      <Avatar name={person.name} avatar={person.avatar} size={24} />{person.name}
      {onRemove && <button type="button" onClick={onRemove} aria-label={removeLabel} className="focus-ring relative rounded-full p-0.5 text-ink-3 before:absolute before:-inset-2.5 hover:text-ink"><X size={13} /></button>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("block rounded-lg bg-ink/[0.06]", className)} />;
}

export const srOnly = "sr-only";

// ── Menu parts (the menu itself is components/Menu.tsx) ─────────

export function MenuSearch({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <label className="mb-1 block">
      <span className="sr-only">{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="field min-h-10" />
    </label>
  );
}

export const MenuNote = ({ children }: { children: ReactNode }) => <p className="px-2.5 pt-1.5 pb-1 text-xs text-ink-3">{children}</p>;

// ── Dialog ──────────────────────────────────────────────────────
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** A modal dialog: focus moves in and stays in, Escape closes, and focus returns to whatever opened it. */
export function Dialog({ title, subtitle, onClose, children, footer, width = 560 }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const box = useRef<HTMLDivElement | null>(null);
  const id = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = box.current;
    (el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = scroll; opener?.focus?.(); };
  }, []);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-6 sm:py-12" onMouseDown={onClose}>
      {/* The dialog never grows past the window (dvh: the visible height, also on phones): the title and the footer stay
          in view and only the body scrolls. The heights match the overlay's py-6 / sm:py-12. */}
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={onKey} onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: width }}
        className="tk-dialog flex max-h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-(--shadow-lift) sm:max-h-[calc(100dvh-6rem)]">
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={id} className="text-[17px] leading-snug font-bold">{title}</h2>
            {subtitle && <p className="text-xs text-ink-3">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t("Cerrar diálogo")} className="focus-ring -mt-1 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-ink-2 hover:bg-ink/5"><X size={16} /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-paper px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
