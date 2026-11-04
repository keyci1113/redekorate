import { ArrowLeft, ArrowRight, Plus, Trash2, X } from "lucide-react";
import { uid } from "../lib/hooks";
import { cx } from "../components/ui";
import { AutoText, exStr, useDoc } from "./Sections";

export interface JAction { id: string; text: string; emotion: number }   // -2 (frustración) … +2 (satisfacción)
export interface JStage { id: string; name: string; actions: JAction[]; value: string; barriers: string; opportunities: string }
export interface JourneyData { stages: JStage[] }

const EMO = ["😡", "😟", "😐", "🙂", "😄"];
const EMO_KEYS = ["Frustración", "Molestia", "Neutral", "Contento", "Satisfacción"];

export function Journey({ data, set, ex }: { data: JourneyData; set: (d: JourneyData) => void; ex?: JourneyData }) {
  const { T, readOnly } = useDoc();
  const stages = data.stages ?? [];
  const setStage = (id: string, p: Partial<JStage>) => set({ stages: stages.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= stages.length) return; const n = [...stages]; [n[i], n[j]] = [n[j], n[i]]; set({ stages: n }); };
  const n = Math.max(stages.length, 1);
  // Puntos de la curva: cada acción en su etapa, distribuida a lo ancho de la columna
  const pts = stages.flatMap((s, si) => s.actions.map((a, ai) => ({
    a, x: ((si + (ai + 1) / (s.actions.length + 1)) / n) * 100, y: 50 - a.emotion * 21,
  })));
  const path = pts.length > 1 ? pts.map((p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const q = pts[i - 1], cx1 = q.x + (p.x - q.x) / 2;
    return `C ${cx1} ${q.y}, ${cx1} ${p.y}, ${p.x} ${p.y}`;
  }).join(" ") : "";
  const grid = { gridTemplateColumns: `110px repeat(${n}, minmax(210px, 1fr))` };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit">
        {/* Curva de emociones */}
        <div className="grid" style={grid}>
          <div className="flex flex-col justify-between py-2 pr-2 text-right text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            <span>{T("Satisfacción")}</span><span className="text-[10px] font-bold text-accent">{T("Emociones")}</span><span>{T("Frustración")}</span>
          </div>
          <div className="relative h-56 rounded-xl border border-line bg-gradient-to-b from-good-soft/60 via-surface to-bad-soft/60" style={{ gridColumn: `span ${n}` }}>
            {stages.slice(1).map((s, i) => <div key={s.id} className="absolute inset-y-0 border-l border-dashed border-line-2" style={{ left: `${((i + 1) / n) * 100}%` }} />)}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            </svg>
            {pts.map(({ a, x, y }) => (
              <div key={a.id} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${x}%`, top: `${y}%` }}>
                <span className="text-2xl leading-none drop-shadow-sm">{EMO[a.emotion + 2]}</span>
                {a.text && <span className="mt-0.5 max-w-[120px] truncate rounded bg-good-soft/90 px-1.5 py-0.5 text-[10px] font-medium text-ink shadow-sm">{a.text}</span>}
              </div>
            ))}
            {!pts.length && <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">{T("Agrega acciones en cada etapa y elige la emoción: la curva se dibuja sola.")}</p>}
          </div>
        </div>

        {/* Etapas */}
        <div className="mt-4 grid gap-y-3" style={grid}>
          <div />
          {stages.map((s, i) => (
            <div key={s.id} className="group px-1.5">
              <div className="flex items-center gap-1 rounded-xl bg-accent px-3 py-2.5 text-white">
                {readOnly ? <p className="flex-1 text-center font-bold">{s.name}</p>
                  : <AutoText value={s.name} minRows={1} onChange={(v) => setStage(s.id, { name: v })} placeholder={exStr(ex, "stages", i, "name") ?? T("Nombre de la etapa")}
                    className="flex-1 !p-0 text-center font-bold text-white placeholder:!text-white/70 hover:!border-transparent focus:!border-transparent focus:!bg-transparent" />}
                {!readOnly && (
                  <span className="flex opacity-0 group-hover:opacity-100 print:hidden">
                    <button type="button" onClick={() => move(i, -1)} className="p-0.5" aria-label={T("Mover a la izquierda")}><ArrowLeft size={13} /></button>
                    <button type="button" onClick={() => move(i, 1)} className="p-0.5" aria-label={T("Mover a la derecha")}><ArrowRight size={13} /></button>
                    <button type="button" onClick={() => set({ stages: stages.filter((x) => x.id !== s.id) })} className="p-0.5" aria-label={T("Eliminar")}><Trash2 size={13} /></button>
                  </span>
                )}
              </div>
            </div>
          ))}

          <RowLabel text={T("Acciones y actividades")} />
          {stages.map((s, si) => (
            <div key={s.id} className="space-y-1.5 px-1.5">
              {s.actions.map((a, ai) => (
                <div key={a.id} className="group rounded-lg border border-line bg-surface p-2">
                  {readOnly ? <p className="text-[13px]">{EMO[a.emotion + 2]} {a.text}</p> : <>
                    <div className="flex items-start gap-1">
                      <AutoText value={a.text} minRows={1} placeholder={exStr(ex, "stages", si, "actions", ai, "text") ?? T("¿Qué hace el usuario?")} className="!px-1 !py-0.5 text-[13px]"
                        onChange={(v) => setStage(s.id, { actions: s.actions.map((x) => (x.id === a.id ? { ...x, text: v } : x)) })} />
                      <button type="button" onClick={() => setStage(s.id, { actions: s.actions.filter((x) => x.id !== a.id) })} className="mt-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad print:hidden"><X size={12} /></button>
                    </div>
                    <div className="mt-1 flex justify-between px-1 print:hidden">
                      {EMO.map((e, k) => (
                        <button key={k} type="button" title={T(EMO_KEYS[k])} onClick={() => setStage(s.id, { actions: s.actions.map((x) => (x.id === a.id ? { ...x, emotion: k - 2 } : x)) })}
                          className={cx("rounded-md px-1 text-base transition", a.emotion === k - 2 ? "bg-accent-soft ring-1 ring-accent" : "opacity-40 grayscale hover:opacity-100 hover:grayscale-0")}>{e}</button>
                      ))}
                    </div>
                  </>}
                </div>
              ))}
              {!readOnly && <button type="button" onClick={() => setStage(s.id, { actions: [...s.actions, { id: uid(), text: "", emotion: 0 }] })} className="flex items-center gap-1 px-1 text-[12px] font-medium text-accent print:hidden"><Plus size={12} /> {T("Acción")}</button>}
            </div>
          ))}

          {(["value", "barriers", "opportunities"] as const).map((k) => (
            <Row key={k} label={T(k === "value" ? "Valor" : k === "barriers" ? "Barreras" : "Oportunidades")}
              hint={T(k === "value" ? "¿Qué espera o valora el usuario aquí?" : k === "barriers" ? "¿Qué le impide avanzar o le molesta?" : "¿Cómo podríamos mejorar esta etapa?")}
              stages={stages} field={k} setStage={setStage} ex={ex} />
          ))}
        </div>
        {!readOnly && (
          <button type="button" onClick={() => set({ stages: [...stages, { id: uid(), name: "", actions: [{ id: uid(), text: "", emotion: 0 }], value: "", barriers: "", opportunities: "" }] })}
            className="mt-4 ml-[110px] flex items-center gap-1.5 rounded-lg border-2 border-dashed border-line-2 px-4 py-2 text-[13px] font-medium text-ink-3 hover:border-accent hover:text-accent print:hidden">
            <Plus size={14} /> {T("Agregar etapa")}
          </button>
        )}
      </div>
    </div>
  );
}

function RowLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="pt-1 pr-2 text-right">
      <p className="text-[11px] font-bold tracking-wide text-ink-2 uppercase">{text}</p>
      {hint && <p className="mt-0.5 text-[10px] leading-tight text-ink-3">{hint}</p>}
    </div>
  );
}

function Row({ label, hint, stages, field, setStage, ex }: { label: string; hint: string; stages: JStage[]; field: "value" | "barriers" | "opportunities"; setStage: (id: string, p: Partial<JStage>) => void; ex?: JourneyData }) {
  const { T, readOnly } = useDoc();
  const tone = field === "value" ? "border-t-good" : field === "barriers" ? "border-t-bad" : "border-t-accent";
  return <>
    <RowLabel text={label} hint={hint} />
    {stages.map((s, si) => (
      <div key={s.id} className="px-1.5">
        <div className={cx("h-full min-h-24 rounded-lg border border-line border-t-4 bg-surface p-1", tone)}>
          {readOnly ? <p className="p-1.5 text-[13px] whitespace-pre-line">{s[field] || "—"}</p>
            : <AutoText value={s[field]} minRows={3} placeholder={exStr(ex, "stages", si, field) ?? T("Escribe aquí…")} onChange={(v) => setStage(s.id, { [field]: v })} className="text-[13px]" />}
        </div>
      </div>
    ))}
  </>;
}
