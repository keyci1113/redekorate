import { ArrowLeft, ArrowRight, Link2, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { uid } from "../lib/hooks";
import { cx } from "../components/ui";
import { AutoText, exStr, useDoc } from "./Sections";
import { LANES, LANE_LABEL, cellKey, linkPath, liveLinks, removeStage, toggleLink, type BStage, type BlueprintData, type Box, type Cell, type Lane } from "./blueprintModel";

export type { BStage, BlueprintData } from "./blueprintModel";

const LANE_HINT: Record<Lane, string> = {
  evidence: "Qué ve o toca el cliente: pantallas, recibos, espacios físicos.",
  customer: "Qué hace el cliente en esta etapa.",
  frontstage: "Qué hace el personal o sistema que el cliente sí ve.",
  backstage: "Qué hace el personal o sistema que el cliente no ve.",
  support: "Qué procesos internos hacen posible esta etapa (logística, operaciones, proveedores).",
};
// The dividing line drawn AFTER this lane (line of interaction, of visibility…)
const LANE_DIVIDER: Partial<Record<Lane, string>> = { customer: "Línea de interacción", frontstage: "Línea de visibilidad", backstage: "Línea de interacción interna" };
const LANE_TONE: Record<Lane, string> = { evidence: "border-t-ink-2", customer: "border-t-accent", frontstage: "border-t-good", backstage: "border-t-accent", support: "border-t-ink-3" };
/** Horizontal space between two stage columns (px-3 on each side); elbow links turn in the middle of it. */
const GAP = 24;

export function Blueprint({ data, set, ex }: { data: BlueprintData; set: (d: BlueprintData) => void; ex?: BlueprintData }) {
  const { T, readOnly } = useDoc();
  const stages = data.stages ?? [];
  const links = liveLinks({ stages, links: data.links });
  const setStage = (id: string, p: Partial<BStage>) => set({ ...data, stages: stages.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= stages.length) return; const n = [...stages]; [n[i], n[j]] = [n[j], n[i]]; set({ ...data, stages: n }); };
  const n = Math.max(stages.length, 1);
  const grid = { gridTemplateColumns: `150px repeat(${n}, minmax(200px, 1fr))` };

  // Linking: pick a step, then another one to connect them (or disconnect them if they already are).
  const [linking, setLinking] = useState<Cell | null>(null);
  useEffect(() => {
    if (!linking) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLinking(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linking]);
  const pick = (c: Cell) => {
    if (!linking) return setLinking(c);
    if (cellKey(linking) !== cellKey(c)) set({ ...data, links: toggleLink(links, linking, c, uid()) });
    setLinking(null);
  };

  const arrowId = `bp-arrow${useId().replace(/:/g, "")}`;
  // The links are drawn under the cards, from where the cards really are on screen.
  const wrap = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<string, HTMLDivElement>());
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const measure = useCallback(() => {
    const root = wrap.current?.getBoundingClientRect();
    if (!root) return;
    const next: Record<string, Box> = {};
    cells.current.forEach((el, k) => { const r = el.getBoundingClientRect(); next[k] = { x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height }; });
    setBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  useLayoutEffect(measure, [measure, data]);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [measure]);
  const cellRef = (c: Cell) => (el: HTMLDivElement | null) => { if (el) cells.current.set(cellKey(c), el); else cells.current.delete(cellKey(c)); };

  return (
    <div className="overflow-x-auto">
      {linking && (
        <div className="sticky left-0 mb-3 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent-ink print:hidden" role="status">
          <Link2 size={14} aria-hidden /> <span className="flex-1">{T("Elige otro paso para conectarlo, o uno ya conectado para quitar la línea. Esc cancela.")}</span>
          <button type="button" onClick={() => setLinking(null)} className="flex items-center gap-1 font-medium hover:underline"><X size={13} /> {T("Cancelar")}</button>
        </div>
      )}
      <div ref={wrap} className="relative min-w-fit">
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-ink-3" aria-hidden>
          <defs>
            <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1L9 5L1 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </marker>
          </defs>
          {links.map((l) => {
            const a = boxes[cellKey(l.from)], b = boxes[cellKey(l.to)];
            if (!a || !b) return null;
            const p = linkPath(a, b, GAP);
            return <path key={l.id} d={p.d} fill="none" stroke="currentColor" strokeWidth="1.5" markerEnd={p.arrow ? `url(#${arrowId})` : undefined} />;
          })}
        </svg>
        <div className="grid gap-y-0.5" style={grid}>
          <div />
          {stages.map((s, i) => (
            <div key={s.id} className="group relative px-3">
              <div className="flex items-center gap-1 rounded-xl bg-accent px-3 py-2.5 text-on-accent">
                {readOnly ? <p className="flex-1 text-center font-bold">{s.name}</p>
                  : <AutoText value={s.name} minRows={1} onChange={(v) => setStage(s.id, { name: v })} placeholder={exStr(ex, "stages", i, "name") ?? T("Nombre de la etapa")}
                    className="flex-1 !p-0 text-center font-bold text-on-accent placeholder:!text-on-accent/70 hover:!border-transparent focus:!border-transparent focus:!bg-transparent" />}
                {!readOnly && (
                  <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 print:hidden">
                    <button type="button" onClick={() => move(i, -1)} className="p-0.5" aria-label={T("Mover a la izquierda")}><ArrowLeft size={13} /></button>
                    <button type="button" onClick={() => move(i, 1)} className="p-0.5" aria-label={T("Mover a la derecha")}><ArrowRight size={13} /></button>
                    <button type="button" onClick={() => set(removeStage({ stages, links }, s.id))} className="p-0.5" aria-label={T("Eliminar")}><Trash2 size={13} /></button>
                  </span>
                )}
              </div>
            </div>
          ))}

          {LANES.map((lane) => (
            <Row key={lane} lane={lane} stages={stages} setStage={setStage} ex={ex} cellRef={cellRef} linking={linking} pick={pick} />
          ))}
        </div>
      </div>
      {!readOnly && (
        <button type="button" onClick={() => set({ ...data, stages: [...stages, { id: uid(), name: "", evidence: "", customer: "", frontstage: "", backstage: "", support: "" }] })}
          className="mt-3 ml-[162px] flex items-center gap-1.5 rounded-lg border-2 border-dashed border-line-2 px-4 py-2 text-[13px] font-medium text-ink-3 hover:border-accent hover:text-accent print:hidden">
          <Plus size={14} /> {T("Agregar etapa")}
        </button>
      )}
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

function Row({ lane, stages, setStage, ex, cellRef, linking, pick }: {
  lane: Lane; stages: BStage[]; setStage: (id: string, p: Partial<BStage>) => void; ex?: BlueprintData;
  cellRef: (c: Cell) => (el: HTMLDivElement | null) => void; linking: Cell | null; pick: (c: Cell) => void;
}) {
  const { T, readOnly } = useDoc();
  const divider = LANE_DIVIDER[lane];
  return (
    <>
      <RowLabel text={T(LANE_LABEL[lane])} hint={T(LANE_HINT[lane])} />
      {stages.map((s, si) => {
        const c = { stage: s.id, lane };
        const empty = !s[lane]?.trim();
        const source = linking?.stage === s.id && linking.lane === lane;
        return (
          <div key={s.id} className="px-3 py-1.5">
            {/* An empty step has no card when read, so the lines that pass behind it stay visible, as on a whiteboard. */}
            <div ref={cellRef(c)} className={cx("group/cell relative h-full min-h-20 rounded-lg border-t-4 p-1",
              empty ? (readOnly ? "border-transparent" : "border border-dashed border-line-2 bg-surface/60") : cx("border border-line bg-surface", LANE_TONE[lane]),
              source && "ring-2 ring-accent")}>
              {readOnly ? (!empty && <p className="p-1.5 text-[13px] whitespace-pre-line">{s[lane]}</p>)
                : <AutoText value={s[lane]} minRows={2} placeholder={exStr(ex, "stages", si, lane) ?? T("Escribe aquí…")} onChange={(v) => setStage(s.id, { [lane]: v })} className="text-[13px]" />}
              {!readOnly && !linking && (
                <button type="button" onClick={() => pick(c)} title={T("Conectar con otro paso")} aria-label={T("Conectar con otro paso")}
                  className="absolute -right-2 -bottom-2 rounded-full border border-line bg-surface p-1 text-ink-3 opacity-0 shadow-sm group-focus-within/cell:opacity-100 group-hover/cell:opacity-100 hover:text-accent focus:opacity-100 print:hidden">
                  <Link2 size={12} />
                </button>
              )}
              {!readOnly && linking && !source && (
                <button type="button" onClick={() => pick(c)} aria-label={T("Conectar aquí")}
                  className="absolute inset-0 rounded-lg bg-accent/5 outline-2 outline-accent/40 hover:bg-accent/15 hover:outline print:hidden" />
              )}
            </div>
          </div>
        );
      })}
      {divider && (
        <div className="col-span-full my-1.5 flex items-center gap-2 text-[10px] font-semibold tracking-wide text-ink-3 uppercase print:hidden" style={{ gridColumn: `1 / -1` }}>
          <span className="h-px flex-1 border-t border-dashed border-line-2" /> {T(divider)} <span className="h-px flex-1 border-t border-dashed border-line-2" />
        </div>
      )}
    </>
  );
}
