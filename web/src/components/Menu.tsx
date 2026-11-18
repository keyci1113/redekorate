// A popup menu anchored to its button, and its items (same primitive as the ticket screens on the GitLab edition).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
// Its own cx: ui.tsx imports this file (the Tabs overflow menu), so importing ui here would be a cycle.
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const visible = (el: HTMLElement) => el.getClientRects().length > 0;

interface MenuProps {
  /** Accessible name of the popup. */
  label: string;
  /** Renders the trigger; spread `props` on the button. */
  button: (props: { ref: (el: HTMLButtonElement | null) => void; onClick: () => void; "aria-haspopup": "menu"; "aria-expanded": boolean; type: "button" }, open: boolean) => ReactNode;
  /** `close()` returns focus to the button; `close(false)` leaves it where the chosen action put it. */
  children: (close: (refocus?: boolean) => void) => ReactNode;
  /** Popup width in px, or "trigger" to match the button (for field-like pickers). */
  width?: number | "trigger";
}

/**
 * A popup menu anchored to its button. It is positioned against the viewport, so it is never clipped by a
 * scrolling column or table. Arrow keys move between items, Escape closes and returns focus to the button.
 */
export function Menu({ label, button, children, width = 240 }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const close = (refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus(); };

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    const w = Math.min(width === "trigger" ? Math.max(r.width, 200) : width, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    setPos(below >= 220 || below >= above
      ? { left, top: r.bottom + 6, width: w, maxHeight: Math.max(160, below) }
      : { left, bottom: window.innerHeight - r.top + 6, width: w, maxHeight: Math.max(160, above) });
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    // Items can be hidden at some widths (a responsive toolbar's overflow), so only visible ones take focus.
    const first = [...(panel.current?.querySelectorAll<HTMLElement>("input, [role^='menuitem']") ?? [])].find(visible);
    first?.focus();
    const outside = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close(false); };
    const away = () => close(false);
    document.addEventListener("mousedown", outside);
    window.addEventListener("resize", away);
    return () => { document.removeEventListener("mousedown", outside); window.removeEventListener("resize", away); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? [])].filter(visible);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
  };

  return (
    <>
      {button({ ref: (el) => { trigger.current = el; }, onClick: () => setOpen((v) => !v), "aria-haspopup": "menu", "aria-expanded": open, type: "button" }, open)}
      {open && (
        <div ref={panel} role="menu" aria-label={label} onKeyDown={onKey} style={pos}
          className="fixed z-[70] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-(--shadow-lift)">
          {children(close)}
        </div>
      )}
    </>
  );
}

/** One choice in a menu. `checked` makes it a radio or a checkbox item, announced as such. */
export function MenuItem({ children, onSelect, checked, kind = "radio", danger }: { children: ReactNode; onSelect: () => void; checked?: boolean; kind?: "radio" | "checkbox"; danger?: boolean }) {
  const role = checked === undefined ? "menuitem" : kind === "radio" ? "menuitemradio" : "menuitemcheckbox";
  return (
    <button type="button" role={role} aria-checked={checked} onClick={onSelect}
      className={cx("focus-ring flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-ink/5", danger ? "text-bad" : "text-ink")}>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      {checked && <Check size={15} aria-hidden className="shrink-0 text-accent" />}
    </button>
  );
}

