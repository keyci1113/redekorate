// Dashboard building blocks: stat tiles, panels, a column chart and a horizontal bar list.
// The charts are plain HTML: every bar has a hover and keyboard-focus tooltip, and the same numbers are available as a table to screen readers.
// Tiles, bars and columns given an `onOpen` become buttons that open the items behind the number (DrillModal).
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight } from "lucide-react";
import { cx } from "../components/ui";
import { fmtNum, t } from "../lib/i18n";
import { labelTicks, shares, type Delta } from "./model";

/**
 * A headline number with its label, an optional change against the previous period and a line of context.
 * With `onOpen`, the label is a button whose hit area covers the whole tile.
 */
export function Tile({ label, value, suffix, change, tone = "neutral", sub, onOpen }: { label: string; value: ReactNode; suffix?: string; change?: { delta: Delta; text: string }; tone?: "good" | "bad" | "neutral"; sub?: ReactNode; onOpen?: () => void }) {
  const ink = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink-2";
  return (
    <div className={cx("relative flex flex-col gap-1.5 rounded-2xl border border-line bg-surface px-5 py-[18px]", onOpen && "transition hover:border-line-2 hover:shadow-(--shadow-lift) has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent")}>
      {onOpen
        ? <button type="button" onClick={onOpen} aria-haspopup="dialog" title={t("Ver detalle")} className="flex items-center justify-between gap-2 text-left text-[13px] font-semibold text-ink-3 outline-none after:absolute after:inset-0 after:rounded-2xl">{label}<ArrowUpRight size={14} aria-hidden className="shrink-0" /></button>
        : <p className="text-[13px] font-semibold text-ink-3">{label}</p>}
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em] tabular-nums">{value}{suffix && <span className="ml-1.5 text-sm font-semibold text-ink-3">{suffix}</span>}</span>
        {change && change.delta.dir !== "same" && (
          <span className={cx("inline-flex items-center gap-1 text-xs font-bold tabular-nums", ink)}>
            {change.delta.dir === "up" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
            <span className="sr-only">{change.delta.dir === "up" ? t("Subió") : t("Bajó")}</span>{change.text}
          </span>
        )}
      </p>
      {sub && <p className="text-[13px] text-ink-3">{sub}</p>}
    </div>
  );
}

