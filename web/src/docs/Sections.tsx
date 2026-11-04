import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import type { Bar, DocData, Entry, Note, NoteColor, Row, RowGroup, Section } from "./types";
import { tr, type Lang } from "../lib/i18n";
import { uid } from "../lib/hooks";
import { ImageDrop } from "../components/editing";
import { cx } from "../components/ui";

// Contexto del documento: idioma del documento (no el de la interfaz) y modo lectura
// `ex` = valores de ejemplo de la plantilla: nunca se guardan, solo se muestran como texto guía (placeholder).
interface DocCtxT { lang: Lang; T: (k: string, v?: Record<string, string | number>) => string; readOnly: boolean; ex: DocData }
export const DocCtx = createContext<DocCtxT>({ lang: "es", T: (k) => k, readOnly: false, ex: {} });
export const useDoc = () => useContext(DocCtx);
export const makeCtx = (lang: Lang, readOnly: boolean, ex: DocData = {}): DocCtxT => ({ lang, readOnly, ex, T: (k, v) => tr(k, lang, v) });

/** Lee un valor de ejemplo por posición: exAt(ex, "stages", 0, "name") */
export function exAt(v: unknown, ...path: (string | number)[]): unknown {
  let cur = v;
  for (const k of path) { if (cur == null || typeof cur !== "object") return undefined; cur = (cur as Record<string | number, unknown>)[k]; }
  return cur;
}
export const exStr = (v: unknown, ...path: (string | number)[]) => { const x = exAt(v, ...path); return typeof x === "string" && x.trim() ? x : undefined; };

export const NOTE_BG: Record<NoteColor, string> = {
  yellow: "#FEF3C7", orange: "#FFE4CC", blue: "#DBEAFE", pink: "#FCE7F3", green: "#DCFCE7", purple: "#EDE9FE",
};

/** Textarea que crece con el contenido */
export function AutoText({ value, onChange, placeholder, className, minRows = 2 }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto";
    // Si está vacío, mide el texto guía para que el ejemplo se lea completo
    if (!value && placeholder) { el.value = placeholder; const h = el.scrollHeight; el.value = ""; el.style.height = `${h + 2}px`; }
    else el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, placeholder]);
  return <textarea ref={ref} rows={minRows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
    className={cx("w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[14px] leading-relaxed outline-none transition placeholder:text-ink-3/70 hover:border-line focus:border-accent focus:bg-surface", className)} />;
}

export function SectionCard({ section, children, tone }: { section: Section; children: ReactNode; tone?: string }) {
  const { T } = useDoc();
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface p-4 break-inside-avoid print:border-ink/20" style={tone ? { borderTop: `4px solid ${tone}` } : undefined}>
      {section.title && <h3 className="text-[13px] font-bold tracking-wide text-accent uppercase">{T(section.title)}</h3>}
      {section.prompt && <p className="mt-1 text-[12px] leading-snug text-ink-3 italic">{T(section.prompt)}</p>}
      <div className="mt-3 flex-1">{children}</div>
    </section>
  );
}

type SetFn = (v: unknown) => void;

export function SectionBody({ section, value, set }: { section: Section; value: unknown; set: SetFn }) {
  const ex = exAt(useDoc().ex, section.id);
  switch (section.type) {
    case "text": return <TextBody value={(value as string) ?? ""} set={set} placeholder={section.placeholder} rows={section.rows} ex={typeof ex === "string" ? ex : undefined} />;
    case "list": return <ListBody items={(value as string[]) ?? []} set={set} placeholder={section.placeholder} numbered={section.numbered} ex={(ex as string[]) ?? []} />;
    case "notes": return <NotesBody notes={(value as Note[]) ?? []} set={set} color={section.color} placeholder={section.placeholder} ex={(ex as Note[]) ?? []} />;
    case "fields": return <FieldsBody section={section} value={(value as Record<string, string>) ?? {}} set={set} ex={(ex as Record<string, string>) ?? {}} />;
    case "chips": return <ChipsBody chips={(value as string[]) ?? []} set={set} placeholder={section.placeholder} ex={(ex as string[]) ?? []} />;
    case "bars": return <BarsBody bars={(value as Bar[]) ?? []} set={set} placeholder={section.placeholder} ex={(ex as Bar[]) ?? []} />;
    case "image": return <ImageBody url={value as string | undefined} set={set} round={section.round} />;
    case "gallery": return <GalleryBody items={(value as { id: string; url: string; caption: string }[]) ?? []} set={set} />;
    case "rowgroups": return <RowGroupsBody groups={(value as RowGroup[]) ?? []} set={set} addGroups={section.addGroups} ex={(ex as RowGroup[]) ?? []} />;
    case "entries": return <EntriesBody entries={(value as Entry[]) ?? []} set={set} nameLabel={section.nameLabel} bodyLabel={section.bodyLabel} addLabel={section.addLabel} ex={(ex as Entry[]) ?? []} />;
    default: return null;
  }
}

