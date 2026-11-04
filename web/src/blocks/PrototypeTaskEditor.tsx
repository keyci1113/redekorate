import { ArrowRight, Check, Pencil, Plus, Smartphone, Undo2, X } from "lucide-react";
import type { PrototypeTaskBlock } from "./types";
import type { Prototype, Screen } from "./prototype";
import { Button, Field, cx } from "../components/ui";
import { Tip, Toggle } from "../components/editing";

import { t } from "../lib/i18n";
export interface ProtoCtx { prototypes: Prototype[]; openEditor: (id?: string) => void; create: () => string }

function ScreenGrid({ screens, selected, onPick, badge }: { screens: Screen[]; selected: string[]; onPick: (id: string) => void; badge?: (id: string) => string | null }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {screens.map((s) => {
        const on = selected.includes(s.id), b = badge?.(s.id);
        return (
          <button key={s.id} type="button" onClick={() => onPick(s.id)} title={s.name}
            className={cx("group relative overflow-hidden rounded-lg border-2 text-left transition", on ? "border-accent" : "border-line hover:border-line-2")}>
            <img src={s.image} alt="" className="aspect-[3/4] w-full bg-paper object-cover object-top" />
            <span className="block truncate px-1.5 py-1 text-[11px] font-medium">{s.name}</span>
            {on && <span className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{b ?? <Check size={11} strokeWidth={3} />}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function PrototypeTaskEditor({ block, set, ctx }: { block: PrototypeTaskBlock; set: (p: Record<string, unknown>) => void; ctx: ProtoCtx }) {
  const proto = ctx.prototypes.find((p) => p.id === block.prototypeId);
  const screens = proto?.screens ?? [];
  const name = (id: string) => screens.find((s) => s.id === id)?.name ?? "?";

  return (
    <div className="space-y-5">
      <Field group label={t("Prototipo")}>
        {ctx.prototypes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-2 bg-paper/60 p-4 text-center">
            <Smartphone size={20} className="mx-auto text-accent" />
            <p className="mt-2 text-[13px] text-ink-2">{t("Aún no tienes prototipos en este estudio.")}</p>
            <Button size="sm" variant="primary" className="mt-3" icon={<Plus size={14} />} onClick={() => { const id = ctx.create(); set({ prototypeId: id }); ctx.openEditor(id); }}>{t("Crear prototipo")}</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select className="field" value={block.prototypeId} onChange={(e) => set({ prototypeId: e.target.value, startScreen: "", goalScreens: [], expectedPath: [] })}>
              <option value="">{t("Elige un prototipo…")}</option>
              {ctx.prototypes.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.screens.length} {t("pantallas")}</option>)}
            </select>
            <Button icon={<Pencil size={14} />} onClick={() => ctx.openEditor(block.prototypeId || undefined)}>{t("Editar")}</Button>
          </div>
        )}
      </Field>

      {proto && screens.length === 0 && (
        <Tip>{t("Este prototipo todavía no tiene pantallas. Haz clic en")} <b>{t("Editar")}</b> {t("para subirlas y conectar las zonas clicables.")}</Tip>
      )}

      {proto && screens.length > 0 && <>
        <Field group label={t("1 · Pantalla inicial")} hint={t("Donde empieza el participante.")}>
          <ScreenGrid screens={screens} selected={block.startScreen ? [block.startScreen] : []}
            onPick={(id) => set({ startScreen: id, expectedPath: block.expectedPath.length ? [id, ...block.expectedPath.slice(1)] : [] })} />
        </Field>
        <Field group label={t("2 · Pantalla(s) meta")} hint={t("Al llegar aquí, la tarea se marca como completada.")}>
          <ScreenGrid screens={screens} selected={block.goalScreens}
            onPick={(id) => set({ goalScreens: block.goalScreens.includes(id) ? block.goalScreens.filter((g) => g !== id) : [...block.goalScreens, id] })} />
        </Field>
        <Field group label={t("3 · Ruta esperada (opcional)")} hint={t("Haz clic en las pantallas en orden. Sirve para medir el éxito directo y ver dónde se desvían.")}>
          {block.expectedPath.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg bg-paper p-2 text-[12px]">
              {block.expectedPath.map((id, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ArrowRight size={11} className="text-ink-3" />}
                  <span className="rounded bg-surface px-1.5 py-0.5 font-medium ring-1 ring-line">{name(id)}</span>
                </span>
              ))}
              <span className="ml-auto flex gap-1">
                <button type="button" onClick={() => set({ expectedPath: block.expectedPath.slice(0, -1) })} className="rounded p-1 text-ink-3 hover:text-ink" title={t("Quitar último")}><Undo2 size={13} /></button>
                <button type="button" onClick={() => set({ expectedPath: [] })} className="rounded p-1 text-ink-3 hover:text-bad" title={t("Limpiar")}><X size={13} /></button>
              </span>
            </div>
          )}
          <ScreenGrid screens={screens} selected={[...new Set(block.expectedPath)]}
            badge={(id) => { const idx = block.expectedPath.lastIndexOf(id); return idx >= 0 ? String(idx + 1) : null; }}
            onPick={(id) => {
              const base = block.expectedPath.length ? block.expectedPath : block.startScreen && id !== block.startScreen ? [block.startScreen] : [];
              set({ expectedPath: [...base, id] });
            }} />
        </Field>
      </>}

      <div className="border-t border-line pt-3">
        <Toggle label={t("Permitir \"No puedo completarla\"")} hint={t("Recomendado: un abandono también es un dato valioso")} checked={block.allowGiveUp} onChange={(v) => set({ allowGiveUp: v })} />
      </div>
    </div>
  );
}
