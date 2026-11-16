/**
 * What an outside assistant needs to know to build a study: the block shapes the builder and runner use
 * (web/src/blocks/types.ts) and the method keys the template catalog uses (web/src/templates/catalog.ts).
 * reference.test.ts fails when either file gains a type or key that is missing here.
 */

export const BLOCK_TYPES = [
  "welcome", "context", "thank_you",
  "open_question", "choice", "yes_no", "scale", "ranking", "matrix",
  "nps", "sus",
  "card_sort", "tree_test",
  "preference", "five_second", "first_click",
  "prototype_task", "kano", "timed_task",
] as const;

export const METHODS = [
  "prototype_test", "usability_moderated", "usability_unmoderated", "first_click", "five_second", "preference_test",
  "tree_test", "time_study", "heuristic_eval", "card_sort_open", "card_sort_closed", "card_sort_hybrid", "survey",
  "prioritization", "interview", "aeiou", "diary_study", "contextual_inquiry", "jtbd", "screener", "affinity_map",
  "empathy_map", "persona", "journey_map", "service_blueprint", "cognitive_map", "user_flow", "stakeholder_map",
  "sus", "nps", "csat_ces", "seq", "umux_lite", "kano", "research_plan", "participants", "insight_repo", "report", "blank",
] as const;

export const BLOCK_REFERENCE = `A study is an ordered array of blocks. Every block has:
  id: string (unique in the study, e.g. "b1"), type, title: string,
  description?: string, required?: boolean, image?: { url, alt? } | null,
  logic?: { rules: { id, op: "is"|"is_not"|"lt"|"gt"|"eq"|"success"|"fail", value?, goTo: blockId|"end" }[], otherwise?: blockId|"end" }
Options are { id: string, label: string, image?: string }.

Structure
  welcome        buttonLabel: string                       (first block)
  context        (text only, no answer)
  thank_you      (last block)
Questions
  open_question  multiline: boolean, placeholder?: string
  choice         multiple: boolean, options: Option[], allowOther: boolean, randomize: boolean
  yes_no         yesLabel: string, noLabel: string
  scale          min: number, max: number, minLabel: string, maxLabel: string, style: "numbers"|"stars"|"emoji"
  ranking        items: Option[], randomize: boolean
  matrix         rows: Option[], columns: Option[]
Metrics
  nps            (0-10 likelihood to recommend)
  sus            product: string   (the 10 standard SUS items)
Information architecture
  card_sort      mode: "open"|"closed"|"hybrid", cards: Option[], categories: Option[], randomize: boolean, requireAll: boolean
  tree_test      treeText: string (one label per line, two spaces of indent per level), correct: string[] (node ids: labels joined by "/")
Visual tests (need an uploaded image, so usually finished in the app)
  preference     options: Option[] (each with image), askWhy: boolean, randomize: boolean
  five_second    seconds: number
  first_click    area: { x, y, w, h } (0-1 fractions) | null
Other
  kano           features: Option[], funcQ: string, dysQ: string, askImportance: boolean
  timed_task     url: string ("" for an off-screen task), limitSec: number|null, benchmarkSec: number|null, allowGiveUp: boolean, showTimer: boolean
  prototype_task prototypeId, startScreen, goalScreens, expectedPath, allowGiveUp  (set up the prototype in the app)

Study settings: { language: "es"|"en" (what participants see), brand?: { color?: "#RRGGBB" } }.
Tip: read an existing study with get_study to copy its exact shape.`;
