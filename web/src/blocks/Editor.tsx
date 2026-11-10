import { useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { Block, FirstClickBlock, TreeNode, TreeTestBlock } from "./types";
import { parseTree } from "./types";
import { isStructural } from "./registry";
import { Field, cx } from "../components/ui";
import { ImageDrop, OptionsEditor, Segmented, Tip, Toggle } from "../components/editing";
import { PrototypeTaskEditor, type ProtoCtx } from "./PrototypeTaskEditor";

import { t } from "../lib/i18n";
type Set = (p: Record<string, unknown>) => void;

export function BlockEditor({ block, onChange, ctx }: { block: Block; onChange: (p: Partial<Block>) => void; ctx?: ProtoCtx }) {
  const set: Set = (p) => onChange(p as Partial<Block>);
  const visual = block.type === "five_second" || block.type === "first_click";
  const titleLabel = isStructural(block) ? t("Título") : block.type === "first_click" || block.type === "tree_test" || block.type === "prototype_task" || block.type === "timed_task" ? t("Tarea") : block.type === "card_sort" ? t("Instrucción principal") : t("Pregunta");

  return (
    <div className="space-y-5">
      <Field label={titleLabel}>
        <textarea rows={2} className="field resize-none text-[15px] font-medium" value={block.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label={t("Descripción")} hint={t("Opcional. Contexto o instrucciones adicionales.")}>
        <textarea className="field min-h-16" value={block.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
      </Field>

      {/* Imagen: obligatoria en pruebas visuales, opcional en el resto (excepto donde no aplica) */}
      {!["preference", "card_sort", "sus", "matrix", "prototype_task", "kano"].includes(block.type) && (
        <Field group label={visual ? t("Diseño a evaluar") : t("Imagen (opcional)")} hint={visual ? t("Sube una captura o export de tu diseño. Se mostrará a tamaño completo.") : undefined}>
          {block.type === "first_click" ? <FirstClickArea block={block} set={set} /> : (
            <ImageDrop value={block.image?.url} onChange={(url) => set({ image: url ? { url } : null })} />
          )}
        </Field>
      )}

      {block.type === "welcome" && (
        <Field label={t("Texto del botón")}><input className="field" value={block.buttonLabel} onChange={(e) => set({ buttonLabel: e.target.value })} /></Field>
      )}

      {block.type === "open_question" && <>
        <Field label={t("Placeholder")}><input className="field" value={block.placeholder ?? ""} onChange={(e) => set({ placeholder: e.target.value })} /></Field>
        <Toggle label={t("Respuesta larga (párrafo)")} checked={block.multiline} onChange={(v) => set({ multiline: v })} />
      </>}

      {block.type === "choice" && <>
        <OptionsEditor label={t("Opciones")} items={block.options} onChange={(options) => set({ options })} bulk
          marker={<span className={cx("h-4 w-4 shrink-0 border border-line-2", block.multiple ? "rounded" : "rounded-full")} />} />
        <div className="border-t border-line pt-3">
          <Toggle label={t("Permitir varias respuestas")} checked={block.multiple} onChange={(v) => set({ multiple: v })} />
          <Toggle label={t("Incluir opción \"Otro\"")} checked={block.allowOther} onChange={(v) => set({ allowOther: v })} />
          <Toggle label={t("Orden aleatorio")} hint={t("Reduce el sesgo por posición")} checked={block.randomize} onChange={(v) => set({ randomize: v })} />
        </div>
      </>}

      {block.type === "yes_no" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Texto para Sí")}><input className="field" value={block.yesLabel} onChange={(e) => set({ yesLabel: e.target.value })} /></Field>
          <Field label={t("Texto para No")}><input className="field" value={block.noLabel} onChange={(e) => set({ noLabel: e.target.value })} /></Field>
        </div>
      )}

      {block.type === "scale" && <>
        <Field group label={t("Estilo")}>
          <Segmented value={block.style} onChange={(style) => set(style === "emoji" ? { style, min: 1, max: 5 } : { style })}
            options={[{ id: "numbers", label: t("Números") }, { id: "stars", label: t("Estrellas") }, { id: "emoji", label: t("Emojis") }]} />
        </Field>
        {block.style !== "emoji" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Desde")}>
              <select className="field" value={block.min} onChange={(e) => set({ min: +e.target.value })}>{[0, 1].map((n) => <option key={n}>{n}</option>)}</select>
            </Field>
            <Field label={t("Hasta")}>
              <select className="field" value={block.max} onChange={(e) => set({ max: +e.target.value })}>{[3, 4, 5, 7, 10].map((n) => <option key={n}>{n}</option>)}</select>
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Etiqueta izquierda")}><input className="field" value={block.minLabel} onChange={(e) => set({ minLabel: e.target.value })} /></Field>
          <Field label={t("Etiqueta derecha")}><input className="field" value={block.maxLabel} onChange={(e) => set({ maxLabel: e.target.value })} /></Field>
        </div>
      </>}

      {block.type === "ranking" && <>
        <OptionsEditor label={t("Elementos a ordenar")} items={block.items} onChange={(items) => set({ items })} min={2} placeholder={t("Elemento")} addLabel={t("Agregar elemento")} bulk />
        <Toggle label={t("Mostrar en orden aleatorio")} checked={block.randomize} onChange={(v) => set({ randomize: v })} />
      </>}

      {block.type === "matrix" && <>
        <OptionsEditor label={t("Filas (afirmaciones)")} items={block.rows} onChange={(rows) => set({ rows })} placeholder={t("Afirmación")} addLabel={t("Agregar fila")} bulk />
        <OptionsEditor label={t("Columnas (escala)")} items={block.columns} onChange={(columns) => set({ columns })} min={2} placeholder={t("Columna")} addLabel={t("Agregar columna")} />
      </>}

      {block.type === "sus" && (
        <Field label={t("Nombre del producto")} hint={t("Se inserta en cada afirmación: \"Creo que me gustaría usar la app de Rutas con frecuencia.\"")}>
          <input className="field" value={block.product} onChange={(e) => set({ product: e.target.value })} />
        </Field>
      )}

      {block.type === "nps" && <Tip>{t("Escala fija 0–10. Promotores 9–10 · Pasivos 7–8 · Detractores 0–6. Usa la pestaña")} <b>{t("Lógica")}</b> {t("para hacer una pregunta distinta a detractores y promotores.")}</Tip>}

      {block.type === "card_sort" && <>
        <Field group label={t("Tipo de card sorting")}>
          <Segmented value={block.mode} onChange={(mode) => set({ mode })} options={[
            { id: "open", label: t("Abierto"), hint: t("Los participantes crean y nombran sus grupos") },
            { id: "closed", label: t("Cerrado"), hint: t("Solo pueden usar tus categorías") },
            { id: "hybrid", label: t("Híbrido"), hint: t("Tus categorías + pueden crear nuevas") },
          ]} />
        </Field>
        <Tip>
          {block.mode === "open" && t("Abierto: descubre cómo las personas agrupan y nombran el contenido. Ideal para crear una navegación nueva.")}
          {block.mode === "closed" && t("Cerrado: valida si tus categorías tienen sentido. Las personas solo pueden usar las que definas.")}
          {block.mode === "hybrid" && t("Híbrido: das categorías de partida y las personas pueden crear nuevas si ninguna encaja.")}
        </Tip>
        <OptionsEditor label={t("Tarjetas")} items={block.cards} onChange={(cards) => set({ cards })} min={2} placeholder={t("Tarjeta")} addLabel={t("Agregar tarjeta")} bulk />
        {block.mode !== "open" && (
          <OptionsEditor label={t("Categorías")} items={block.categories} onChange={(categories) => set({ categories })} placeholder={t("Categoría")} addLabel={t("Agregar categoría")} bulk />
        )}
        <div className="border-t border-line pt-3">
          <Toggle label={t("Tarjetas en orden aleatorio")} checked={block.randomize} onChange={(v) => set({ randomize: v })} />
          <Toggle label={t("Exigir ordenar todas las tarjetas")} checked={block.requireAll} onChange={(v) => set({ requireAll: v })} />
        </div>
      </>}

      {block.type === "tree_test" && <TreeEditor block={block} set={set} />}
      {block.type === "kano" && <>
        <OptionsEditor label={t("Funcionalidades a evaluar")} items={block.features} onChange={(features) => set({ features })} min={1} placeholder={t("Funcionalidad")} addLabel={t("Agregar funcionalidad")} bulk />
        <Field label={t("Pregunta funcional")} hint={t("{f} se reemplaza por el nombre de cada funcionalidad.")}><input className="field" value={block.funcQ} onChange={(e) => set({ funcQ: e.target.value })} /></Field>
        <Field label={t("Pregunta disfuncional")}><input className="field" value={block.dysQ} onChange={(e) => set({ dysQ: e.target.value })} /></Field>
        <Toggle label={t("Preguntar importancia (1–10)")} checked={block.askImportance} onChange={(v) => set({ askImportance: v })} />
        <Tip>{t("Cada funcionalidad se clasifica automáticamente en Obligatoria, Unidimensional, Atractiva, Indiferente, Inversa o Cuestionable.")}</Tip>
      </>}
      {block.type === "prototype_task" && ctx && <PrototypeTaskEditor block={block} set={set} ctx={ctx} />}
      {block.type === "timed_task" && <>
        <Field label={t("Link del producto o prototipo (opcional)")} hint={t("Se abre en una pestaña nueva al empezar a cronometrar. Déjalo vacío si la tarea ocurre fuera de la pantalla (en un local, con papel, en otra app).")}>
          <input className="field" type="url" inputMode="url" placeholder="https://" value={block.url} onChange={(e) => set({ url: e.target.value.trim() })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Tiempo límite")} hint={t("Al llegar, la tarea termina sola.")}>
            <select className="field" value={block.limitSec ?? 0} onChange={(e) => set({ limitSec: +e.target.value || null })}>
              <option value={0}>{t("Sin límite")}</option>
              {[30, 60, 120, 180, 300, 600].map((s) => <option key={s} value={s}>{s < 60 ? `${s} s` : `${s / 60} min`}</option>)}
            </select>
          </Field>
          <Field label={t("Tiempo de referencia (s)")} hint={t("Lo que tarda alguien experto, o la versión actual.")}>
            <input className="field" type="number" min={1} max={3600} placeholder="—" value={block.benchmarkSec ?? ""} onChange={(e) => set({ benchmarkSec: e.target.value ? Math.max(0, +e.target.value) || null : null })} />
          </Field>
        </div>
        <div className="border-t border-line pt-3">
          <Toggle label={t("Mostrar el cronómetro al participante")} hint={t("Ocúltalo si no quieres que se sienta presionado")} checked={block.showTimer} onChange={(v) => set({ showTimer: v })} />
          <Toggle label={t("Permitir \"No pude completarla\"")} checked={block.allowGiveUp} onChange={(v) => set({ allowGiveUp: v })} />
        </div>
        <Tip>{t("Agrega una Escala (SEQ) justo después para cruzar el tiempo con la facilidad percibida. El template Estudio de tiempos ya lo hace.")}</Tip>
      </>}

      {block.type === "preference" && <>
        <OptionsEditor label={t("Diseños a comparar")} items={block.options} onChange={(options) => set({ options })} withImages min={2} placeholder={t("Diseño")} addLabel={t("Agregar diseño")} />
        <div className="border-t border-line pt-3">
          <Toggle label={t("Preguntar \"¿por qué?\"")} hint={t("Obtén el razonamiento detrás de la elección")} checked={block.askWhy} onChange={(v) => set({ askWhy: v })} />
          <Toggle label={t("Orden aleatorio")} checked={block.randomize} onChange={(v) => set({ randomize: v })} />
        </div>
      </>}

      {block.type === "five_second" && <>
        <Field group label={t("Tiempo de exposición")}>
          <Segmented value={String(block.seconds)} onChange={(s) => set({ seconds: +s })} options={["3", "5", "8", "10"].map((s) => ({ id: s, label: `${s} s` }))} />
        </Field>
        <Tip>{t("Después de este bloque agrega preguntas como \"¿Qué recuerdas?\" o \"¿De qué trata esta página?\". El template ya las incluye.")}</Tip>
      </>}

      {!isStructural(block) && block.type !== "five_second" && block.type !== "prototype_task" && block.type !== "timed_task" && (
        <div className="border-t border-line pt-3">
          <Toggle label={t("Respuesta obligatoria")} checked={!!block.required} onChange={(v) => set({ required: v })} />
        </div>
      )}
    </div>
  );
}

/** Subir imagen y dibujar (arrastrando) el área correcta del first click. */
function FirstClickArea({ block, set }: { block: FirstClickBlock; set: Set }) {
  const box = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  if (!block.image?.url) return <ImageDrop value={null} onChange={(url) => set({ image: url ? { url } : null })} />;
  const rel = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const a = draft
    ? { x: Math.min(draft.x0, draft.x), y: Math.min(draft.y0, draft.y), w: Math.abs(draft.x - draft.x0), h: Math.abs(draft.y - draft.y0) }
    : block.area;
  return (
    <div className="space-y-2">
      <div ref={box} className="relative cursor-crosshair touch-none overflow-hidden rounded-lg border border-line select-none"
        onPointerDown={(e) => { const p = rel(e); (e.target as Element).setPointerCapture?.(e.pointerId); setDraft({ x0: p.x, y0: p.y, ...p }); }}
        onPointerMove={(e) => draft && setDraft({ ...draft, ...rel(e) })}
        onPointerUp={() => { if (draft && a && a.w > 0.01 && a.h > 0.01) set({ area: a }); setDraft(null); }}>
        <img src={block.image.url} alt="" className="pointer-events-none w-full" draggable={false} />
        {a && <div className="absolute rounded border-2 border-good bg-good/15" style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` }} />}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-3">{block.area ? t("Área correcta definida ✓") : t("Arrastra sobre la imagen para marcar el área correcta (opcional)")}</span>
        <span className="flex gap-3">
          {block.area && <button type="button" className="font-medium text-ink-2" onClick={() => set({ area: null })}>{t("Borrar área")}</button>}
          <button type="button" className="font-medium text-bad" onClick={() => set({ image: null, area: null })}>{t("Cambiar imagen")}</button>
        </span>
      </div>
    </div>
  );
}

function TreeEditor({ block, set }: { block: TreeTestBlock; set: Set }) {
  const tree = parseTree(block.treeText);
  const toggle = (id: string) => set({ correct: block.correct.includes(id) ? block.correct.filter((c) => c !== id) : [...block.correct, id] });
  return (
    <>
      <Field label={t("Estructura del menú")} hint={t("Un elemento por línea. Usa 2 espacios (o Tab) para crear subniveles.")}>
        <textarea className="field min-h-48 font-mono text-[13px] leading-relaxed" value={block.treeText}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const t = e.currentTarget, s = t.selectionStart;
              set({ treeText: t.value.slice(0, s) + "  " + t.value.slice(t.selectionEnd) });
              requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
            }
          }}
          onChange={(e) => set({ treeText: e.target.value })} />
      </Field>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-ink-2">{t("Respuesta(s) correcta(s)")}</p>
        <p className="mb-2 text-xs text-ink-3">{t("Haz clic en el o los destinos donde está la respuesta.")}</p>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-line bg-paper/50 p-2">
          <TreePick nodes={tree} depth={0} correct={block.correct} onToggle={toggle} />
        </div>
        {block.correct.length === 0 && <p className="mt-1.5 text-xs text-warn">{t("Marca al menos una respuesta correcta para medir el éxito.")}</p>}
      </div>
    </>
  );
}

function TreePick({ nodes, depth, correct, onToggle }: { nodes: TreeNode[]; depth: number; correct: string[]; onToggle: (id: string) => void }) {
  return (
    <ul>
      {nodes.map((n) => {
        const on = correct.includes(n.id);
        return (
          <li key={n.id}>
            <button type="button" onClick={() => onToggle(n.id)} style={{ paddingLeft: depth * 14 + 6 }}
              className={cx("flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px] transition", on ? "bg-good-soft font-medium text-good" : "hover:bg-ink/5")}>
              {n.children.length ? <ChevronRight size={12} className="rotate-90 text-ink-3" /> : <span className="w-3" />}
              <span className="flex-1">{n.label}</span>
              {on && <Check size={13} />}
            </button>
            {n.children.length > 0 && <TreePick nodes={n.children} depth={depth + 1} correct={correct} onToggle={onToggle} />}
          </li>
        );
      })}
    </ul>
  );
}
