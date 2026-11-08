import { t } from "../lib/i18n";
import type { Block } from "./types";
import { parseTree } from "./types";
import { blockDef, isStructural } from "./registry";
import type { StudySettings } from "../lib/settings";

export interface Issue { level: "error" | "warning"; blockId?: string; message: string }

/** Revisión antes de publicar: errores bloquean la publicación, advertencias no. */
export function validateStudy(blocks: Block[], settings: StudySettings = {}): Issue[] {
  const out: Issue[] = [];
  const ids = new Set(blocks.map((b) => b.id));
  const err = (b: Block | undefined, message: string) => out.push({ level: "error", blockId: b?.id, message });
  const warn = (b: Block | undefined, message: string) => out.push({ level: "warning", blockId: b?.id, message });

  if (!blocks.some((b) => !isStructural(b))) err(undefined, t("El estudio no tiene ninguna pregunta o tarea."));
  if (blocks[0] && blocks[0].type !== "welcome") warn(undefined, t("Agrega una pantalla de bienvenida para dar contexto a los participantes."));
  if (blocks.length && blocks[blocks.length - 1].type !== "thank_you") warn(undefined, t("Agrega una pantalla de agradecimiento al final."));

  blocks.forEach((b, i) => {
    const name = t("Bloque {a} ({b})", { a: i + 1, b: blockDef(b.type)?.label });
    if (!b.title.trim()) err(b, t("{a}: falta el título o la pregunta.", { a: name }));
    switch (b.type) {
      case "choice":
        if (b.options.length < 2) err(b, t("{a}: agrega al menos 2 opciones.", { a: name }));
        if (b.options.some((o) => !o.label.trim())) warn(b, t("{a}: hay opciones sin texto.", { a: name }));
        break;
      case "ranking": if (b.items.some((o) => !o.label.trim())) warn(b, t("{a}: hay elementos sin texto.", { a: name })); break;
      case "matrix": if (!b.rows.length || b.columns.length < 2) err(b, t("{a}: necesita filas y al menos 2 columnas.", { a: name })); break;
      case "card_sort":
        if (b.cards.length < 3) err(b, t("{a}: agrega al menos 3 tarjetas.", { a: name }));
        if (b.mode !== "open" && !b.categories.length) err(b, t("{a}: un card sorting {b} necesita categorías.", { a: name, b: b.mode === "closed" ? "cerrado" : t("híbrido") }));
        if (b.cards.length > 60) warn(b, t("{a}: más de 60 tarjetas puede cansar a los participantes (ideal 30–50).", { a: name }));
        if (new Set(b.cards.map((c) => c.label.trim().toLowerCase())).size !== b.cards.length) warn(b, t("{a}: hay tarjetas repetidas.", { a: name }));
        break;
      case "tree_test":
        if (!parseTree(b.treeText).length) err(b, t("{a}: escribe la estructura del menú.", { a: name }));
        if (!b.correct.length) warn(b, t("{a}: marca la respuesta correcta para medir la tasa de éxito.", { a: name }));
        break;
      case "preference":
        if (b.options.length < 2) err(b, t("{a}: necesitas al menos 2 diseños.", { a: name }));
        if (b.options.some((o) => !o.image)) err(b, t("{a}: sube una imagen para cada diseño.", { a: name }));
        break;
      case "kano":
        if (!b.features.length) err(b, t("{a}: agrega al menos una funcionalidad.", { a: name }));
        if (b.features.length > 15) warn(b, t("{a}: más de 15 funcionalidades cansa a los participantes.", { a: name }));
        break;
      case "five_second": if (!b.image?.url) err(b, t("{a}: sube la imagen que se mostrará.", { a: name })); break;
      case "first_click":
        if (!b.image?.url) err(b, t("{a}: sube la imagen del diseño.", { a: name }));
        else if (!b.area) warn(b, t("{a}: marca el área correcta para medir el éxito.", { a: name }));
        break;
    }
    if (b.type === "prototype_task") {
      const p = settings.prototypes?.find((x) => x.id === b.prototypeId);
      if (!p) err(b, t("{a}: elige o crea el prototipo que se usará.", { a: name }));
      else if (p.kind === "html") {
        if (!p.html?.url) err(b, t("{a}: sube el archivo HTML del prototipo \"{b}\".", { a: name, b: p.name }));
        else if (!b.goalScreens.length) warn(b, t("{a}: sin pantalla meta, el participante indicará cuándo terminó (el éxito no se verifica).", { a: name }));
      }
      else if (!p.screens.length) err(b, t("{a}: el prototipo \"{b}\" no tiene pantallas.", { a: name, b: p.name }));
      else {
        const ids = new Set(p.screens.map((s) => s.id));
        if (!ids.has(b.startScreen)) err(b, t("{a}: elige la pantalla inicial.", { a: name }));
        if (!b.goalScreens.some((g) => ids.has(g))) warn(b, t("{a}: marca la pantalla meta para medir el éxito.", { a: name }));
        if (b.expectedPath.some((s) => !ids.has(s))) warn(b, t("{a}: la ruta esperada incluye pantallas eliminadas.", { a: name }));
      }
    }
    const targets = [...(b.logic?.rules.map((r) => r.goTo) ?? []), b.logic?.otherwise].filter(Boolean) as string[];
    if (targets.some((t) => t !== "end" && !ids.has(t))) err(b, t("{a}: la lógica apunta a un bloque que ya no existe.", { a: name }));
  });
  // Revisión de cada prototipo usado
  const used = new Set(blocks.flatMap((b) => (b.type === "prototype_task" ? [b.prototypeId] : [])));
  for (const p of settings.prototypes ?? []) {
    if (!used.has(p.id) || p.kind === "html") continue;
    const ids = new Set(p.screens.map((s) => s.id));
    const goals = new Set(blocks.flatMap((b) => (b.type === "prototype_task" && b.prototypeId === p.id ? b.goalScreens : [])));
    for (const s of p.screens) {
      if (s.hotspots.some((h) => h.target !== "back" && !ids.has(h.target))) out.push({ level: "error", message: t("Prototipo \"{a}\" · {b}: hay zonas que apuntan a una pantalla eliminada.", { a: p.name, b: s.name }) });
      if (!s.hotspots.length && !goals.has(s.id)) out.push({ level: "warning", message: t("Prototipo \"{a}\" · {b}: no tiene zonas clicables (el participante quedará atrapado ahí).", { a: p.name, b: s.name }) });
    }
  }
  return out;
}
