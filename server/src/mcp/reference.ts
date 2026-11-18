/**
 * What an outside assistant needs to know to build a study: the block shapes the builder and runner use
 * (web/src/blocks/types.ts) and the method keys the template catalog uses (web/src/templates/catalog.ts).
 * reference.test.ts fails when either file gains a type or key that is missing here.
 */

export const BLOCK_TYPES = [
  "welcome", "context", "thank_you",
  "open_question", "choice", "dropdown", "yes_no", "scale", "ranking", "matrix",
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
  dropdown       options: Option[], allowOther: boolean, placeholder?: string   (one answer from a list that stays closed; for long lists)
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

/** The shapes the Architecture canvas draws (web/src/architecture/model.ts SHAPES); reference.test.ts keeps the two lists equal. */
export const DIAGRAM_SHAPES = [
  "rect", "rounded", "ellipse", "diamond", "triangle", "parallelogram", "hexagon", "cylinder",
  "page", "pages", "note", "text", "frame", "image", "swatch", "link",
] as const;

export const DIAGRAM_REFERENCE = `The Architecture section holds three document kinds; create them with create_document and edit them with update_document.

kind "diagram": a canvas of shapes joined by arrows (flowcharts, user flows, system architecture, IA diagrams).
  data: { nodes: Node[], edges: Edge[] }
  Node  { id: string, shape, x: number, y: number, w: number, h: number, text: string, color, size?: "s"|"m"|"l" }
        x, y = top-left corner in canvas pixels (y grows downward); a typical shape is 160 x 80, keep ~60 px between shapes.
  shape ${DIAGRAM_SHAPES.join(" | ")}
        rounded = process step, diamond = decision, parallelogram = input/output, cylinder = database,
        page / pages = a page / a group of pages (information architecture), note = sticky note,
        text = free text with no outline, frame = a labelled area drawn behind the shapes inside it,
        image = a picture (src), swatch = a color sample (hex), link = a web page (url); they belong on mood boards.
  color none | gray | yellow | orange | pink | purple | blue | green
  Text settings (all optional): size "s"|"m"|"l"|"xl", align "left"|"center"|"right", valign "top"|"middle"|"bottom",
        textColor "ink"|"gray"|"red"|"orange"|"green"|"blue"|"purple"|"white" (leave it out to follow the fill).
  Formatting inside text: **bold**, *italic*, __underline__, ~~strikethrough~~; a line starting "- " is a bullet and
        "1. " a numbered item (indent two spaces per level); a backslash keeps the next character literal.
  Edge  { id: string, from: nodeId, to: nodeId, fromSide?: "top"|"right"|"bottom"|"left", toSide?: same,
          label?: string, line?: "solid"|"dashed", arrow?: "end"|"both"|"none", path?: "elbow"|"curved"|"straight" }

kind "moodboard": a visual direction board on the same canvas, with the same data as "diagram" (usually no edges).
  Extra node fields: image { src: "/uploads/..." or an https address, text = caption },
        swatch { hex: "#rrggbb", text = color name }, link { url: http(s) address, text = title }.
  Put each design direction in its own frame: the app turns each frame that holds items into one option
        of a preference test when the team tests the board with participants.

kind "sitemap": information architecture written as an outline; the app draws the tree.
  data: { outline: string }   one page per line, two spaces of indent per level, e.g. "Home\n  Products\n    Detail\n  Contact"

Read an existing diagram with get_document to copy its exact shape.`;
