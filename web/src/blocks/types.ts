import type { FlowStep } from "./prototype";
// Un estudio es una secuencia de bloques. Cada bloque puede tener imagen y lógica condicional.

export interface Option { id: string; label: string; image?: string }
export interface ImageRef { url: string; alt?: string }

/** Regla de lógica: "si la respuesta <op> <value>, ir a <goTo>" */
export type LogicOp = "is" | "is_not" | "lt" | "gt" | "eq" | "success" | "fail";
export interface LogicRule { id: string; op: LogicOp; value?: string | number; goTo: string }
export interface Logic { rules: LogicRule[]; otherwise?: string }  // goTo: id de bloque o "end"

interface Base {
  id: string; title: string; description?: string; required?: boolean;
  image?: ImageRef | null; logic?: Logic;
}

// Estructura
export interface WelcomeBlock extends Base { type: "welcome"; buttonLabel: string }
export interface ContextBlock extends Base { type: "context" }
export interface ThankYouBlock extends Base { type: "thank_you" }
// Preguntas
export interface OpenQuestionBlock extends Base { type: "open_question"; multiline: boolean; placeholder?: string }
export interface ChoiceBlock extends Base { type: "choice"; multiple: boolean; options: Option[]; allowOther: boolean; randomize: boolean }
export interface YesNoBlock extends Base { type: "yes_no"; yesLabel: string; noLabel: string }
export interface ScaleBlock extends Base { type: "scale"; min: number; max: number; minLabel: string; maxLabel: string; style: "numbers" | "stars" | "emoji" }
export interface RankingBlock extends Base { type: "ranking"; items: Option[]; randomize: boolean }
export interface MatrixBlock extends Base { type: "matrix"; rows: Option[]; columns: Option[] }
// Métricas
export interface NpsBlock extends Base { type: "nps" }
export interface SusBlock extends Base { type: "sus"; product: string }
// Arquitectura de información
export interface CardSortBlock extends Base {
  type: "card_sort"; mode: "open" | "closed" | "hybrid";
  cards: Option[]; categories: Option[]; randomize: boolean; requireAll: boolean;
}
export interface TreeTestBlock extends Base { type: "tree_test"; treeText: string; correct: string[] }
// Pruebas visuales
export interface PreferenceBlock extends Base { type: "preference"; options: Option[]; askWhy: boolean; randomize: boolean }
export interface FiveSecondBlock extends Base { type: "five_second"; seconds: number }
export interface FirstClickBlock extends Base { type: "first_click"; area: { x: number; y: number; w: number; h: number } | null }
// Kano
export interface KanoBlock extends Base { type: "kano"; features: Option[]; funcQ: string; dysQ: string; askImportance: boolean }
// Estudio de tiempos: una tarea cronometrada en el producto real (link) o fuera de la pantalla
export interface TimedTaskBlock extends Base {
  type: "timed_task";
  url: string;                   // se abre en otra pestaña al empezar; "" si la tarea es fuera de pantalla
  limitSec: number | null;       // al llegar aquí la tarea termina como "timeout"
  benchmarkSec: number | null;   // tiempo de referencia (experto o versión actual) contra el que se comparan los resultados
  allowGiveUp: boolean;
  showTimer: boolean;            // ocultarlo evita presionar al participante
}
// Prototipos
export interface PrototypeTaskBlock extends Base {
  type: "prototype_task"; prototypeId: string; startScreen: string;
  goalScreens: string[]; expectedPath: string[]; allowGiveUp: boolean;
  steps?: FlowStep[]; goalClick?: FlowStep;   // interacciones requeridas y meta por interacción (prototipos HTML)
}

export type Block =
  | WelcomeBlock | ContextBlock | ThankYouBlock
  | OpenQuestionBlock | ChoiceBlock | YesNoBlock | ScaleBlock | RankingBlock | MatrixBlock
  | NpsBlock | SusBlock
  | CardSortBlock | TreeTestBlock
  | PreferenceBlock | FiveSecondBlock | FirstClickBlock
  | PrototypeTaskBlock | KanoBlock | TimedTaskBlock;

export type BlockType = Block["type"];

// Valores de respuesta
export interface ChoiceValue { selected: string[]; other?: string }
export interface CardSortValue { groups: { id: string; name: string; cardIds: string[]; custom: boolean }[] }
export interface TreeTestValue { selected: string; path: string[]; backtracks: number }
export interface PreferenceValue { choice: string; why?: string }
export interface FirstClickValue { x: number; y: number; ms: number }
export interface TimedTaskValue { outcome: "success" | "gave_up" | "timeout"; ms: number }

// Árbol para tree testing: se escribe con sangría (2 espacios por nivel)
export interface TreeNode { id: string; label: string; children: TreeNode[] }
export function parseTree(text: string): TreeNode[] {
  const root: TreeNode = { id: "", label: "", children: [] };
  const stack: { depth: number; node: TreeNode }[] = [{ depth: -1, node: root }];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const depth = Math.floor((raw.match(/^\s*/)![0].replace(/\t/g, "  ").length) / 2);
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1].node;
    const label = raw.trim();
    const node: TreeNode = { id: parent.id ? `${parent.id}/${label}` : label, label, children: [] };
    parent.children.push(node);
    stack.push({ depth, node });
  }
  return root.children;
}
