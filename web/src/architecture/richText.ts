// Formatted text inside a diagram shape, stored as a small, readable markup so plain text from older
// diagrams and from AI apps stays valid:
//   **bold**  *italic*  __underline__  ~~strikethrough~~
//   "- item" for a bulleted line, "1. item" for a numbered one (two spaces of indent per level)
//   a backslash keeps the next character literal (\* is a star, "\- " a line that only starts with a dash)
// Pure functions, shared by the canvas, the editor and the tests. No HTML is ever stored.

export interface Seg { t: string; b?: boolean; i?: boolean; u?: boolean; s?: boolean }
export interface Line { kind: "p" | "ul" | "ol"; depth: number; n?: number; segs: Seg[] }

type Mark = "b" | "i" | "u" | "s";
const DELIMS: [string, Mark][] = [["**", "b"], ["__", "u"], ["~~", "s"], ["*", "i"]];
const LIST_START = /^(\s*)([-*•]|\d+[.)])\s/;

/** Index of the next unescaped `d` in `s` at or after `from`, or -1. */
function findClose(s: string, d: string, from: number): number {
  for (let k = from; k <= s.length - d.length; k++) {
    if (s[k] === "\\") { k++; continue; }
    if (s.startsWith(d, k) && !(d === "*" && s.startsWith("**", k))) return k;
  }
  return -1;
}

/** Inline marks of one line. A delimiter only opens when the same delimiter closes it later on the line. */
export function parseInline(s: string): Seg[] {
  const out: Seg[] = [];
  const on: Record<Mark, boolean> = { b: false, i: false, u: false, s: false };
  let buf = "";
  const push = () => {
    if (!buf) return;
    const seg: Seg = { t: buf };
    (Object.keys(on) as Mark[]).forEach((m) => { if (on[m]) seg[m] = true; });
    out.push(seg); buf = "";
  };
  for (let k = 0; k < s.length; k++) {
    if (s[k] === "\\" && k + 1 < s.length) { buf += s[k + 1]; k++; continue; }
    const hit = DELIMS.find(([d]) => s.startsWith(d, k));
    if (hit) {
      const [d, m] = hit;
      if (on[m]) { push(); on[m] = false; k += d.length - 1; continue; }
      if (findClose(s, d, k + d.length) > k + d.length) { push(); on[m] = true; k += d.length - 1; continue; }
    }
    buf += s[k];
  }
  push();
  return out;
}

export function parseRich(text: string): Line[] {
  return (text ?? "").split("\n").map((raw): Line => {
    if (/^\s*\\/.test(raw) && LIST_START.test(raw.replace("\\", ""))) return { kind: "p", depth: 0, segs: parseInline(raw.replace("\\", "")) };
    const ul = /^(\s*)[-*•]\s+(.*)$/.exec(raw);
    if (ul) return { kind: "ul", depth: Math.floor(ul[1].length / 2), segs: parseInline(ul[2]) };
    const ol = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(raw);
    if (ol) return { kind: "ol", depth: Math.floor(ol[1].length / 2), n: Number(ol[2]), segs: parseInline(ol[3]) };
    return { kind: "p", depth: 0, segs: parseInline(raw) };
  });
}

/** The text without any markup: for search, titles and anything that cannot show formatting. */
export const plainText = (text: string) => parseRich(text).map((l) => l.segs.map((s) => s.t).join("")).join("\n");

const escText = (s: string) => s.replace(/[\\*_~]/g, (c) => `\\${c}`);
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function segsToHtml(segs: Seg[]): string {
  return segs.map((g) => {
    let h = escHtml(g.t);
    if (g.s) h = `<s>${h}</s>`;
    if (g.u) h = `<u>${h}</u>`;
    if (g.i) h = `<i>${h}</i>`;
    if (g.b) h = `<b>${h}</b>`;
    return h;
  }).join("");
}

/** The markup as HTML for the editor (contenteditable). Every character is escaped. */
export function toEditorHtml(text: string): string {
  const lines = parseRich(text);
  let html = "", list: "ul" | "ol" | null = null;
  for (const l of lines) {
    const kind = l.kind === "p" ? null : l.kind;
    if (list && kind !== list) { html += `</${list}>`; list = null; }
    if (kind && !list) { html += `<${kind}>`; list = kind; }
    const inner = segsToHtml(l.segs) || "<br>";
    html += kind ? `<li>${inner}</li>` : `<div>${inner}</div>`;
  }
  if (list) html += `</${list}>`;
  return html;
}

const BLOCK = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "PRE"]);

/** What the editor holds, back as markup: the inverse of toEditorHtml for anything a browser's editor makes. */
export function domToRich(root: Node): string {
  const out: string[] = [];
  let cur: string | null = null, listLine = false;
  const write = (s: string) => { cur = (cur ?? "") + s; };
  const end = () => {
    let line = cur ?? "";
    if (!listLine && LIST_START.test(line)) line = `\\${line}`;
    out.push(line); cur = null; listLine = false;
  };
  const walk = (node: Node, marks: Set<Mark>, lists: { kind: "ul" | "ol"; n: number }[]) => {
    if (node.nodeType === 3) { const t = (node.textContent ?? "").replace(/ /g, " "); if (t) write(wrap(escText(t), marks)); return; }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement, tag = el.tagName;
    if (tag === "BR") { end(); return; }
    const m = new Set(marks);
    const fw = el.style?.fontWeight;
    if (tag === "B" || tag === "STRONG" || fw === "bold" || Number(fw) >= 600) m.add("b");
    if (tag === "I" || tag === "EM" || el.style?.fontStyle === "italic") m.add("i");
    if (tag === "U" || el.style?.textDecoration?.includes("underline")) m.add("u");
    if (tag === "S" || tag === "STRIKE" || tag === "DEL" || el.style?.textDecoration?.includes("line-through")) m.add("s");
    if (tag === "UL" || tag === "OL") {
      if (cur !== null) end();
      const level = { kind: tag === "UL" ? "ul" as const : "ol" as const, n: 0 };
      el.childNodes.forEach((c) => walk(c, m, [...lists, level]));
      if (cur !== null) end();
      return;
    }
    if (tag === "LI") {
      if (cur !== null) end();
      const level = lists.at(-1) ?? { kind: "ul" as const, n: 0 };
      level.n++;
      cur = `${"  ".repeat(Math.max(0, lists.length - 1))}${level.kind === "ul" ? "-" : `${level.n}.`} `;
      listLine = true;
      el.childNodes.forEach((c) => walk(c, m, lists));
      if (cur !== null) end();
      return;
    }
    if (BLOCK.has(tag)) {
      if (cur !== null) end();
      el.childNodes.forEach((c) => walk(c, m, lists));
      if (cur !== null) end();
      return;
    }
    el.childNodes.forEach((c) => walk(c, m, lists));
  };
  root.childNodes.forEach((c) => walk(c, new Set(), []));
  if (cur !== null) end();
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

function wrap(s: string, marks: Set<Mark>): string {
  // Spaces stay outside the marks, so "**bold **" never happens.
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  if (!m[2]) return s;
  let t = m[2];
  if (marks.has("s")) t = `~~${t}~~`;
  if (marks.has("u")) t = `__${t}__`;
  if (marks.has("i")) t = `*${t}*`;
  if (marks.has("b")) t = `**${t}**`;
  return m[1] + t + m[3];
}
