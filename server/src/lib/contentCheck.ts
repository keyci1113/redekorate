/**
 * What the public API checks in study blocks and document content before saving them. The web app's own
 * builder never produces these mistakes, so they are checked here, where scripts and AI apps write: a block
 * or a diagram node the app cannot use would otherwise be saved and break the study or the canvas.
 * Each problem is { path, message }. Checked when an AI app (the MCP server) writes.
 */
import type { Request } from "express";
import { HttpError } from "./http.js";
import { BLOCK_TYPES, DIAGRAM_SHAPES } from "../mcp/reference.js";
import { CANVAS_KINDS, DOC_KINDS } from "../mcp/documentReference.js";

export interface Issue { path: string; message: string }

/** The MCP server's calls to the app say so with this header; the content checks and versions apply to them. */
export const fromAssistant = (req: Request) => req.get("x-redekorate-client") === "mcp";

/** Refuses the request with every problem found, as a 400 with issues. */
export function refuse(issues: Issue[]) {
  if (issues.length) throw new HttpError(400, "Datos inválidos", { issues });
}

/** The operators study logic understands (web/src/blocks/types.ts LogicOp). */
export const LOGIC_OPS = ["is", "is_not", "lt", "gt", "eq", "success", "fail"] as const;
/** Canvas fill colors (web/src/architecture/model.ts COLORS). */
export const DIAGRAM_COLORS = ["none", "gray", "yellow", "orange", "pink", "purple", "blue", "green"] as const;
export const STUDY_LANGUAGES = ["es", "en"] as const;

/** Block fields that hold a list of options, by block type. */
const OPTION_LISTS: Record<string, string[]> = {
  choice: ["options"], dropdown: ["options"], preference: ["options"], ranking: ["items"],
  matrix: ["rows", "columns"], card_sort: ["cards", "categories"], kano: ["features"],
};
/** Lists that need at least two entries for the block to work. */
const MIN_TWO: Record<string, string[]> = { choice: ["options"], dropdown: ["options"], preference: ["options"], matrix: ["columns"] };
/** Blocks whose answer is a number, so lt / gt / eq rules can compare it. */
const NUMERIC = new Set(["scale", "nps"]);
/** Blocks whose answer can succeed or fail. */
const PASS_FAIL = new Set(["tree_test", "first_click", "prototype_task", "timed_task"]);

const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function checkStudy(blocks: unknown, settings?: unknown): Issue[] {
  const out: Issue[] = [];
  const bad = (path: string, message: string) => out.push({ path, message });
  if (settings !== undefined) {
    if (!isObj(settings)) bad("settings", "Must be an object");
    else if (settings.language !== undefined && !STUDY_LANGUAGES.includes(settings.language))
      bad("settings.language", `Must be one of: ${STUDY_LANGUAGES.join(", ")}`);
  }
  if (blocks === undefined) return out;
  if (!Array.isArray(blocks)) return [{ path: "blocks", message: "Must be an array of blocks" }];

  const ids = blocks.map((b) => (isObj(b) ? b.id : undefined));
  const seen = new Set<unknown>();
  blocks.forEach((b, i) => {
    const at = `blocks.${i}`;
    if (!isObj(b)) return bad(at, "Must be an object");
    if (typeof b.id !== "string" || !b.id) bad(`${at}.id`, "Must be a non-empty string");
    else if (seen.has(b.id)) bad(`${at}.id`, `"${b.id}" is used by another block; ids must be unique`);
    seen.add(b.id);
    if (!BLOCK_TYPES.includes(b.type)) return bad(`${at}.type`, `Unknown block type. One of: ${BLOCK_TYPES.join(", ")}`);
    if (typeof b.title !== "string") bad(`${at}.title`, "Must be a string");
    if (b.type === "welcome" && i !== 0) bad(at, "welcome can only be the first block");
    if (b.type === "thank_you" && i !== blocks.length - 1) bad(at, "thank_you can only be the last block");

    for (const key of OPTION_LISTS[b.type] ?? []) {
      const list = b[key];
      if (!Array.isArray(list)) { bad(`${at}.${key}`, "Must be an array of { id, label }"); continue; }
      const optIds = new Set<unknown>();
      list.forEach((o: unknown, j: number) => {
        if (!isObj(o) || typeof o.id !== "string" || !o.id || typeof o.label !== "string") bad(`${at}.${key}.${j}`, "Must be { id: string, label: string }");
        else if (optIds.has(o.id)) bad(`${at}.${key}.${j}.id`, `"${o.id}" is repeated in this list`);
        else optIds.add(o.id);
      });
      if ((MIN_TWO[b.type] ?? []).includes(key) && list.length < 2) bad(`${at}.${key}`, "Needs at least 2 entries");
    }
    if (b.type === "scale") {
      if (!isNum(b.min) || !isNum(b.max)) bad(at, "scale needs numbers min and max");
      else if (b.min >= b.max) bad(`${at}.max`, "max must be greater than min");
    }

    if (b.logic === undefined || b.logic === null) return;
    if (!isObj(b.logic) || !Array.isArray(b.logic.rules)) return bad(`${at}.logic`, "Must be { rules: [...], otherwise? }");
    const ahead = new Set(ids.slice(i + 1));
    const target = (path: string, to: unknown) => {
      if (to === "end") return;
      if (typeof to !== "string" || !ids.includes(to)) bad(path, `No block "${String(to)}" in this study; use a later block's id or "end"`);
      else if (!ahead.has(to)) bad(path, "Logic only jumps forward: the participant would never go back, so the app ignores this jump");
    };
    const optionIds = new Set<string>((b.type === "choice" || b.type === "dropdown" || b.type === "preference" ? b.options : [])?.map?.((o: any) => o?.id) ?? []);
    b.logic.rules.forEach((r: unknown, j: number) => {
      const rp = `${at}.logic.rules.${j}`;
      if (!isObj(r)) return bad(rp, "Must be { id, op, value?, goTo }");
      if (!LOGIC_OPS.includes(r.op)) return bad(`${rp}.op`, `Must be one of: ${LOGIC_OPS.join(", ")}`);
      target(`${rp}.goTo`, r.goTo);
      if (r.op === "is" || r.op === "is_not") {
        if (b.type === "yes_no") { if (r.value !== "yes" && r.value !== "no") bad(`${rp}.value`, "On yes_no the value is \"yes\" or \"no\""); }
        else if (optionIds.size) { if (!optionIds.has(String(r.value))) bad(`${rp}.value`, "Must be the id of one of this block's options"); }
        else bad(`${rp}.op`, `"${r.op}" only works on choice, dropdown, preference and yes_no blocks`);
      }
      if ((r.op === "lt" || r.op === "gt" || r.op === "eq") && (!NUMERIC.has(b.type) || !isNum(Number(r.value)) || r.value === "" || r.value === undefined))
        bad(rp, `"${r.op}" compares a number: use it on scale or nps blocks with a numeric value`);
      if ((r.op === "success" || r.op === "fail") && !PASS_FAIL.has(b.type))
        bad(`${rp}.op`, `"${r.op}" only works on ${[...PASS_FAIL].join(", ")} blocks`);
    });
    if (b.logic.otherwise !== undefined && b.logic.otherwise !== null) target(`${at}.logic.otherwise`, b.logic.otherwise);
  });
  return out;
}

