import { ArrowRight, Check, FileCode2, Flag, MousePointerClick, Pencil, Plus, Smartphone, Target, Undo2, X } from "lucide-react";
import type { PrototypeTaskBlock } from "./types";
import type { Prototype, Screen } from "./prototype";
import { flowToTask, hasOwnFlow, isHtml, isLink, resolveTask } from "./prototype";
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
            {s.image ? <img src={s.image} alt="" className="aspect-[3/4] w-full bg-paper object-cover object-top" />
              : <span className="flex aspect-[4/3] w-full items-center justify-center bg-paper"><FileCode2 size={16} className="text-accent/70" /></span>}
            <span className="block truncate px-1.5 py-1 text-[11px] font-medium">{s.name}</span>
            {on && <span className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">{b ?? <Check size={11} strokeWidth={3} />}</span>}
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
  const html = isHtml(proto);
  const link = isLink(proto);
  const flow = flowToTask(proto);
  const own = hasOwnFlow(block);
  const shown = resolveTask(block, proto);   // lo que verá el participante: propio o heredado del flujo
  const followFlow = () => set({ startScreen: "", goalScreens: [], expectedPath: [], steps: [], goalClick: undefined });
  const n = (i: number) => (html ? i - 1 : i);   // en HTML no hay paso "pantalla inicial"

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
            <select className="field" value={block.prototypeId} onChange={(e) => {
              const next = ctx.prototypes.find((p) => p.id === e.target.value);
              const f = flowToTask(next);
              // Sin valores propios: la tarea hereda el flujo del prototipo y sigue sus cambios. Solo se copia la descripción.
              set({ prototypeId: e.target.value, startScreen: "", goalScreens: [], expectedPath: [], steps: [], goalClick: undefined, ...(f?.description && !block.description ? { description: f.description } : {}) });
            }}>
              <option value="">{t("Elige un prototipo…")}</option>
              {ctx.prototypes.map((p) => <option key={p.id} value={p.id}>{p.name} · {isLink(p) ? p.link?.host ?? t("link") : `${p.screens.length} ${t("pantallas")}`}</option>)}
            </select>
            <Button icon={<Pencil size={14} />} onClick={() => ctx.openEditor(block.prototypeId || undefined)}>{t("Editar")}</Button>
          </div>
        )}
      </Field>

      {proto && html && !proto.html && (
        <Tip>{t("Este prototipo todavía no tiene archivo HTML. Haz clic en")} <b>{t("Editar")}</b> {t("para subirlo.")}</Tip>
      )}
      {proto && html && proto.html && screens.length > 0 && (
        <Field group label={t("Flujo")} hint={flow ? undefined : t("Define inicio, meta e interacciones en el prototipo.")}>
          {flow ? (
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-paper p-2 text-[12px]">
              {shown.startScreen && <span className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 ring-1 ring-line"><Flag size={11} className="text-accent" /> {name(shown.startScreen)}</span>}
              {shown.expectedPath.filter((id) => id !== shown.startScreen && !shown.goalScreens.includes(id)).map((id) => <span key={id} className="flex items-center gap-1"><ArrowRight size={11} className="text-ink-3" /><span className="rounded bg-surface px-1.5 py-0.5 ring-1 ring-line">{name(id)}</span></span>)}
              {(shown.steps ?? []).map((st, i) => <span key={i} className="flex items-center gap-1"><ArrowRight size={11} className="text-ink-3" /><span className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 ring-1 ring-line"><MousePointerClick size={11} className="text-accent" /> {st.label}</span></span>)}
              {shown.goalScreens.map((id) => <span key={id} className="flex items-center gap-1"><ArrowRight size={11} className="text-ink-3" /><span className="flex items-center gap-1 rounded bg-good-soft px-1.5 py-0.5 text-good ring-1 ring-good/30"><Target size={11} /> {name(id)}</span></span>)}
              {shown.goalClick && <span className="flex items-center gap-1"><ArrowRight size={11} className="text-ink-3" /><span className="flex items-center gap-1 rounded bg-good-soft px-1.5 py-0.5 text-good ring-1 ring-good/30"><Target size={11} /> {shown.goalClick.label}</span></span>}
              {!shown.goalScreens.length && !shown.goalClick && <span className="text-ink-3">{t("Sin meta: el participante toca \"Terminé la tarea\".")}</span>}
            </div>
          ) : null}
          <Button size="sm" variant="ghost" className="mt-2" icon={<Pencil size={13} />} onClick={() => ctx.openEditor(proto.id)}>{flow ? t("Editar flujo") : t("Definir flujo")}</Button>
          {own && <button type="button" onClick={followFlow} className="ml-2 text-[12px] font-medium text-accent hover:underline">{t("Volver al flujo del prototipo")}</button>}
        </Field>
      )}
      {proto && html && proto.html && screens.length === 0 && (
        <Tip>{t("Abre el prototipo con")} <b>{t("Editar")}</b> {t("y navégalo: las pantallas que visites aparecerán aquí para elegir la meta. Sin meta, el participante indicará cuándo terminó.")}</Tip>
      )}
      {proto && link && (
        <Tip>{t("Prototipo por link: el participante lo verá dentro de la tarea y tocará \"Terminé la tarea\" al acabar. Se registran el tiempo y el resultado, no los clics.")}</Tip>
      )}
      {proto && !html && !link && screens.length === 0 && (
        <Tip>{t("Este prototipo todavía no tiene pantallas. Haz clic en")} <b>{t("Editar")}</b> {t("para subirlas y conectar las zonas clicables.")}</Tip>
      )}

      {proto && !html && screens.length > 0 && <>
        {!html && <Field group label={t("1 · Pantalla inicial")} hint={t("Donde empieza el participante.")}>
          <ScreenGrid screens={screens} selected={shown.startScreen ? [shown.startScreen] : []}
            onPick={(id) => set({ startScreen: id, expectedPath: shown.expectedPath.length ? [id, ...shown.expectedPath.slice(1)] : [] })} />
        </Field>}
        <Field group label={t("{a} · Pantalla(s) meta", { a: n(2) })} hint={t("Al llegar aquí, la tarea se marca como completada.")}>
          <ScreenGrid screens={screens} selected={shown.goalScreens}
            onPick={(id) => set({ goalScreens: shown.goalScreens.includes(id) ? shown.goalScreens.filter((g) => g !== id) : [...shown.goalScreens, id] })} />
        </Field>
        <Field group label={t("{a} · Ruta esperada (opcional)", { a: n(3) })} hint={t("Haz clic en las pantallas en orden. Sirve para medir el éxito directo y ver dónde se desvían.")}>
          {shown.expectedPath.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg bg-paper p-2 text-[12px]">
              {shown.expectedPath.map((id, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ArrowRight size={11} className="text-ink-3" />}
                  <span className="rounded bg-surface px-1.5 py-0.5 font-medium ring-1 ring-line">{name(id)}</span>
                </span>
              ))}
              <span className="ml-auto flex gap-1">
                <button type="button" onClick={() => set({ expectedPath: shown.expectedPath.slice(0, -1) })} className="rounded p-1 text-ink-3 hover:text-ink" title={t("Quitar último")}><Undo2 size={13} /></button>
                <button type="button" onClick={() => set({ expectedPath: [] })} className="rounded p-1 text-ink-3 hover:text-bad" title={t("Limpiar")}><X size={13} /></button>
              </span>
            </div>
          )}
          <ScreenGrid screens={screens} selected={[...new Set(shown.expectedPath)]}
            badge={(id) => { const idx = shown.expectedPath.lastIndexOf(id); return idx >= 0 ? String(idx + 1) : null; }}
            onPick={(id) => {
              const base = shown.expectedPath.length ? shown.expectedPath : shown.startScreen && id !== shown.startScreen ? [shown.startScreen] : [];
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
