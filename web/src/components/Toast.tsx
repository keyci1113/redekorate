// Short confirmations at the bottom of the screen ("Moved to In review" · Undo).
// Call toast() from anywhere; a <Toaster /> renders them. More than one Toaster may be mounted
// (a page can mount its own until the app mounts one globally): only the first one shows toasts.
import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { t } from "../lib/i18n";

export interface ToastAction { label: string; run: () => void }
export interface ToastItem { id: number; message: string; action?: ToastAction; duration: number }

let items: ToastItem[] = [];
let nextId = 1;
// Which mounted Toaster is in charge (the first one).
const owners: number[] = [];
let nextOwner = 1;
// The store's snapshot: replaced on every change, so every Toaster re-renders when the list or the owner changes.
let snapshot = { items, owner: 0 };
const listeners = new Set<() => void>();
const emit = () => { snapshot = { items, owner: owners[0] ?? 0 }; for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Shows a toast. Returns a function that dismisses it. */
export function toast(message: string, opts: { action?: ToastAction; duration?: number } = {}) {
  const item: ToastItem = { id: nextId++, message, action: opts.action, duration: opts.duration ?? (opts.action ? 8000 : 4000) };
  items = [...items.slice(-2), item];   // at most three at once
  emit();
  return () => dismiss(item.id);
}
export function dismiss(id: number) {
  if (!items.some((x) => x.id === id)) return;
  items = items.filter((x) => x.id !== id);
  emit();
}

export function Toaster() {
  const { items: list, owner } = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const [me] = useState(() => nextOwner++);
  useEffect(() => {
    owners.push(me); emit();
    return () => { owners.splice(owners.indexOf(me), 1); emit(); };
  }, [me]);
  if (owner !== me) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4">
      {list.map((x) => <ToastView key={x.id} item={x} />)}
    </div>
  );
}

function ToastView({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => dismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item, paused]);
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-ink py-2 pr-1.5 pl-4 text-sm text-paper shadow-(--shadow-lift)">
      <span className="min-w-0 flex-1">{item.message}</span>
      {item.action && (
        <button type="button" onClick={() => { item.action!.run(); dismiss(item.id); }} className="focus-ring min-h-9 shrink-0 rounded-lg px-2.5 font-semibold underline-offset-2 hover:underline">{item.action.label}</button>
      )}
      <button type="button" onClick={() => dismiss(item.id)} aria-label={t("Cerrar aviso")} className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg opacity-80 hover:opacity-100"><X size={15} /></button>
    </div>
  );
}
