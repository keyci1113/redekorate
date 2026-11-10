import type { Block, ChoiceValue, FirstClickValue, LogicRule, PreferenceValue, TreeTestValue } from "./types";

/** ¿La respuesta fue "exitosa"? (tree test, first click, tareas en prototipo y cronometradas) */
export function isSuccess(block: Block, value: unknown): boolean | null {
  if (block.type === "tree_test") {
    const v = value as TreeTestValue | undefined;
    return v ? block.correct.includes(v.selected) : null;
  }
  if (block.type === "prototype_task" || block.type === "timed_task") {
    const v = value as { outcome?: string } | undefined;
    return v?.outcome ? v.outcome === "success" : null;
  }
  if (block.type === "first_click") {
    const v = value as FirstClickValue | undefined, a = block.area;
    if (!v || !a) return null;
    return v.x >= a.x && v.x <= a.x + a.w && v.y >= a.y && v.y <= a.y + a.h;
  }
  return null;
}

/** Valor "elegido" para reglas de tipo opción */
function chosen(block: Block, value: unknown): string[] {
  if (block.type === "choice") return (value as ChoiceValue | undefined)?.selected ?? [];
  if (block.type === "yes_no") return value ? [String(value)] : [];
  if (block.type === "preference") { const v = value as PreferenceValue | undefined; return v ? [v.choice] : []; }
  return [];
}

export function ruleMatches(block: Block, rule: LogicRule, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  switch (rule.op) {
    case "is": return chosen(block, value).includes(String(rule.value));
    case "is_not": return !chosen(block, value).includes(String(rule.value));
    case "lt": return typeof value === "number" && value < Number(rule.value);
    case "gt": return typeof value === "number" && value > Number(rule.value);
    case "eq": return typeof value === "number" && value === Number(rule.value);
    case "success": return isSuccess(block, value) === true;
    case "fail": return isSuccess(block, value) === false;
  }
}

/**
 * Devuelve el índice del siguiente bloque según la lógica.
 * -1 significa "terminar el estudio".
 */
export function nextIndex(blocks: Block[], i: number, value: unknown): number {
  const b = blocks[i];
  const target = b.logic?.rules.find((r) => ruleMatches(b, r, value))?.goTo ?? b.logic?.otherwise;
  if (target === "end") return -1;
  if (target) {
    const j = blocks.findIndex((x) => x.id === target);
    if (j > i) return j; // solo saltos hacia adelante (evita ciclos)
  }
  return i + 1 < blocks.length ? i + 1 : -1;
}