function TextBody({ value, set, placeholder, rows, ex }: { value: string; set: SetFn; placeholder?: string; rows?: number; ex?: string }) {
  const { T, readOnly } = useDoc();
  if (readOnly) return <p className="text-[14px] leading-relaxed whitespace-pre-line">{value || <span className="text-ink-3">—</span>}</p>;
  return <>
    <AutoText value={value} onChange={set} placeholder={ex ?? (placeholder ? T(placeholder) : T("Escribe aquí…"))} minRows={rows ?? 3} />
    {/* Textos largos de ejemplo (guiones, presentaciones): se pueden usar como base con un clic */}
    {!value && ex && ex.length > 140 && <button type="button" onClick={() => set(ex)} className="mt-1 text-[12px] font-medium text-accent hover:underline print:hidden">{T("Usar este texto como base")}</button>}
  </>;
}

function ListBody({ items, set, placeholder, numbered, ex }: { items: string[]; set: SetFn; placeholder?: string; numbered?: boolean; ex: string[] }) {
  const { T, readOnly } = useDoc();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const list = items.length ? items : readOnly ? [] : Array<string>(Math.max(1, ex.length)).fill("");
  if (readOnly) {
    if (!items.filter(Boolean).length) return <p className="text-sm text-ink-3">—</p>;
    const Tag = numbered ? "ol" : "ul";
    return <Tag className={cx("space-y-1 pl-5 text-[14px] leading-relaxed", numbered ? "list-decimal" : "list-disc")}>{items.filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</Tag>;
  }
  const upd = (i: number, v: string) => { const n = [...list]; n[i] = v; set(n); };
  return (
    <ul className="space-y-0.5">
      {list.map((x, i) => (
        <li key={i} className="group flex items-center gap-2">
          <span className="w-4 shrink-0 text-right text-[12px] text-accent">{numbered ? `${i + 1}.` : "•"}</span>
          <input ref={(el) => { refs.current[i] = el; }} value={x} placeholder={ex[i] ?? (i === 0 ? (placeholder ? T(placeholder) : T("Escribe y presiona Enter…")) : "")}
            onChange={(e) => upd(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); const n = [...list]; n.splice(i + 1, 0, ""); set(n); setTimeout(() => refs.current[i + 1]?.focus(), 0); }
              if (e.key === "Backspace" && !x && list.length > 1) { e.preventDefault(); set(list.filter((_, k) => k !== i)); setTimeout(() => refs.current[Math.max(0, i - 1)]?.focus(), 0); }
            }}
            className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[14px] outline-none hover:border-line focus:border-accent focus:bg-surface" />
          <button type="button" onClick={() => set(list.filter((_, k) => k !== i))} className="rounded p-0.5 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad print:hidden" aria-label={T("Eliminar")}><X size={13} /></button>
        </li>
      ))}
    </ul>
  );
}

function NotesBody({ notes: saved, set, color, placeholder, ex }: { notes: Note[]; set: SetFn; color: NoteColor; placeholder?: string; ex: Note[] }) {
  const { T, readOnly } = useDoc();
  // Sin notas guardadas: muestra notas vacías con el ejemplo como guía
  const notes = saved.length || readOnly ? saved : ex.map((n) => ({ id: n.id, text: "" }));
  const upd = (id: string, text: string) => set(notes.map((n) => (n.id === id ? { ...n, text } : n)));
  return (
    <div className="flex flex-wrap gap-2.5">
      {notes.map((n, i) => (
        <div key={n.id} className="group relative w-[calc(50%-5px)] min-w-[120px] rounded-md p-2.5 shadow-[0_2px_6px_rgba(31,22,51,.10)] sm:w-[148px]" style={{ background: NOTE_BG[color] }}>
          {readOnly ? <p className="text-[13px] leading-snug whitespace-pre-line text-[#2b2438]">{n.text}</p>
            : <AutoText value={n.text} onChange={(v) => upd(n.id, v)} placeholder={ex[i]?.text || (placeholder ? T(placeholder) : T("Escribe una idea…"))} className="!px-0 !py-0 text-[13px] !leading-snug text-[#2b2438] hover:!border-transparent focus:!border-transparent focus:!bg-transparent" minRows={3} />}
          {!readOnly && <button type="button" onClick={() => set(notes.filter((x) => x.id !== n.id))} className="absolute top-1 right-1 rounded p-0.5 text-[#2b2438]/50 opacity-0 group-hover:opacity-100 hover:text-bad print:hidden" aria-label={T("Eliminar")}><X size={12} /></button>}
        </div>
      ))}
      {!readOnly && (
        <button type="button" onClick={() => set([...notes, { id: uid(), text: "" }])}
          className="flex h-[88px] w-[calc(50%-5px)] min-w-[120px] flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line-2 text-[12px] font-medium text-ink-3 transition hover:border-accent hover:text-accent sm:w-[148px] print:hidden">
          <Plus size={16} /> {T("Agregar nota")}
        </button>
      )}
      {readOnly && !notes.length && <p className="text-sm text-ink-3">—</p>}
    </div>
  );
}

