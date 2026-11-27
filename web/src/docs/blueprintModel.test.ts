import { describe, expect, it } from "vitest";
import { LANES, LANE_LABEL, linkLabel, linkPath, liveLinks, removeStage, toggleLink, type BlueprintData, type BStage } from "./blueprintModel";
import { docTemplate } from "./templates";
import { docBlocks, toMarkdown } from "./export";
import { EN } from "../lib/en";

const stage = (id: string, name = ""): BStage => ({ id, name, evidence: "", customer: "", frontstage: "", backstage: "", support: "" });
const a = { stage: "s1", lane: "customer" } as const;
const b = { stage: "s2", lane: "frontstage" } as const;

describe("service blueprint links", () => {
  it("toggles a link on and off, in either direction, and never to itself", () => {
    const one = toggleLink([], a, b, "l1");
    expect(one).toEqual([{ id: "l1", from: a, to: b }]);
    expect(toggleLink(one, b, a, "l2")).toEqual([]);
    expect(toggleLink(one, a, a, "l3")).toBe(one);
  });

  it("drops links to deleted stages or unknown lanes", () => {
    const d: BlueprintData = { stages: [stage("s1"), stage("s2")], links: [
      { id: "ok", from: a, to: b },
      { id: "gone", from: a, to: { stage: "s9", lane: "support" } },
      { id: "bad", from: a, to: { stage: "s2", lane: "nope" as never } },
    ] };
    expect(liveLinks(d).map((l) => l.id)).toEqual(["ok"]);
    expect(liveLinks({ stages: d.stages })).toEqual([]);
    const cut = removeStage(d, "s2");
    expect(cut.stages.map((s) => s.id)).toEqual(["s1"]);
    expect(cut.links?.map((l) => l.id)).toEqual(["gone"]);
    expect(liveLinks(cut)).toEqual([]);
  });

  it("draws a plain line inside a stage, an arrow along a lane and a rounded elbow across", () => {
    const top = { x: 0, y: 0, w: 100, h: 50 }, under = { x: 0, y: 80, w: 100, h: 50 }, next = { x: 124, y: 0, w: 100, h: 50 }, diag = { x: 248, y: 80, w: 100, h: 50 };
    expect(linkPath(under, top, 24)).toEqual({ d: "M50 50V80", arrow: false });
    expect(linkPath(top, next, 24)).toEqual({ d: "M100 25H124", arrow: true });
    expect(linkPath(next, top, 24)).toEqual({ d: "M124 25H100", arrow: true });
    const elbow = linkPath(top, diag, 24);
    expect(elbow.arrow).toBe(true);
    expect(elbow.d.startsWith("M100 25H226Q236 25 236 35V95Q236 105 246 105H248")).toBe(true);
  });

  it("names a link by stage and lane, numbering unnamed stages", () => {
    const d: BlueprintData = { stages: [stage("s1", "Arrival"), stage("s2")] };
    expect(linkLabel(d, { id: "l", from: a, to: b }, (s) => s)).toBe("Arrival · Acciones del cliente → Etapa 2 · Frontstage (visible)");
  });
});

describe("service blueprint template", () => {
  it("has the persona, the blueprint and the opportunity areas", () => {
    const tpl = docTemplate("service_blueprint")!;
    expect(tpl.sections.map((s) => s.id)).toEqual(["who", "photo", "persona", "blueprint", "opportunities"]);
  });

  it("lists the links in exports", () => {
    const tpl = docTemplate("service_blueprint")!;
    const blueprint: BlueprintData = { stages: [{ ...stage("s1", "Arrival"), customer: "Walks in" }, { ...stage("s2", "Review"), frontstage: "Checks the receipt" }], links: [{ id: "l", from: a, to: b }] };
    const md = toMarkdown(docBlocks(tpl, "Return", { blueprint }, "en"));
    expect(md).toContain("Connections between steps");
    expect(md).toContain("Arrival · Customer actions → Review · Frontstage (visible)");
  });

  it("translates every lane and new string", () => {
    for (const k of LANES) expect(EN[LANE_LABEL[k]], k).toBeTruthy();
    const tpl = docTemplate("service_blueprint")!;
    for (const s of [...tpl.instructions, ...tpl.sections.flatMap((x) => [x.title, x.prompt]).filter((x): x is string => !!x)]) expect(EN[s], s).toBeTruthy();
  });
});
