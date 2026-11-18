import { describe, expect, it } from "vitest";
import type { Block } from "./types";
import { blockDef } from "./registry";
import { nextHint } from "./nextHint";

const sort = { ...blockDef("card_sort")!.create(), required: true, requireAll: true, cards: Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, label: `C${i}` })) } as Block;

// Tests run with the English interface (no Spanish navigator), which also checks the translations exist.
describe("why Siguiente is disabled", () => {
  it("counts the cards still to sort", () => {
    expect(nextHint(sort, { groups: [{ id: "g", name: "A", cardIds: ["c0", "c1", "c2"], custom: true }] }, false)).toBe("Sort all the cards (3 of 8)");
  });
  it("asks for group names once every card is placed", () => {
    const all = Array.from({ length: 8 }, (_, i) => `c${i}`);
    expect(nextHint(sort, { groups: [{ id: "g", name: " ", cardIds: all, custom: true }] }, false)).toBe("Give each group a name");
  });
  it("says nothing when the block can go on", () => {
    expect(nextHint(sort, undefined, true)).toBeNull();
    expect(nextHint({ ...sort, required: false } as Block, undefined, false)).toBeNull();
  });
});