export function Panel({ title, link, note, children, className }: { title: string; link?: { to: string; text: string }; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("flex min-w-0 flex-col gap-3.5 rounded-2xl border border-line bg-surface px-[22px] py-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-bold">{title}</h2>
        {link && <Link to={link.to} className="focus-ring inline-flex min-h-8 items-center gap-1.5 rounded text-[13px] font-semibold text-accent-ink hover:underline">{link.text}<ArrowRight size={14} aria-hidden /></Link>}
      </div>
      {children}
      {note && <p className="text-[13px] text-ink-3">{note}</p>}
    </section>
  );
}

export const EmptyNote = ({ children }: { children: ReactNode }) => <p className="py-4 text-[13px] text-ink-3">{children}</p>;

const SERIES = ["bg-chart-1", "bg-chart-2"];
const tip = "pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-paper shadow-(--shadow-lift) group-hover:block group-focus-visible:block";

/**
 * Columns over time, one or two series. Each group shows its values on hover or keyboard focus,
 * the latest group is labeled directly, and the full data is a table for screen readers.
 */
export function Columns({ points, series, caption, onOpen }: { points: { label: string; values: number[] }[]; series: string[]; caption: string; onOpen?: (index: number) => void }) {
  const max = Math.max(1, ...points.flatMap((p) => p.values));
  const ticks = labelTicks(points.length, 8);
  const last = points.length - 1;
  return (
    <figure className="flex flex-col gap-2">
      {series.length > 1 && (
        <div className="flex gap-4 text-xs text-ink-2">
          {series.map((name, i) => <span key={name} className="inline-flex items-center gap-1.5"><span aria-hidden className={cx("h-2.5 w-2.5 rounded-[3px]", SERIES[i])} />{name}</span>)}
        </div>
      )}
      <div className="flex items-end gap-1 border-b border-line-2 pt-6" role="group" aria-label={caption}>
        {points.map((p, i) => {
          // A clickable column is a button named by its numbers; otherwise a focusable group that only shows its tooltip.
          const Group = onOpen ? "button" : "div";
          const name = `${p.label}: ${p.values.map((v, k) => (series.length > 1 ? `${series[k]} ${fmtNum(v)}` : fmtNum(v))).join(", ")}`;
          const own = onOpen ? { type: "button" as const, onClick: () => onOpen(i), "aria-haspopup": "dialog" as const, "aria-label": name } : { tabIndex: 0 };
          return (
          <Group key={p.label + i} {...own}
            className={cx("group relative flex h-[170px] min-w-0 flex-1 items-end justify-center gap-0.5 rounded-t outline-none hover:bg-ink/5 focus-visible:bg-ink/5 focus-visible:ring-2 focus-visible:ring-accent", onOpen && "cursor-pointer")}>
            <span role="tooltip" className={tip}>
              <span className="block font-semibold">{p.label}</span>
              {p.values.map((v, k) => <span key={k} className="block tabular-nums">{series.length > 1 ? `${series[k]}: ` : ""}{fmtNum(v)}</span>)}
            </span>
            {p.values.map((v, k) => (
              <span key={k} className={cx("relative block rounded-t-[4px]", SERIES[k], series.length > 1 ? "w-[40%] max-w-[18px]" : "w-full max-w-[28px]")} style={{ height: v > 0 ? Math.max(2, Math.round((v / max) * 170)) : 0 }}>
                {i === last && <span aria-hidden className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-[11px] font-bold text-ink tabular-nums">{fmtNum(v)}</span>}
              </span>
            ))}
          </Group>
          );
        })}
      </div>
      <div aria-hidden className="flex gap-1 text-[11px] text-ink-3 tabular-nums">
        {points.map((p, i) => <span key={p.label + i} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">{ticks.has(i) ? p.label : ""}</span>)}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">{t("Periodo")}</th>{series.map((s) => <th key={s} scope="col">{s}</th>)}</tr></thead>
        <tbody>{points.map((p, i) => <tr key={p.label + i}><th scope="row">{p.label}</th>{p.values.map((v, k) => <td key={k}>{v}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

export interface BarRow { key: string; label: ReactNode; name: string; value: number; text?: string; flag?: ReactNode; to?: string; onOpen?: () => void }
/**
 * Horizontal bars for comparing categories: the label, a bar scaled to the largest value, and the number.
 * A row with `to` links its label; a row with `onOpen` makes its label a button, and its bar and number open it too.
 */
export function BarList({ rows, labelWidth = 150, max }: { rows: BarRow[]; labelWidth?: number; max?: number }) {
  const widths = max ? rows.map((r) => (r.value <= 0 ? 0 : Math.max(2, Math.round((r.value / max) * 100)))) : shares(rows.map((r) => r.value));
  return (
    // One grid for the whole list, so every bar starts and ends at the same place whatever the label or value width.
    <ul className="grid items-center gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: `minmax(0, ${labelWidth}px) minmax(0, 1fr) auto` }}>
      {rows.map((r, i) => (
        <li key={r.key} className="contents" title={`${r.name}: ${r.text ?? fmtNum(r.value)}`}>
          <span className="flex min-h-7 min-w-0 items-center text-[13px] [overflow-wrap:anywhere]">
            {r.to ? <Link to={r.to} className="focus-ring rounded hover:underline">{r.label}</Link>
              : r.onOpen ? <button type="button" onClick={r.onOpen} aria-haspopup="dialog" className="focus-ring min-h-7 rounded text-left hover:underline"><span className="sr-only">{t("Ver detalle")}: </span>{r.label}<span className="sr-only">, {r.text ?? fmtNum(r.value)}</span></button>
              : r.label}
          </span>
          <span aria-hidden onClick={r.onOpen} className={cx("block h-3.5 rounded-r-[4px] bg-ink/[0.06]", r.onOpen && "cursor-pointer hover:bg-ink/[0.1]")}><span className="block h-3.5 rounded-r-[4px] bg-chart-1" style={{ width: `${widths[i]}%` }} /></span>
          <span onClick={r.onOpen} className={cx("inline-flex items-center justify-end gap-1.5 text-[13px] font-bold tabular-nums", r.onOpen && "cursor-pointer")}>{r.text ?? fmtNum(r.value)}{r.flag}</span>
        </li>
      ))}
    </ul>
  );
}

export const Flag = ({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "bad" }) => (
  <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap", tone === "bad" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>{children}</span>
);
