import { useRef, useState, type ReactNode } from "react";
import { GripVertical, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { uid } from "../lib/hooks";
import type { Option } from "../blocks/types";
import { cx } from "./ui";

import { t } from "../lib/i18n";
/** Zona para subir una imagen: arrastrar, pegar o elegir archivo. */
export function ImageDrop({ value, onChange, label = t("Subir imagen"), compact, hint, cover }: {
  value?: string | null; onChange: (url: string | null) => void; label?: string; compact?: boolean; hint?: string; cover?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") { setErr(t("Usa PNG, JPG, GIF o WEBP")); return; }
    setBusy(true); setErr(null);
    try { onChange(await api.upload(file)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (value) {
    return (
      <div className="group relative overflow-hidden rounded-lg border border-line bg-paper">
        <img src={value} alt="" className={cx("w-full", cover ? "aspect-square object-cover" : "object-contain", !cover && (compact ? "h-24" : "max-h-56"))} />
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition group-hover:opacity-100">
          <button type="button" onClick={() => input.current?.click()} className="rounded-md bg-surface px-2.5 py-1 text-xs font-medium">{t("Cambiar")}</button>
          <button type="button" onClick={() => onChange(null)} className="rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-bad">{t("Quitar")}</button>
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => send(e.target.files?.[0])} />
      </div>
    );
  }
  return (
    <div>
      <button type="button" onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files?.[0]); }}
        onPaste={(e) => send(e.clipboardData.files?.[0])}
        className={cx("focus-ring flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center transition",
          compact ? "h-20 px-2" : "h-32 px-4", over ? "border-accent bg-accent-soft" : "border-line-2 bg-paper/60 hover:border-accent hover:bg-accent-soft/50")}>
        {busy ? <Loader2 size={18} className="animate-spin text-accent" /> : <ImagePlus size={18} className="text-accent" />}
        <span className="text-[13px] font-medium text-ink-2">{busy ? t("Subiendo…") : label}</span>
        {!compact && <span className="text-[11px] text-ink-3">{hint ?? t("Arrastra, pega o haz clic · PNG, JPG, WEBP · máx. 10 MB")}</span>}
      </button>
      {err && <p className="mt-1 text-xs text-bad">{err}</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => send(e.target.files?.[0])} />
    </div>
  );
}

/** Lista reordenable por arrastre (HTML5 drag & drop nativo). */
export function useSortable<T>(items: T[], onChange: (items: T[]) => void) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const props = (i: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); },
    onDragOver: (e: React.DragEvent) => { if (drag === null) return; e.preventDefault(); setOver(i); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (drag !== null && drag !== i) { const n = [...items]; const [m] = n.splice(drag, 1); n.splice(i, 0, m); onChange(n); }
      setDrag(null); setOver(null);
    },
    onDragEnd: () => { setDrag(null); setOver(null); },
  });
  return { props, drag, over };
}

/** Editor de opciones: texto, reordenar arrastrando, imagen opcional, Enter para agregar. */
export function OptionsEditor({ label, items, onChange, withImages, placeholder = t("Opción"), min = 1, addLabel = t("Agregar opción"), bulk, marker }: {
  label: string; items: Option[]; onChange: (o: Option[]) => void; withImages?: boolean; placeholder?: string; min?: number;
  addLabel?: string; bulk?: boolean; marker?: ReactNode;
}) {
  const { props, drag, over } = useSortable(items, onChange);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const update = (id: string, p: Partial<Option>) => onChange(items.map((o) => (o.id === id ? { ...o, ...p } : o)));
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-2">{label} <span className="text-ink-3">· {items.length}</span></span>
        {bulk && <button type="button" onClick={() => { setBulkOpen(!bulkOpen); setBulkText(items.map((i) => i.label).join("\n")); }} className="text-xs font-medium text-accent">{bulkOpen ? t("Cerrar") : t("Pegar lista")}</button>}
      </div>
      {bulkOpen ? (
        <div className="space-y-2">
          <textarea className="field min-h-40 font-mono text-[13px]" value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={t("Una por línea")} />
          <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent" onClick={() => {
            const labels = bulkText.split("\n").map((s) => s.trim()).filter(Boolean);
            onChange(labels.map((l, i) => items.find((x) => x.label === l) ?? { id: items[i]?.label === l ? items[i].id : uid(), label: l }));
            setBulkOpen(false);
          }}>{t("Aplicar")} {bulkText.split("\n").filter((s) => s.trim()).length} {t("elementos")}</button>
        </div>
      ) : (
        <>
          {items.map((o, i) => (
            <div key={o.id} {...props(i)} className={cx("group rounded-lg transition", drag === i && "opacity-40", over === i && drag !== i && "ring-2 ring-accent/40")}>
              <div className="flex items-center gap-1.5">
                <GripVertical size={14} className="shrink-0 cursor-grab text-ink-3/60 active:cursor-grabbing" />
                {marker}
                <input ref={(el) => { inputs.current[o.id] = el; }} className="field py-1.5" value={o.label} placeholder={`${placeholder} ${i + 1}`}
                  onChange={(e) => update(o.id, { label: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const n = [...items]; const id = uid(); n.splice(i + 1, 0, { id, label: "" }); onChange(n);
                      setTimeout(() => inputs.current[id]?.focus(), 0);
                    }
                    if (e.key === "Backspace" && !o.label && items.length > min) {
                      e.preventDefault(); onChange(items.filter((x) => x.id !== o.id));
                      setTimeout(() => inputs.current[items[Math.max(0, i - 1)].id]?.focus(), 0);
                    }
                  }} />
                <button type="button" disabled={items.length <= min} onClick={() => onChange(items.filter((x) => x.id !== o.id))}
                  className="focus-ring shrink-0 rounded p-1 text-ink-3 opacity-0 transition group-hover:opacity-100 hover:text-bad disabled:hidden" aria-label={t("Eliminar")}>
                  <Trash2 size={14} />
                </button>
              </div>
              {withImages && (
                <div className="mt-1.5 mb-2 ml-5">
                  <ImageDrop compact value={o.image} onChange={(url) => update(o.id, { image: url ?? undefined })} label={t("Imagen del diseño")} />
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={() => { const id = uid(); onChange([...items, { id, label: "" }]); setTimeout(() => inputs.current[id]?.focus(), 0); }}
            className="focus-ring ml-5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-accent hover:bg-accent-soft">
            <Plus size={14} /> {addLabel}
          </button>
          {items.length > 3 && <p className="ml-5 text-[11px] text-ink-3">{t("Tip: Enter agrega otra · arrastra ⠿ para reordenar")}</p>}
        </>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1.5">
      <span>
        <span className="block text-sm text-ink-2">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx("focus-ring relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-line-2")}>
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; hint?: string }[] }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} title={o.hint}
          className={cx("focus-ring rounded-lg border px-2 py-2 text-[13px] font-medium transition", value === o.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:border-line-2")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tip({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-accent/15 bg-accent-soft/60 px-3 py-2.5 text-[13px] leading-relaxed text-accent-ink">{children}</div>;
}

export function RemoveX({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded p-0.5 text-ink-3 hover:text-bad"><X size={13} /></button>;
}
