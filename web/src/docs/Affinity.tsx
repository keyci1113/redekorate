import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { uid } from "../lib/hooks";
import { cx } from "../components/ui";
import { AutoText, NOTE_BG, exStr, useDoc } from "./Sections";

export type NoteType = "obs" | "judgment" | "value";
export interface AParticipant { id: string; name: string; color: string }
export interface ANote { id: string; text: string; type: NoteType; participantId: string; groupId: string | null }
export interface AGroup { id: string; name: string }
export interface AffinityData { participants: AParticipant[]; notes: ANote[]; groups: AGroup[] }

export const P_COLORS = ["#EF4444", "#22C55E", "#3B82F6", "#D946EF", "#F59E0B", "#14B8A6", "#8B5CF6", "#64748B"];
const TYPE_BG: Record<NoteType, string> = { obs: NOTE_BG.yellow, judgment: NOTE_BG.blue, value: NOTE_BG.green };
const TYPE_LABEL: Record<NoteType, string> = { obs: "Observación", judgment: "Juicio", value: "Valor" };

export function Affinity({ data, set, ex }: { data: AffinityData; set: (d: AffinityData) => void; ex?: AffinityData }) {
  const { T, readOnly } = useDoc();
  const { participants = [], notes = [], groups = [] } = data;
  const [pid, setPid] = useState(participants[0]?.id ?? "");
  const [type, setType] = useState<NoteType>("obs");
  const [text, setText] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const upd = (p: Partial<AffinityData>) => set({ participants, notes, groups, ...p });
  const pc = (id: string) => participants.find((p) => p.id === id);
  // Nombre a mostrar: el escrito, o "Participante n" si aún está vacío
  const pName = (p: AParticipant) => p.name || `${T("Participante")} ${participants.indexOf(p) + 1}`;

  const addNote = () => {
    if (!text.trim()) return;
    upd({ notes: [...notes, { id: uid(), text: text.trim(), type, participantId: pid || participants[0]?.id || "", groupId: null }] });
    setText("");
  };
  const moveTo = (noteId: string, groupId: string | null) => upd({ notes: notes.map((n) => (n.id === noteId ? { ...n, groupId } : n)) });

  // Función (no componente) para no perder el foco al escribir
  const column = (id: string | null, name: string, editable?: boolean, gi = 0) => {
    const list = notes.filter((n) => n.groupId === id);
    const key = id ?? "__none";
    return (
      <div key={key} onDragOver={(e) => { if (!readOnly) { e.preventDefault(); setOver(key); } }} onDragLeave={() => setOver(null)}
        onDrop={(e) => { e.preventDefault(); setOver(null); const nid = e.dataTransfer.getData("text/note"); if (nid) moveTo(nid, id); }}
        className={cx("flex w-64 shrink-0 flex-col rounded-2xl border p-3 transition break-inside-avoid", over === key ? "border-accent bg-accent-soft/40" : id ? "border-line bg-surface" : "border-dashed border-line-2 bg-paper/60")}>
        <div className="mb-2 flex items-center gap-2">
          {editable && !readOnly ? <AutoText value={name} minRows={1} placeholder={exStr(ex, "groups", gi, "name") ?? T("Nombre del grupo / tema")} onChange={(v) => upd({ groups: groups.map((g) => (g.id === id ? { ...g, name: v } : g)) })}
            className="flex-1 !p-0 text-[14px] font-bold !leading-snug placeholder:font-normal hover:!border-transparent focus:!border-transparent focus:!bg-transparent" />
            : <p className="flex-1 text-[14px] font-bold">{name || T("Sin nombre")}</p>}
          <span className="rounded-full bg-ink/5 px-1.5 text-[11px] text-ink-2 tabular-nums">{list.length}</span>
          {editable && !readOnly && <button type="button" onClick={() => upd({ groups: groups.filter((g) => g.id !== id), notes: notes.map((n) => (n.groupId === id ? { ...n, groupId: null } : n)) })} className="text-ink-3 hover:text-bad print:hidden"><Trash2 size={13} /></button>}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          {list.map((n) => (
            <div key={n.id} draggable={!readOnly} onDragStart={(e) => e.dataTransfer.setData("text/note", n.id)}
              className={cx("group relative rounded-md p-2 pr-5 shadow-[0_2px_6px_rgba(31,22,51,.10)]", !readOnly && "cursor-grab active:cursor-grabbing")} style={{ background: TYPE_BG[n.type] }}>
              <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full" style={{ background: pc(n.participantId)?.color ?? "#999" }} title={pc(n.participantId) && pName(pc(n.participantId)!)} />
              {readOnly ? <p className="text-[13px] leading-snug text-[#2b2438]">{n.text}</p>
                : <AutoText value={n.text} minRows={1} onChange={(v) => upd({ notes: notes.map((x) => (x.id === n.id ? { ...x, text: v } : x)) })} className="!p-0 text-[13px] !leading-snug text-[#2b2438] hover:!border-transparent focus:!border-transparent focus:!bg-transparent" />}
              {!readOnly && <button type="button" onClick={() => upd({ notes: notes.filter((x) => x.id !== n.id) })} className="absolute right-1.5 bottom-1 text-[#2b2438]/50 opacity-0 group-hover:opacity-100 hover:text-bad print:hidden"><X size={11} /></button>}
            </div>
          ))}
          {!list.length && <p className="py-6 text-center text-[12px] text-ink-3">{readOnly ? "—" : T("Arrastra notas aquí")}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Leyenda y participantes */}
      <div className="flex flex-wrap items-start gap-6">
        <div>
          <p className="mb-2 text-[11px] font-bold tracking-wide text-ink-3 uppercase">{T("Tipos de nota")}</p>
          <div className="flex gap-2">
            {(Object.keys(TYPE_LABEL) as NoteType[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium" style={{ background: TYPE_BG[k] }}>{T(TYPE_LABEL[k])}</span>
            ))}
          </div>
        </div>
        <div className="min-w-64 flex-1">
          <p className="mb-2 text-[11px] font-bold tracking-wide text-ink-3 uppercase">{T("Participantes")}</p>
          <div className="flex flex-wrap gap-2">
            {participants.map((p, i) => (
              <span key={p.id} className="group flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-2 pl-1.5 text-[12px]">
                <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                {readOnly ? pName(p) : <input value={p.name} placeholder={exStr(ex, "participants", i, "name") ?? pName(p)} onChange={(e) => upd({ participants: participants.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) })} className="w-28 bg-transparent outline-none" />}
                {!readOnly && <button type="button" onClick={() => upd({ participants: participants.filter((x) => x.id !== p.id) })} className="text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad print:hidden"><X size={11} /></button>}
              </span>
            ))}
            {!readOnly && <button type="button" onClick={() => upd({ participants: [...participants, { id: uid(), name: "", color: P_COLORS[participants.length % P_COLORS.length] }] })}
              className="flex items-center gap-1 rounded-full border border-dashed border-line-2 px-2.5 py-1 text-[12px] text-ink-3 hover:border-accent hover:text-accent print:hidden"><Plus size={12} /> {T("Participante")}</button>}
          </div>
        </div>
      </div>

      {/* Agregar nota rápida */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper/60 p-2 print:hidden">
          <select className="field h-9 w-40 py-0" value={pid} onChange={(e) => setPid(e.target.value)} aria-label={T("Participante")}>
            {participants.map((p) => <option key={p.id} value={p.id}>{pName(p)}</option>)}
          </select>
          <select className="field h-9 w-36 py-0" value={type} onChange={(e) => setType(e.target.value as NoteType)} aria-label={T("Tipo de nota")}>
            {(Object.keys(TYPE_LABEL) as NoteType[]).map((k) => <option key={k} value={k}>{T(TYPE_LABEL[k])}</option>)}
          </select>
          <input className="field h-9 min-w-56 flex-1" placeholder={exStr(ex, "notes", 0, "text") ? `${T("Ej.:")} ${exStr(ex, "notes", 0, "text")}` : T("Escribe una nota y presiona Enter…")} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} />
          <button type="button" onClick={addNote} className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-white">{T("Agregar")}</button>
        </div>
      )}

      {/* Tablero */}
      <div className="flex gap-3 overflow-x-auto pb-2 print:flex-wrap">
        {column(null, T("Sin agrupar"))}
        {groups.map((g, i) => column(g.id, g.name, true, i))}
        {!readOnly && (
          <button type="button" onClick={() => upd({ groups: [...groups, { id: uid(), name: "" }] })}
            className="flex w-48 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-2 text-[13px] font-medium text-ink-3 hover:border-accent hover:text-accent print:hidden">
            <Plus size={18} /> {T("Nuevo grupo")}
          </button>
        )}
      </div>
    </div>
  );
}