function FieldsBody({ section, value, set, ex }: { section: Extract<Section, { type: "fields" }>; value: Record<string, string>; set: SetFn; ex: Record<string, string> }) {
  const { T, readOnly } = useDoc();
  return (
    <div className={cx("grid gap-x-4 gap-y-3", section.cols === 3 ? "sm:grid-cols-3" : section.cols === 1 ? "" : "sm:grid-cols-2")}>
      {section.fields.map((f) => (
        <label key={f.id} className="block">
          <span className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{T(f.label)}</span>
          {readOnly ? <p className="mt-0.5 text-[14px]">{value[f.id] || "—"}</p>
            : <input value={value[f.id] ?? ""} placeholder={ex[f.id] || (f.placeholder ? T(f.placeholder) : "…")} onChange={(e) => set({ ...value, [f.id]: e.target.value })}
              className="mt-0.5 w-full border-b border-dotted border-line-2 bg-transparent py-1 text-[14px] outline-none focus:border-accent" />}
        </label>
      ))}
    </div>
  );
}

function ChipsBody({ chips, set, placeholder, ex }: { chips: string[]; set: SetFn; placeholder?: string; ex: string[] }) {
  const { T, readOnly } = useDoc();
  const tones = ["bg-accent-soft text-accent-ink", "bg-[#FFE4CC] text-[#7c3d0a]", "bg-[#DBEAFE] text-[#1e3a8a]", "bg-[#DCFCE7] text-[#14532d]"];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <span key={i} className={cx("group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold", tones[i % tones.length])}>
          {c}{!readOnly && <button type="button" onClick={() => set(chips.filter((_, k) => k !== i))} className="opacity-50 hover:opacity-100 print:hidden" aria-label={T("Eliminar")}><X size={11} /></button>}
        </span>
      ))}
      {!readOnly && (
        <input placeholder={!chips.length && ex.length ? `${ex.join(", ")} · Enter` : placeholder ? T(placeholder) : T("Escribe y presiona Enter")}
          onKeyDown={(e) => { const v = e.currentTarget.value.trim(); if (e.key === "Enter" && v) { e.preventDefault(); set([...chips, v]); e.currentTarget.value = ""; } }}
          className="min-w-32 flex-1 rounded-full border border-dashed border-line-2 bg-transparent px-3 py-1 text-[12px] outline-none focus:border-accent print:hidden" />
      )}
      {readOnly && !chips.length && <p className="text-sm text-ink-3">—</p>}
    </div>
  );
}