/** Document content for its kind: canvases need nodes and edges the canvas can draw, research documents their own section keys. */
export function checkDocument(kind: string, data: unknown): Issue[] {
  if (data === undefined) return [];
  if (!isObj(data)) return [{ path: "data", message: "Must be an object" }];
  if (kind === "sitemap") return data.outline === undefined || typeof data.outline === "string" ? [] : [{ path: "data.outline", message: "Must be a string" }];
  if ((CANVAS_KINDS as readonly string[]).includes(kind)) return checkCanvas(data);
  const k = DOC_KINDS[kind];
  if (!k) return [];   // an old document of a kind the app no longer has: nothing to check against
  const out: Issue[] = [];
  const sections = new Map(k.sections.map((s) => [s.id, s]));
  for (const [key, value] of Object.entries(data)) {
    const s = sections.get(key);
    if (!s) { out.push({ path: `data.${key}`, message: `${kind} has no section "${key}". Sections: ${[...sections.keys()].join(", ")} (see document_reference)` }); continue; }
    if (value === null) continue;
    const want = ["text", "image"].includes(s.type) ? "string" : ["fields", "custom"].includes(s.type) ? "object" : "array";
    const ok = want === "string" ? typeof value === "string" : want === "object" ? isObj(value) : Array.isArray(value);
    if (!ok) out.push({ path: `data.${key}`, message: `Must be ${want === "array" ? "an array" : `a${want === "object" ? "n object" : " string"}`} (see document_reference)` });
    else if ((s.type === "list" || s.type === "chips") && (value as unknown[]).some((x) => typeof x !== "string"))
      out.push({ path: `data.${key}`, message: "Must be an array of strings" });
  }
  return out;
}

function checkCanvas(data: Record<string, any>): Issue[] {
  const out: Issue[] = [];
  const bad = (path: string, message: string) => out.push({ path, message });
  if (!Array.isArray(data.nodes)) bad("data.nodes", "Must be an array of nodes (see diagram_reference)");
  if (data.edges !== undefined && !Array.isArray(data.edges)) bad("data.edges", "Must be an array of edges");
  if (out.length) return out;
  const ids = new Set<string>();
  data.nodes.forEach((n: unknown, i: number) => {
    const at = `data.nodes.${i}`;
    if (!isObj(n)) return bad(at, "Must be an object");
    if (typeof n.id !== "string" || !n.id) bad(`${at}.id`, "Must be a non-empty string");
    else if (ids.has(n.id)) bad(`${at}.id`, `"${n.id}" is used by another node`);
    else ids.add(n.id);
    if (!DIAGRAM_SHAPES.includes(n.shape)) bad(`${at}.shape`, `Must be one of: ${DIAGRAM_SHAPES.join(", ")}`);
    if (!isNum(n.x) || !isNum(n.y)) bad(at, "Needs numbers x and y (its top-left corner)");
    for (const k of ["w", "h"]) if (n[k] !== undefined && !(isNum(n[k]) && n[k] > 0)) bad(`${at}.${k}`, "Must be a positive number");
    if (n.color !== undefined && !DIAGRAM_COLORS.includes(n.color)) bad(`${at}.color`, `Must be one of: ${DIAGRAM_COLORS.join(", ")}`);
    if (n.text !== undefined && typeof n.text !== "string") bad(`${at}.text`, "Must be a string");
  });
  (data.edges ?? []).forEach((e: unknown, i: number) => {
    const at = `data.edges.${i}`;
    if (!isObj(e)) return bad(at, "Must be an object");
    for (const end of ["from", "to"]) if (!ids.has(e[end])) bad(`${at}.${end}`, `No node "${String(e[end])}" in this diagram`);
  });
  return out;
}
