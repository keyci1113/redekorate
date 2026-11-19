import { describe, expect, it } from "vitest";
import type { Block } from "./types";
import { blockDef } from "./registry";
import { blockSeconds, defaultGoTo, estimateMinutes, noopLogic } from "./review";
import { validateStudy } from "./validate";

const make = (type: Block["type"], patch: Record<string, unknown> = {}) => ({ ...blockDef(type)!.create(), ...patch }) as Block;
const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, label: `Card ${i}` }));

describe("time estimate", () => {
  it("counts a card sort at about a minute per five cards", () => {
    expect(blockSeconds(make("card_sort", { cards: cards(40) }))).toBe(480);
    expect(estimateMinutes([make("welcome"), make("card_sort", { mode: "open", cards: cards(50) }), make("thank_you")])).toBe(10);
  });
  it("gives open questions more time than choices", () => {
    expect(blockSeconds(make("open_question"))).toBe(45);
    expect(blockSeconds(make("choice"))).toBe(10);
  });
  it("never says less than a minute", () => {
    expect(estimateMinutes([make("welcome")])).toBe(1);
    expect(estimateMinutes([])).toBe(1);
  });
});

describe("logic that changes nothing", () => {
  const a = make("choice", { id: "a" }), b = make("open_question", { id: "b" }), c = make("open_question", { id: "c" });
  it("flags a rule that goes to the next block when there is no otherwise", () => {
    const withRule = { ...a, logic: { rules: [{ id: "r1", op: "is", value: "x", goTo: "b" }] } } as Block;
    expect(noopLogic([withRule, b, c], 0).rules.map((r) => r.id)).toEqual(["r1"]);
  });
  it("flags a rule with the same target as otherwise, and an otherwise pointing at the next block", () => {
    const blk = { ...a, logic: { rules: [{ id: "r1", op: "is", value: "x", goTo: "c" }], otherwise: "c" } } as Block;
    expect(noopLogic([blk, b, c], 0)).toEqual({ rules: [expect.objectContaining({ id: "r1" })], otherwise: false });
    const next = { ...a, logic: { rules: [], otherwise: "b" } } as Block;
    expect(noopLogic([next, b, c], 0).otherwise).toBe(true);
  });
  it("leaves a real jump alone", () => {
    const blk = { ...a, logic: { rules: [{ id: "r1", op: "is", value: "x", goTo: "c" }] } } as Block;
    expect(noopLogic([blk, b, c], 0)).toEqual({ rules: [], otherwise: false });
  });
  it("defaults a new rule to the block after the next one, else the end", () => {
    expect(defaultGoTo([a, b, c], 0)).toBe("c");
    expect(defaultGoTo([a, b, c], 1)).toBe("end");
  });
});

describe("pre-publish review", () => {
  it("warns when a card sort has fewer than 30 cards", () => {
    const issues = validateStudy([make("welcome"), make("card_sort", { mode: "open", cards: cards(8) }), make("thank_you")]);
    expect(issues.some((i) => i.level === "warning" && /30–50/.test(i.message))).toBe(true);
    const fine = validateStudy([make("welcome"), make("card_sort", { mode: "open", cards: cards(35) }), make("thank_you")]);
    expect(fine.filter((i) => /30–50/.test(i.message))).toEqual([]);
  });
  it("warns about a no-op logic rule", () => {
    const q = make("yes_no", { id: "q", logic: { rules: [{ id: "r", op: "is", value: "yes", goTo: "n" }] } });
    const issues = validateStudy([make("welcome"), q, make("open_question", { id: "n" }), make("thank_you")]);
    expect(issues.some((i) => i.blockId === "q" && i.level === "warning")).toBe(true);
  });
});
