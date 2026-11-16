// A document field that is filled from a calendar. "one" picks a single day; "many" picks any number of days,
// one by one or as a range, so a study that ran Oct 1–3 and again on Oct 8 reads "Oct 1 – 3, Oct 8, 2026".
// The field keeps its text (what exports, the read-only view and the API show) and, beside it, the ISO days.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "../components/ui";
import type { Lang } from "../lib/i18n";
import { addRange, formatDays, isoOf, monthGrid, parseDays, toggleDay } from "./dates";

export type DateMode = "one" | "many";
interface Props {
  label: string; mode: DateMode; lang: Lang; T: (k: string, v?: Record<string, string | number>) => string;
  text: string; days: string; placeholder: string;
  onChange: (text: string, days: string[]) => void;
}

export function DatesField({ label, mode, lang, T, text, days: stored, placeholder, onChange }: Props) {
  const locale = lang === "en" ? "en-US" : "es";
  const mondayFirst = lang !== "en";
  const days = parseDays(stored);
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const start = days[0] ? new Date(`${days[0]}T12:00`) : new Date();
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [pos, setPos] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => { setOpen(false); setAnchor(null); if (refocus) trigger.current?.focus(); };
  const commit = (next: string[]) => onChange(formatDays(next, locale), next);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    const w = Math.min(304, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = window.innerHeight - r.bottom - 12;
    setPos(below >= 380 || below >= r.top ? { left, top: r.bottom + 6, width: w } : { left, bottom: window.innerHeight - r.top + 6, width: w });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sel = days[0] ? `[data-day="${days[0]}"]` : "[data-today]";
    (panel.current?.querySelector<HTMLElement>(sel) ?? panel.current?.querySelector<HTMLElement>("[data-day]"))?.focus();
    const outside = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close(false); };
    const away = () => close(false);
    document.addEventListener("mousedown", outside);
    window.addEventListener("resize", away);
    return () => { document.removeEventListener("mousedown", outside); window.removeEventListener("resize", away); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (iso: string, shift: boolean) => {
    if (mode === "one") { commit([iso]); close(); return; }
    if (anchor && (range || shift)) { commit(addRange(days, anchor, iso)); setAnchor(null); return; }
    if (range) { setAnchor(iso); return; }
    commit(toggleDay(days, iso)); setAnchor(iso);
  };

  const shiftMonth = (n: number) => setView(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    const el = document.activeElement as HTMLElement | null;
    const cur = el?.dataset.day;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!cur || !step) return;
    e.preventDefault();
    const d = new Date(`${cur}T12:00`); d.setDate(d.getDate() + step);
    const iso = isoOf(d);
    if (d.getMonth() !== view.m) setView({ y: d.getFullYear(), m: d.getMonth() });
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>(`[data-day="${iso}"]`)?.focus());
  };

  const today = isoOf(new Date());
  const grid = monthGrid(view.y, view.m, mondayFirst);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2026, 10, (mondayFirst ? 2 : 1) + i)));
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(view.y, view.m, 1));
  const picked = new Set(days);
  const long = (iso: string) => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T12:00`));

  return (
    <>
      <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}
        className="mt-0.5 flex w-full items-center gap-2 border-b border-dotted border-line-2 bg-transparent py-1 text-left text-[14px] outline-none focus:border-accent">
        <span className={cx("min-w-0 flex-1 truncate", !text && "text-ink-3")}>{text || placeholder}</span>
        <CalendarDays size={15} aria-hidden className="shrink-0 text-ink-3 print:hidden" />
      </button>
      {open && (
        <div ref={panel} role="dialog" aria-label={label} onKeyDown={onKey} style={pos}
          className="fixed z-[70] rounded-xl border border-line bg-surface p-3 text-ink shadow-(--shadow-lift) print:hidden">
          {mode === "many" && (
            <div role="radiogroup" aria-label={T("Cómo elegir")} className="mb-2.5 grid grid-cols-2 gap-1 rounded-lg bg-ink/5 p-1 text-[12px] font-semibold">
              {[[false, T("Días sueltos")], [true, T("Rango")]].map(([v, l]) => (
                <button key={String(v)} type="button" role="radio" aria-checked={range === v} onClick={() => { setRange(v as boolean); setAnchor(null); }}
                  className={cx("focus-ring rounded-md px-2 py-1.5", range === v ? "bg-surface shadow-sm" : "text-ink-3 hover:text-ink")}>{l as string}</button>
              ))}
            </div>
          )}
          <div className="mb-1.5 flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label={T("Mes anterior")} className="focus-ring grid h-8 w-8 place-items-center rounded-lg hover:bg-ink/5"><ChevronLeft size={16} /></button>
            <span aria-live="polite" className="text-[13px] font-bold capitalize">{title}</span>
            <button type="button" onClick={() => shiftMonth(1)} aria-label={T("Mes siguiente")} className="focus-ring grid h-8 w-8 place-items-center rounded-lg hover:bg-ink/5"><ChevronRight size={16} /></button>
          </div>
          <div role="grid" aria-label={title} className="grid grid-cols-7 gap-y-0.5 text-center">
            {weekdays.map((w, i) => <span key={i} aria-hidden className="pb-1 text-[11px] font-semibold text-ink-3 uppercase">{w}</span>)}
            {grid.flat().map((iso, i) => {
              if (!iso) return <span key={i} />;
              const on = picked.has(iso);
              const prev = new Date(`${iso}T12:00`); prev.setDate(prev.getDate() - 1);
              const next = new Date(`${iso}T12:00`); next.setDate(next.getDate() + 1);
              const joinL = on && picked.has(isoOf(prev)) && i % 7 !== 0;
              const joinR = on && picked.has(isoOf(next)) && i % 7 !== 6;
              return (
                <span key={iso} className={cx("flex justify-center", on && "bg-accent/15", on && !joinL && "rounded-l-full", on && !joinR && "rounded-r-full")}>
                  <button type="button" data-day={iso} data-today={iso === today || undefined} aria-pressed={on} aria-label={long(iso)}
                    onClick={(e) => pick(iso, e.shiftKey)}
                    className={cx("focus-ring grid h-9 w-9 place-items-center rounded-full text-[13px] tabular-nums",
                      on ? "bg-accent font-bold text-on-accent" : "hover:bg-ink/5",
                      anchor === iso && !on && "ring-2 ring-accent",
                      iso === today && !on && "font-bold text-accent")}>
                    {Number(iso.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
          {mode === "many" && (
            <p className="mt-2 text-[11px] leading-snug text-ink-3">
              {range ? (anchor ? T("Ahora elige el último día.") : T("Elige el primer día del rango.")) : T("Toca cada día para agregarlo o quitarlo. Shift + clic llena un rango.")}
            </p>
          )}
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2.5">
            <button type="button" disabled={!days.length && !text} onClick={() => { onChange("", []); setAnchor(null); }}
              className="focus-ring rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-ink-3 hover:bg-ink/5 hover:text-ink disabled:opacity-40">{T("Limpiar")}</button>
            <button type="button" onClick={() => close()} className="focus-ring rounded-lg bg-accent px-3 py-1.5 text-[12px] font-bold text-on-accent">{T("Hecho")}</button>
          </div>
        </div>
      )}
    </>
  );
}
