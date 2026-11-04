import { GitBranch, Plus, Trash2 } from "lucide-react";
import type { Block, Logic, LogicOp, LogicRule } from "./types";
import { blockDef } from "./registry";
import { uid } from "../lib/hooks";
import { Tip } from "../components/editing";

import { t } from "../lib/i18n";
function choiceOptions(b: Block): { id: string; label: string }[] {
  if (b.type === "choice") return [...b.options, ...(b.allowOther ? [{ id: "__other", label: t("Otro") }] : [])];
  if (b.type === "yes_no") return [{ id: "yes", label: b.yesLabel }, { id: "no", label: b.noLabel }];
  if (b.type === "preference") return b.options.map((o, i) => ({ id: o.id, label: o.label || t("Diseño {a}", { a: i + 1 }) }));
  return [];
}

const OPS = (): Record<string, { id: LogicOp; label: string }[]> => ({
  choice: [{ id: "is", label: t("es") }, { id: "is_not", label: t("no es") }],
  number: [{ id: "lt", label: t("es menor que") }, { id: "eq", label: t("es igual a") }, { id: "gt", label: t("es mayor que") }],
  success: [{ id: "success", label: t("acierta") }, { id: "fail", label: t("falla") }],
});

export function LogicEditor({ block, blocks, onChange }: { block: Block; blocks: Block[]; onChange: (l: Logic | undefined) => void }) {
  const def = blockDef(block.type)!;
  const kind = def.logic[0];
  const logic: Logic = block.logic ?? { rules: [] };
  const idx = blocks.findIndex((b) => b.id === block.id);
  const targets = blocks.slice(idx + 1).map((b) => ({ id: b.id, label: `${blocks.indexOf(b) + 1}. ${b.title || blockDef(b.type)?.label}` }));
  const set = (l: Logic) => onChange(l.rules.length || l.otherwise ? l : undefined);
  const upd = (id: string, p: Partial<LogicRule>) => set({ ...logic, rules: logic.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const opts = choiceOptions(block);

  const newRule = (): LogicRule => ({
    id: uid(), op: OPS()[kind][0].id,
    value: kind === "choice" ? opts[0]?.id : kind === "number" ? (block.type === "nps" ? 7 : 3) : undefined,
    goTo: targets[0]?.id ?? "end",
  });

  const Target = ({ value, onPick, allowNext }: { value?: string; onPick: (v: string) => void; allowNext?: boolean }) => (
    <select className="field py-1.5" value={value ?? ""} onChange={(e) => onPick(e.target.value)}>
      {allowNext && <option value="">{t("Siguiente bloque")}</option>}
      {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      <option value="end">{t("Terminar el estudio")}</option>
    </select>
  );

  return (
    <div className="space-y-5">
      <Tip>
        {t("La lógica permite mostrar preguntas distintas según lo que responda cada persona. Por ejemplo: si en el NPS responde menos de 7, pregúntale qué mejorar; si responde 9 o más, qué es lo que más le gusta.")}
      </Tip>

      {kind ? (
        <div className="space-y-3">
          {logic.rules.map((r, n) => (
            <div key={r.id} className="space-y-2 rounded-xl border border-line bg-paper/50 p-3">
              <div className="flex items-center justify-between">
                <span className="label">{t("Regla")} {n + 1}</span>
                <button onClick={() => set({ ...logic, rules: logic.rules.filter((x) => x.id !== r.id) })} className="rounded p-1 text-ink-3 hover:text-bad" aria-label={t("Eliminar regla")}><Trash2 size={14} /></button>
              </div>
              <p className="text-[13px] text-ink-2">{t("Si la respuesta…")}</p>
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <select className="field py-1.5" value={r.op} onChange={(e) => upd(r.id, { op: e.target.value as LogicOp })}>
                  {OPS()[kind].map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                {kind === "choice" && (
                  <select className="field py-1.5" value={String(r.value ?? "")} onChange={(e) => upd(r.id, { value: e.target.value })}>
                    {opts.map((o) => <option key={o.id} value={o.id}>{o.label || t("(sin texto)")}</option>)}
                  </select>
                )}
                {kind === "number" && (
                  <input type="number" className="field py-1.5" value={Number(r.value ?? 0)} onChange={(e) => upd(r.id, { value: +e.target.value })} />
                )}
                {kind === "success" && <span className="self-center text-[13px] text-ink-3">{block.type === "tree_test" ? t("el destino correcto") : t("el área correcta")}</span>}
              </div>
              <p className="text-[13px] text-ink-2">{t("…entonces ir a")}</p>
              <Target value={r.goTo} onPick={(v) => upd(r.id, { goTo: v })} />
            </div>
          ))}
          <button onClick={() => set({ ...logic, rules: [...logic.rules, newRule()] })}
            className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-2 py-2.5 text-[13px] font-medium text-accent hover:border-accent hover:bg-accent-soft/50">
            <Plus size={14} /> {t("Agregar regla")}
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-ink-3"><GitBranch size={14} /> {t("Este tipo de bloque no admite condiciones, pero puedes definir a dónde ir después.")}</p>
      )}

      <div className="border-t border-line pt-4">
        <p className="mb-2 text-[13px] font-medium text-ink-2">{logic.rules.length ? t("En cualquier otro caso, ir a") : t("Después de este bloque, ir a")}</p>
        <Target allowNext value={logic.otherwise} onPick={(v) => set({ ...logic, otherwise: v || undefined })} />
      </div>
      {block.type === "tree_test" && block.correct.length === 0 && logic.rules.length > 0 && <p className="text-xs text-warn">{t("Marca la respuesta correcta en Contenido para que las reglas de acierto funcionen.")}</p>}
      {block.type === "first_click" && !block.area && logic.rules.length > 0 && <p className="text-xs text-warn">{t("Dibuja el área correcta en Contenido para que las reglas de acierto funcionen.")}</p>}
    </div>
  );
}
