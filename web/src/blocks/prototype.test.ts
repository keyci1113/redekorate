import { describe, expect, it } from "vitest";
import { flowToTask, isDirect, matchStep, resolveTask, stepsComplete, type Prototype, type PrototypeTaskValue } from "./prototype";
import type { PrototypeTaskBlock } from "./types";

const proto = (flow?: Prototype["flow"]): Prototype => ({ id: "p", name: "P", device: "mobile", showHints: true, screens: [], kind: "html", flow });
const val = (steps?: { i: number; t: number }[]): PrototypeTaskValue => ({ outcome: "success", path: [], clicks: [], ms: 1000, steps });

describe("flowToTask", () => {
  const S = (id: string, screen: string) => ({ id, kind: "screen" as const, screen });
  const T = (id: string, label: string, screen?: string) => ({ id, kind: "tap" as const, label, ...(screen ? { screen } : {}) });
  it("returns null when the flow is empty", () => {
    expect(flowToTask(undefined)).toBeNull();
    expect(flowToTask(proto())).toBeNull();
    expect(flowToTask(proto({ items: [], instructions: "only text" }))).toBeNull();
  });
  it("maps screens to the expected path, taps to steps, and the goal to a screen or a tap", () => {
    expect(flowToTask(proto({ items: [S("a", "h:Login"), T("b", "Order Checklist", "h:Orders"), S("c", "h:Orders")], startId: "a", goalId: "c", instructions: " Find it " })))
      .toEqual({ startScreen: "h:Login", goalScreens: ["h:Orders"], expectedPath: ["h:Login", "h:Orders"], steps: [{ label: "Order Checklist", screen: "h:Orders" }], goalClick: undefined, description: "Find it" });
    expect(flowToTask(proto({ items: [S("a", "h:Opp"), T("b", "Order Checklist"), T("c", "Edit configuration")], goalId: "c" })))
      .toMatchObject({ goalScreens: [], expectedPath: [], steps: [{ label: "Order Checklist" }], goalClick: { label: "Edit configuration" } });
  });
  it("accepts the legacy shape and a tap as the start (it becomes the first step)", () => {
    expect(flowToTask(proto({ start: "h:A", goal: "h:B", path: [], steps: [{ label: "Tab" }] } as unknown as Prototype["flow"])))
      .toMatchObject({ goalScreens: ["h:B"], expectedPath: ["h:A", "h:B"], steps: [{ label: "Tab" }] });
    expect(flowToTask(proto({ items: [T("a", "Open menu"), S("b", "h:Settings")], startId: "a", goalId: "b" })))
      .toMatchObject({ startScreen: "", goalScreens: ["h:Settings"], expectedPath: [], steps: [{ label: "Open menu" }] });
  });
});

describe("matchStep", () => {
  it("matches element text ignoring case and spacing, and allows partial labels", () => {
    expect(matchStep({ label: "Order Checklist" }, "h:Opp", "order  checklist")).toBe(true);
    expect(matchStep({ label: "Order Checklist" }, "h:Opp", "Order Checklist (3)")).toBe(true);
    expect(matchStep({ label: "Order Checklist (3)" }, "h:Opp", "Order Checklist")).toBe(true);
    expect(matchStep({ label: "Order Checklist" }, "h:Opp", "Overview")).toBe(false);
  });
  it("treats the step's screen as informational and never matches empty text", () => {
    expect(matchStep({ label: "Sign in", screen: "h:Login" }, "h:Login", "Sign in")).toBe(true);
    expect(matchStep({ label: "Order Checklist", screen: "h:Deal A" }, "h:Deal B", "Order Checklist")).toBe(true);
    expect(matchStep({ label: "Sign in" }, null, "Sign in")).toBe(true);
    expect(matchStep({ label: "Sign in" }, "h:Login", "")).toBe(false);
    expect(matchStep({ label: "  " }, "h:Login", "Sign in")).toBe(false);
  });
});

describe("stepsComplete", () => {
  it("is true with no required steps, and only when every step was done", () => {
    expect(stepsComplete(val(), undefined)).toBe(true);
    expect(stepsComplete(val(), [])).toBe(true);
    expect(stepsComplete(val([{ i: 0, t: 10 }]), [{ label: "a" }, { label: "b" }])).toBe(false);
    expect(stepsComplete(val([{ i: 0, t: 10 }, { i: 1, t: 20 }]), [{ label: "a" }, { label: "b" }])).toBe(true);
  });
});

describe("resolveTask", () => {
  const task = (over: Partial<PrototypeTaskBlock> = {}): PrototypeTaskBlock => ({ id: "b", type: "prototype_task", title: "T", description: "", required: true, prototypeId: "p", startScreen: "", goalScreens: [], expectedPath: [], allowGiveUp: true, ...over } as PrototypeTaskBlock);
  const flowProto = proto({ items: [{ id: "a", kind: "screen", screen: "h:Home" }, { id: "b", kind: "tap", label: "Order Checklist" }], startId: "a", goalId: "b", instructions: "Find it" });
  it("fills an empty task from the prototype flow, keeping its own description when present", () => {
    expect(resolveTask(task(), flowProto)).toMatchObject({ startScreen: "h:Home", goalClick: { label: "Order Checklist" }, steps: [], description: "Find it" });
    expect(resolveTask(task({ description: "Mine" }), flowProto).description).toBe("Mine");
  });
  it("leaves a task alone when it has its own settings or the prototype is not HTML", () => {
    const own = task({ goalScreens: ["h:X"] });
    expect(resolveTask(own, flowProto)).toBe(own);
    expect(resolveTask(task(), { ...flowProto, kind: "screens" })).toEqual(task());
  });
});

describe("isDirect", () => {
  it("never counts a self-declared success as direct", () => {
    const v: PrototypeTaskValue = { outcome: "success", path: [{ s: "h:A", t: 0 }, { s: "h:B", t: 500 }], clicks: [], ms: 600 };
    expect(isDirect(v, ["h:A", "h:B"])).toBe(true);
    expect(isDirect({ ...v, claimed: true }, ["h:A", "h:B"])).toBe(false);
  });
});
