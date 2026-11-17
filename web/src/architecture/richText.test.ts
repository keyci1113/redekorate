import { describe, expect, test } from "vitest";
import { domToRich, parseInline, parseRich, plainText, toEditorHtml } from "./richText";
import { normalizeDiagram } from "./model";

// A tiny stand-in for the DOM a browser's editor builds: enough for domToRich, no test dependency.
type FakeNode = { nodeType: number; tagName?: string; textContent?: string; style?: Record<string, string>; childNodes: FakeNode[] & { forEach: FakeNode[]["forEach"] } };
const txt = (s: string): FakeNode => ({ nodeType: 3, textContent: s, childNodes: [] as unknown as FakeNode["childNodes"] });
const el = (tag: string, ...kids: (FakeNode | string)[]): FakeNode => ({
  nodeType: 1, tagName: tag.toUpperCase(), style: {}, childNodes: kids.map((k) => (typeof k === "string" ? txt(k) : k)) as FakeNode["childNodes"],
});
const md = (...kids: (FakeNode | string)[]) => domToRich(el("div", ...kids) as unknown as Node);

describe("inline marks", () => {
  test("bold, italic, underline and strikethrough, alone and nested", () => {
    expect(parseInline("a **b** *c* __d__ ~~e~~")).toEqual([
      { t: "a " }, { t: "b", b: true }, { t: " " }, { t: "c", i: true }, { t: " " }, { t: "d", u: true }, { t: " " }, { t: "e", s: true },
    ]);
    expect(parseInline("***both***")).toEqual([{ t: "both", b: true, i: true }]);
  });
  test("an unclosed or escaped delimiter is just text", () => {
    expect(parseInline("5 * 3 = 15")).toEqual([{ t: "5 * 3 = 15" }]);
    expect(parseInline("snake_case and __init")).toEqual([{ t: "snake_case and __init" }]);
    expect(parseInline("\\*\\*not bold\\*\\*")).toEqual([{ t: "**not bold**" }]);
  });
});

describe("lines", () => {
  test("bullets, numbers and indent levels", () => {
    expect(parseRich("Title\n- one\n  - nested\n1. first\n2) second").map((l) => [l.kind, l.depth, l.n ?? null])).toEqual([
      ["p", 0, null], ["ul", 0, null], ["ul", 1, null], ["ol", 0, 1], ["ol", 0, 2],
    ]);
  });
  test("plain text from older diagrams reads the same", () => {
    const old = "1. Set up the crop year\nGrowers, ranches, special prices";
    expect(plainText("Grower Relations\nhome")).toBe("Grower Relations\nhome");
    expect(parseRich(old)[1]).toEqual({ kind: "p", depth: 0, segs: [{ t: "Growers, ranches, special prices" }] });
  });
  test("a backslash keeps a line that only looks like a list item as text", () => {
    expect(parseRich("\\- not a bullet")[0]).toEqual({ kind: "p", depth: 0, segs: [{ t: "- not a bullet" }] });
  });
});

describe("editor round trip", () => {
  test("HTML for the editor escapes everything", () => {
    expect(toEditorHtml("<script>**x**</script>")).toBe("<div>&lt;script&gt;<b>x</b>&lt;/script&gt;</div>");
    expect(toEditorHtml("- a\n- b\nend")).toBe("<ul><li>a</li><li>b</li></ul><div>end</div>");
    expect(toEditorHtml("a\n\nb")).toBe("<div>a</div><div><br></div><div>b</div>");
  });
  test("what a browser's editor builds comes back as markup", () => {
    // Chrome: first line as a bare text node, then one div per line, an empty line as <div><br></div>
    expect(md("Plan", el("div", el("b", "Owner:"), " Ana"), el("div", el("br")), el("div", el("i", el("u", "soon"))))).toBe("Plan\n**Owner:** Ana\n\n*__soon__*");
    expect(md(el("ul", el("li", "one"), el("li", el("s", "two"))), el("ol", el("li", "x"), el("li", "y")))).toBe("- one\n- ~~two~~\n1. x\n2. y");
    expect(md(el("div", "a", el("br")), el("div", "b"))).toBe("a\nb");
  });
  test("stars and dashes typed as text stay text", () => {
    const back = md(el("div", "2 * 3"), el("div", "- not a list"));
    expect(back).toBe("2 \\* 3\n\\- not a list");
    expect(plainText(back)).toBe("2 * 3\n- not a list");
  });
  test("spaces stay outside the marks", () => {
    expect(md(el("b", "bold "), "word")).toBe("**bold** word");
  });
});

describe("text settings on a shape", () => {
  test("alignment, vertical position, size and color are kept; unknown values are dropped", () => {
    const d = normalizeDiagram({ nodes: [
      { id: "a", shape: "rect", text: "**x**", align: "right", valign: "bottom", size: "xl", textColor: "red" },
      { id: "b", shape: "rect", text: "y", align: "justify", valign: "up", size: "huge", textColor: "auto" },
    ], edges: [] });
    expect(d.nodes[0]).toMatchObject({ text: "**x**", align: "right", valign: "bottom", size: "xl", textColor: "red" });
    expect(d.nodes[1]).toMatchObject({ size: "m" });
    expect(d.nodes[1]).not.toHaveProperty("align");
    expect(d.nodes[1]).not.toHaveProperty("valign");
    expect(d.nodes[1]).not.toHaveProperty("textColor");
  });
});
