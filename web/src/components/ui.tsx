import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";
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
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-[10vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={cx("w-full rounded-2xl border border-line bg-surface shadow-xl", wide ? "max-w-2xl" : "max-w-md")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
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

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1 border-b border-line">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "focus-ring -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition",
            value === t.id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-ink/5 px-1.5 text-[11px] tabular-nums text-ink-2">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
