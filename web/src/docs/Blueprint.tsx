import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { uid } from "../lib/hooks";
import { cx } from "../components/ui";
import { AutoText, exStr, useDoc } from "./Sections";

export interface BStage { id: string; name: string; evidence: string; customer: string; frontstage: string; backstage: string; support: string }
export interface BlueprintData { stages: BStage[] }

const LANES = ["evidence", "customer", "frontstage", "backstage", "support"] as const;
type Lane = (typeof LANES)[number];
const LANE_LABEL: Record<Lane, string> = {
  evidence: "Evidencia física", customer: "Acciones del cliente", frontstage: "Frontstage (visible)", backstage: "Backstage (no visible)", support: "Procesos de soporte",
};
const LANE_HINT: Record<Lane, string> = {
  evidence: "Qué ve o toca el cliente: pantallas, recibos, espacios físicos.",
  customer: "Qué hace el cliente en esta etapa.",
  frontstage: "Qué hace el personal o sistema que el cliente sí ve.",
  backstage: "Qué hace el personal o sistema que el cliente no ve.",
  support: "Qué procesos internos hacen posible esta etapa (logística, operaciones, proveedores).",
};
// Línea divisoria que va DESPUÉS de este carril (línea de interacción, de visibilidad…)
const LANE_DIVIDER: Partial<Record<Lane, string>> = { customer: "Línea de interacción", frontstage: "Línea de visibilidad", backstage: "Línea de interacción interna" };
const LANE_TONE: Record<Lane, string> = { evidence: "border-t-ink-2", customer: "border-t-accent", frontstage: "border-t-good", backstage: "border-t-accent", support: "border-t-ink-3" };

export function Blueprint({ data, set, ex }: { data: BlueprintData; set: (d: BlueprintData) => void; ex?: BlueprintData }) {
  const { T, readOnly } = useDoc();
  const stages = data.stages ?? [];
  const setStage = (id: string, p: Partial<BStage>) => set({ stages: stages.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= stages.length) return; const n = [...stages]; [n[i], n[j]] = [n[j], n[i]]; set({ stages: n }); };
  const n = Math.max(stages.length, 1);
  const grid = { gridTemplateColumns: `150px repeat(${n}, minmax(200px, 1fr))` };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit">
        <div className="grid gap-y-0.5" style={grid}>
          <div />
          {stages.map((s, i) => (
            <div key={s.id} className="group px-1.5">
              <div className="flex items-center gap-1 rounded-xl bg-accent px-3 py-2.5 text-on-accent">
                {readOnly ? <p className="flex-1 text-center font-bold">{s.name}</p>
                  : <AutoText value={s.name} minRows={1} onChange={(v) => setStage(s.id, { name: v })} placeholder={exStr(ex, "stages", i, "name") ?? T("Nombre de la etapa")}
                    className="flex-1 !p-0 text-center font-bold text-on-accent placeholder:!text-on-accent/70 hover:!border-transparent focus:!border-transparent focus:!bg-transparent" />}
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

          {LANES.map((lane) => (
            <Row key={lane} lane={lane} stages={stages} setStage={setStage} ex={ex} />
          ))}
        </div>
        {!readOnly && (
          <button type="button" onClick={() => set({ stages: [...stages, { id: uid(), name: "", evidence: "", customer: "", frontstage: "", backstage: "", support: "" }] })}
            className="mt-3 ml-[150px] flex items-center gap-1.5 rounded-lg border-2 border-dashed border-line-2 px-4 py-2 text-[13px] font-medium text-ink-3 hover:border-accent hover:text-accent print:hidden">
            <Plus size={14} /> {T("Agregar etapa")}
          </button>
        )}
      </div>
    </div>
  );
}

function RowLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="pt-2 pr-2 pb-1 text-right">
      <p className="text-[11px] font-bold tracking-wide text-ink-2 uppercase">{text}</p>
      {hint && <p className="mt-0.5 text-[10px] leading-tight text-ink-3">{hint}</p>}
    </div>
  );
}

function Row({ lane, stages, setStage, ex }: { lane: Lane; stages: BStage[]; setStage: (id: string, p: Partial<BStage>) => void; ex?: BlueprintData }) {
  const { T, readOnly } = useDoc();
  const divider = LANE_DIVIDER[lane];
  return (
    <>
      <RowLabel text={T(LANE_LABEL[lane])} hint={T(LANE_HINT[lane])} />
      {stages.map((s, si) => (
        <div key={s.id} className="px-1.5">
          <div className={cx("h-full min-h-20 rounded-lg border border-line border-t-4 bg-surface p-1", LANE_TONE[lane])}>
            {readOnly ? <p className="p-1.5 text-[13px] whitespace-pre-line">{s[lane] || "—"}</p>
              : <AutoText value={s[lane]} minRows={2} placeholder={exStr(ex, "stages", si, lane) ?? T("Escribe aquí…")} onChange={(v) => setStage(s.id, { [lane]: v })} className="text-[13px]" />}
          </div>
        </div>
      ))}
      {divider && (
        <div className="col-span-full my-1.5 flex items-center gap-2 text-[10px] font-semibold tracking-wide text-ink-3 uppercase print:hidden" style={{ gridColumn: `1 / -1` }}>
          <span className="h-px flex-1 border-t border-dashed border-line-2" /> {T(divider)} <span className="h-px flex-1 border-t border-dashed border-line-2" />
        </div>
      )}
    </>
  );
}