function BarsBody({ bars: saved, set, placeholder, ex }: { bars: Bar[]; set: SetFn; placeholder?: string; ex: Bar[] }) {
  const { T, readOnly } = useDoc();
  const bars = saved.length || readOnly ? saved : ex.map((b) => ({ id: b.id, label: "", value: 50 }));
  const upd = (id: string, p: Partial<Bar>) => set(bars.map((b) => (b.id === id ? { ...b, ...p } : b)));
  return (
    <div className="space-y-3">
      {bars.map((b, i) => (
        <div key={b.id} className="group">
          <div className="mb-1 flex items-center gap-2">
            {readOnly ? <span className="flex-1 text-[12px] font-semibold tracking-wide uppercase">{b.label}</span>
              : <input value={b.label} placeholder={ex[i]?.label || (placeholder ? T(placeholder) : T("Habilidad"))} onChange={(e) => upd(b.id, { label: e.target.value })} className="flex-1 bg-transparent text-[12px] font-semibold tracking-wide uppercase outline-none" />}
            <span className="text-[11px] text-ink-3 tabular-nums">{b.value}%</span>
            {!readOnly && <button type="button" onClick={() => set(bars.filter((x) => x.id !== b.id))} className="text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad print:hidden"><X size={12} /></button>}
          </div>
          <div className="relative h-3 rounded-sm bg-ink/[0.07]">
            <div className="absolute inset-y-0 left-0 rounded-sm bg-accent" style={{ width: `${b.value}%` }} />
            {!readOnly && <input type="range" min={0} max={100} step={5} value={b.value} onChange={(e) => upd(b.id, { value: +e.target.value })} className="absolute inset-0 w-full cursor-pointer opacity-0" aria-label={b.label} />}
          </div>
        </div>
      ))}
      {!readOnly && <button type="button" onClick={() => set([...bars, { id: uid(), label: "", value: 50 }])} className="flex items-center gap-1 text-[12px] font-medium text-accent print:hidden"><Plus size={13} /> {T("Agregar")}</button>}
    </div>
  );
}

function ImageBody({ url, set, round }: { url?: string; set: SetFn; round?: boolean }) {
  const { T, readOnly } = useDoc();
  if (readOnly || url) return url ? <img src={url} alt="" className={cx("w-full object-cover", round ? "aspect-square rounded-2xl" : "rounded-lg")} />
    : <div className="flex aspect-square items-center justify-center rounded-2xl bg-paper text-ink-3">—</div>;
  return <ImageDrop value={url} onChange={(u) => set(u ?? undefined)} label={T("Subir foto")} hint={T("Foto o ilustración representativa")} />;
}

function GalleryBody({ items, set }: { items: { id: string; url: string; caption: string }[]; set: SetFn }) {
  const { T, readOnly } = useDoc();
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <figure key={it.id} className="group relative">
          <img src={it.url} alt={it.caption} className="aspect-[4/3] w-full rounded-lg border border-line object-cover" />
          {readOnly ? <figcaption className="mt-1 text-[12px] text-ink-2">{it.caption}</figcaption>
            : <input value={it.caption} placeholder={T("Descripción…")} onChange={(e) => set(items.map((x) => (x.id === it.id ? { ...x, caption: e.target.value } : x)))} className="mt-1 w-full bg-transparent text-[12px] outline-none" />}
          {!readOnly && <button type="button" onClick={() => set(items.filter((x) => x.id !== it.id))} className="absolute top-1.5 right-1.5 rounded bg-white/90 p-1 text-bad opacity-0 group-hover:opacity-100 print:hidden"><Trash2 size={12} /></button>}
        </figure>
      ))}
      {!readOnly && <div className="print:hidden"><ImageDrop compact value={null} onChange={(u) => u && set([...items, { id: uid(), url: u, caption: "" }])} label={T("Agregar foto")} /></div>}
    </div>
  );
}

