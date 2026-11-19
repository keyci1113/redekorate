import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, TriangleAlert, X } from "lucide-react";
import { Menu, MenuItem } from "./Menu";
import { Link } from "react-router-dom";
import type { StudyStatus, Severity } from "../lib/types";

import { t } from "../lib/i18n";
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent/90 hover:-translate-y-px active:translate-y-0 motion-reduce:transform-none shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:border-line-2 hover:bg-paper/60",
  ghost: "text-ink-2 hover:bg-ink/5 hover:text-ink",
  danger: "bg-bad text-white hover:bg-bad/90",
};

export function Button({
  variant = "secondary", size = "md", icon, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: ReactNode }) {
  return (
    <button
      className={cx(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "lg" && "h-11 px-5 text-[15px]",
        variants[variant], className,
      )}
      {...rest}
    >
      {icon}{children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-line bg-surface", className)}>{children}</div>;
}

/** Campo con etiqueta. Usa group para controles complejos (imágenes, botones):
 *  un <label> reenvía los clics al primer botón interno. */
export function Field({ label, hint, children, group }: { label: string; hint?: string; children: ReactNode; group?: boolean }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block space-y-1.5" {...(group ? { role: "group", "aria-label": label } : {})}>
      <span className="block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-3">{hint}</span>}
    </Tag>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  // Move focus into the dialog (unless a field there already took it) and give it back to what opened it on close.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    if (!box.current?.contains(document.activeElement)) box.current?.focus();
    return () => { if (before?.isConnected) before.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-[10vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={cx("w-full rounded-2xl border border-line bg-surface shadow-xl outline-none", wide ? "max-w-2xl" : "max-w-md")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} className="focus-ring rounded-md p-1 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label={t("Cerrar")}><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const statusStyle = (): Record<StudyStatus, [string, string]> => ({
  draft: [t("Borrador"), "bg-ink/5 text-ink-2"],
  live: [t("Activo"), "bg-good-soft text-good"],
  closed: [t("Cerrado"), "bg-warn-soft text-warn"],
});

export function StatusBadge({ status }: { status: StudyStatus }) {
  const [label, cls] = statusStyle()[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      <span className={cx("h-1.5 w-1.5 rounded-full bg-current", status === "live" && "animate-pulse")} />
      {label}
    </span>
  );
}

const sevStyle = (): Record<Severity, [string, string]> => ({
  low: [t("Baja"), "bg-ink/5 text-ink-2"],
  medium: [t("Media"), "bg-accent-soft text-accent-ink"],
  high: [t("Alta"), "bg-warn-soft text-warn"],
  critical: [t("Crítica"), "bg-bad-soft text-bad"],
});
export const severityLabel = (s: Severity) => sevStyle()[s][0];

export function SeverityBadge({ severity }: { severity: Severity }) {
  const [label, cls] = sevStyle()[severity];
  return <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-[11px] font-medium text-ink-2">{children}</span>;
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-2 px-6 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-ink-3 shadow-sm ring-1 ring-line">{icon}</div>
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-3">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ label = t("Cargando…") }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-sm text-ink-3">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-accent" /> {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-bad/20 bg-bad-soft px-3 py-2 text-sm text-bad">{children}</div>;
}

export type StatTone = "good" | "warn" | "bad";
const STAT_TONE: Record<StatTone, { box: string; value: string; Icon: typeof X }> = {
  good: { box: "border-good/30 bg-good-soft", value: "text-good", Icon: CheckCircle2 },
  warn: { box: "border-warn/30 bg-warn-soft", value: "text-warn", Icon: TriangleAlert },
  bad: { box: "border-bad/30 bg-bad-soft", value: "text-bad", Icon: TriangleAlert },
};

/** Tono según umbrales: ≥ good → verde, ≥ warn → ámbar, menos → rojo. Con `lowerIsBetter` se invierte. Sin datos, sin tono. */
export function toneFor(value: number, good: number, warn: number, { n = 1, lowerIsBetter = false }: { n?: number; lowerIsBetter?: boolean } = {}): StatTone | undefined {
  if (!n || !Number.isFinite(value)) return undefined;
  if (lowerIsBetter) return value <= good ? "good" : value <= warn ? "warn" : "bad";
  return value >= good ? "good" : value >= warn ? "warn" : "bad";
}

/** Indicador grande. `tone` lo pinta en verde, ámbar o rojo cuando el dato es bueno o malo. */
export function Stat({ label, value, sub, tone, note }: { label: string; value: ReactNode; sub?: ReactNode; tone?: StatTone; note?: string }) {
  const s = tone ? STAT_TONE[tone] : null;
  return (
    <div className={cx("rounded-xl border p-5 break-inside-avoid", s ? s.box : "border-line bg-surface")}>
      <div className="flex items-start justify-between gap-2">
        <p className="label">{label}</p>
        {s && <s.Icon size={16} aria-hidden className={cx("shrink-0", s.value)} />}
      </div>
      <p className={cx("display mt-3 text-[40px] leading-none tabular-nums", s?.value)}>{value}</p>
      {(sub || note) && (
        <p className="mt-2 text-[13px] text-ink-2">
          {note && <span className={cx("font-semibold", s?.value)}>{note}</span>}
          {note && sub && " · "}
          {sub}
        </p>
      )}
    </div>
  );
}

export interface TabItem<T extends string> { id: T; label: string; count?: number; group?: string }

/**
 * Which tabs fit in the row and which go into "Más": the first `fit` tabs, with the active one always kept
 * visible (it takes the last visible slot when it would otherwise overflow).
 */
export function splitTabs(count: number, fit: number, active: number): { visible: number[]; overflow: number[] } {
  if (fit >= count) return { visible: [...Array(count).keys()], overflow: [] };
  const n = Math.max(1, fit);
  const visible = [...Array(n).keys()];
  if (active >= n) visible[n - 1] = active;
  return { visible, overflow: [...Array(count).keys()].filter((i) => !visible.includes(i)) };
}

const tabClass = (on: boolean) => cx(
  "group relative flex items-center gap-1.5 rounded-t-md px-2.5 pt-2.5 pb-3 text-sm font-medium whitespace-nowrap transition outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
  on ? "text-ink" : "text-ink-3 hover:text-ink",
);
const MORE_WIDTH = 96;   // room kept for the "Más" button when some tabs overflow

/** Underline tabs. A count shows as a small badge when there is something to count; when `group` changes from one item to the
 *  next, a thin divider separates them. Tabs that don't fit go into a "Más" menu, so none hides behind a scrollbar. */
export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; label?: string }) {
  const row = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(items.length);
  const sig = items.map((it) => `${it.id}:${it.label}:${it.count ?? ""}:${it.group ?? ""}`).join("|");
  useLayoutEffect(() => {
    const el = row.current, m = measure.current;
    if (!el || !m) return;
    const calc = () => {
      const widths = [...m.children].map((c) => (c as HTMLElement).getBoundingClientRect().width);
      const avail = el.clientWidth;
      if (widths.reduce((a, w) => a + w, 0) <= avail) { setFit(widths.length); return; }
      let used = 0, n = 0;
      while (n < widths.length && used + widths[n] + MORE_WIDTH <= avail) used += widths[n++];
      setFit(n);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sig]);
  const activeIndex = items.findIndex((it) => it.id === value);
  const { visible, overflow } = splitTabs(items.length, fit, activeIndex);
  const badge = (it: TabItem<T>, on: boolean) => !!it.count && <span className={cx("min-w-5 rounded-full px-1.5 text-center text-[11px] leading-[18px] font-semibold tabular-nums transition", on ? "bg-accent-soft text-accent-ink" : "bg-ink/5 text-ink-3")}>{it.count}</span>;
  return (
    <div role={label ? "navigation" : undefined} aria-label={label} className="relative">
      {/* Every tab at its natural width, off-screen, to work out how many fit. */}
      {/* A zero-size clipped box, so the measuring row never widens the page. */}
      <div aria-hidden className="pointer-events-none invisible absolute top-0 left-0 h-0 w-0 overflow-hidden">
        <div ref={measure} className="flex w-max">
          {items.map((it, i) => (
            <span key={it.id} className="flex items-stretch">
              {i > 0 && it.group !== items[i - 1].group && <span className="mx-1.5 w-px" />}
              <span className={tabClass(false)}>{it.label}{badge(it, false)}</span>
            </span>
          ))}
        </div>
      </div>
      <div ref={row} className="flex min-w-0 items-stretch border-b border-line">
        {visible.map((i, k) => {
          const it = items[i], on = value === it.id;
          const prev = k > 0 ? items[visible[k - 1]] : undefined;
          const divider = !!prev && it.group !== prev.group;
          return (
            <div key={it.id} className="flex items-stretch">
              {divider && <span aria-hidden className="mx-1.5 my-3 w-px bg-line-2/60" />}
              <button type="button" onClick={() => onChange(it.id)} aria-current={on ? "page" : undefined} className={tabClass(on)}>
                {it.label}
                {badge(it, on)}
                {/* The underline sits on the row's border, so the bar reads as one line. */}
                <span aria-hidden className={cx("absolute inset-x-2 -bottom-px h-0.5 rounded-full transition", on ? "bg-accent" : "bg-transparent group-hover:bg-line-2")} />
              </button>
            </div>
          );
        })}
        {overflow.length > 0 && (
          <Menu label={t("Más secciones")} width={240} button={(props, open) => (
            <button {...props} className={cx(tabClass(false), open && "text-ink")}>
              {t("Más")} <ChevronDown size={14} aria-hidden />
              {overflow.some((i) => items[i].count) && <span className="sr-only">{t("({a} con contenido)", { a: overflow.filter((i) => items[i].count).length })}</span>}
            </button>
          )}>
            {(close) => overflow.map((i) => (
              <MenuItem key={items[i].id} onSelect={() => { close(false); onChange(items[i].id); }}>
                <span className="flex-1">{items[i].label}</span>{badge(items[i], false)}
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>
    </div>
  );
}

/** The way back to the page this one was opened from: "← Project · Documents". `color` adds the project's swatch.
 *  The "·" is visual only; screen readers hear "Project Documents" with no punctuation read aloud.
 *  `compact` is for the top bar of full-screen pages: on a phone only the arrow shows, and the text stays for screen readers. */
export function BackLink({ to, label, section, color, compact, className }: { to: string; label: string; section?: string; color?: string; compact?: boolean; className?: string }) {
  return (
    <Link to={to} title={t("Volver a {a}", { a: section ? `${label} · ${section}` : label })}
      className={cx("focus-ring group inline-flex min-w-0 items-center gap-1.5 rounded-lg text-sm text-ink-3 transition hover:text-ink",
        compact ? "h-9 shrink-0 px-2 hover:bg-ink/5" : "-ml-1 max-w-full px-1 py-0.5", className)}>
      <ArrowLeft size={16} aria-hidden className="shrink-0 transition-transform group-hover:-translate-x-0.5 motion-reduce:transform-none" />
      {color && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />}
      <span className={cx("truncate", compact && "max-w-40 max-sm:sr-only lg:max-w-64")}>
        <span className="font-medium text-ink-2 group-hover:text-ink">{label}</span>{section && <><span aria-hidden> · </span><span className="sr-only"> </span>{section}</>}
      </span>
    </Link>
  );
}