function RowGroupsBody({ groups, set, addGroups, ex }: { groups: RowGroup[]; set: SetFn; addGroups?: boolean; ex: RowGroup[] }) {
  const { T, readOnly } = useDoc();
  const updG = (gid: string, p: Partial<RowGroup>) => set(groups.map((g) => (g.id === gid ? { ...g, ...p } : g)));
  const updR = (g: RowGroup, rid: string, p: Partial<Row>) => updG(g.id, { rows: g.rows.map((r) => (r.id === rid ? { ...r, ...p } : r)) });
  return (
    <div className="space-y-4">
      {groups.map((g, gi) => (
        <div key={g.id} className="overflow-hidden rounded-xl border border-line break-inside-avoid">
          <div className="flex items-center gap-3 bg-accent-soft/60 px-3 py-2">
            {g.letter && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-base font-bold text-white">{g.letter}</span>}
            {readOnly ? <p className="font-semibold">{g.title}</p>
              : <input value={g.title} onChange={(e) => updG(g.id, { title: e.target.value })} className="flex-1 bg-transparent font-semibold outline-none" />}
            {!readOnly && addGroups && <button type="button" onClick={() => set(groups.filter((x) => x.id !== g.id))} className="text-ink-3 hover:text-bad print:hidden" aria-label={T("Eliminar")}><Trash2 size={14} /></button>}
          </div>
          <table className="w-full text-[13px]">
            <thead className="sr-only"><tr><th>{T("¿Qué observar?")}</th><th>{T("Anotaciones")}</th></tr></thead>
            <tbody>
              {g.rows.map((r, ri) => (
                <tr key={r.id} className="group border-t border-line align-top">
                  <td className="w-[38%] p-2">
                    {readOnly ? <span className="font-medium text-ink-2">{r.label}</span>
                      : <input value={r.label} onChange={(e) => updR(g, r.id, { label: e.target.value })} className="w-full bg-transparent font-medium text-ink-2 outline-none" />}
                    {r.kind === "yesno" && (
                      <div className="mt-1.5 flex gap-1">
                        {[true, false].map((v) => (
                          <button key={String(v)} type="button" disabled={readOnly} onClick={() => updR(g, r.id, { yes: r.yes === v ? null : v })}
                            className={cx("flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold", r.yes === v ? (v ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad") : "border-line text-ink-3")}>
                            {r.yes === v && <Check size={10} />}{v ? T("Sí") : T("No")}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-1">
                    {readOnly ? <p className="px-1 py-1 whitespace-pre-line">{r.answer || <span className="text-ink-3">—</span>}</p>
                      : <AutoText value={r.answer ?? ""} onChange={(v) => updR(g, r.id, { answer: v })} placeholder={exStr(ex, gi, "rows", ri, "answer") ?? T("Anotaciones…")} minRows={1} className="text-[13px]" />}
                  </td>
                  {!readOnly && <td className="w-6 p-1 print:hidden"><button type="button" onClick={() => updG(g.id, { rows: g.rows.filter((x) => x.id !== r.id) })} className="mt-1.5 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad"><X size={13} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly && (
            <div className="flex gap-3 border-t border-line px-3 py-1.5 print:hidden">
              <button type="button" onClick={() => updG(g.id, { rows: [...g.rows, { id: uid(), label: "", kind: "text" }] })} className="flex items-center gap-1 text-[12px] font-medium text-accent"><Plus size={12} /> {T("Pregunta")}</button>
              <button type="button" onClick={() => updG(g.id, { rows: [...g.rows, { id: uid(), label: "", kind: "yesno", yes: null }] })} className="flex items-center gap-1 text-[12px] font-medium text-accent"><Plus size={12} /> {T("Sí / No")}</button>
            </div>
          )}
        </div>
      ))}
      {!readOnly && addGroups && (
        <button type="button" onClick={() => set([...groups, { id: uid(), title: T("Nueva fase"), rows: [{ id: uid(), label: "", kind: "text" }] }])}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-2 py-2.5 text-[13px] font-medium text-ink-3 hover:border-accent hover:text-accent print:hidden">
          <Plus size={14} /> {T("Agregar fase")}
        </button>
      )}
    </div>
  );
}

function EntriesBody({ entries: saved, set, nameLabel, bodyLabel, addLabel, ex }: { entries: Entry[]; set: SetFn; nameLabel: string; bodyLabel: string; addLabel: string; ex: Entry[] }) {
  const { T, readOnly } = useDoc();
  const entries = saved.length || readOnly ? saved : ex.map((e) => ({ id: e.id, name: "", body: "" }));
  const upd = (id: string, p: Partial<Entry>) => set(entries.map((e) => (e.id === id ? { ...e, ...p } : e)));
  return (
    <div className="space-y-3">
      {entries.map((e, i) => (
        <div key={e.id} className="group rounded-xl border border-line p-3 break-inside-avoid">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-white">{i + 1}</span>
            {readOnly ? <p className="font-semibold">{e.name}</p>
              : <input value={e.name} placeholder={ex[i]?.name || T(nameLabel)} onChange={(ev) => upd(e.id, { name: ev.target.value })} className="flex-1 bg-transparent font-semibold outline-none placeholder:font-normal placeholder:text-ink-3" />}
            {!readOnly && <button type="button" onClick={() => set(entries.filter((x) => x.id !== e.id))} className="text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad print:hidden"><Trash2 size={13} /></button>}
          </div>
          {readOnly ? <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-line">{e.body || "—"}</p>
            : <AutoText value={e.body} onChange={(v) => upd(e.id, { body: v })} placeholder={ex[i]?.body || T(bodyLabel)} minRows={2} className="mt-1" />}
        </div>
      ))}
      {!readOnly && <button type="button" onClick={() => set([...entries, { id: uid(), name: "", body: "" }])} className="flex items-center gap-1.5 text-[13px] font-medium text-accent print:hidden"><Plus size={14} /> {T(addLabel)}</button>}
    </div>
  );
}
