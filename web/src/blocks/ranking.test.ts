import { describe, expect, it } from "vitest";
import { rankSlot, rankTarget } from "./ranking";

const rows = { tops: [0, 60, 120, 180], heights: [52, 52, 52, 52] };

describe("rankTarget", () => {
  it("stays put until the row crosses a neighbour's middle", () => {
    expect(rankTarget({ ...rows, from: 1, dy: 0 })).toBe(1);
    expect(rankTarget({ ...rows, from: 1, dy: 50 })).toBe(1);
    expect(rankTarget({ ...rows, from: 1, dy: 70 })).toBe(2);
    expect(rankTarget({ ...rows, from: 1, dy: -70 })).toBe(0);
  });
  it("reaches both ends", () => {
    expect(rankTarget({ ...rows, from: 0, dy: 180 })).toBe(3);
    expect(rankTarget({ ...rows, from: 3, dy: -180 })).toBe(0);
  });
  it("handles rows of different heights", () => {
    const tall = { tops: [0, 60, 180], heights: [52, 112, 52] };
    expect(rankTarget({ ...tall, from: 0, dy: 80 })).toBe(0);
    expect(rankTarget({ ...tall, from: 0, dy: 100 })).toBe(1);
  });
});

describe("rankSlot", () => {
  it("gives every row a distinct slot", () => {
    for (let from = 0; from < 5; from++) for (let to = 0; to < 5; to++) {
      const slots = [0, 1, 2, 3, 4].map((j) => rankSlot(j, from, to));
      expect([...slots].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(slots[from]).toBe(to);
    }
  });
  it("moves only the rows in between", () => {
    expect([0, 1, 2, 3].map((j) => rankSlot(j, 0, 2))).toEqual([2, 0, 1, 3]);
    expect([0, 1, 2, 3].map((j) => rankSlot(j, 3, 1))).toEqual([0, 2, 3, 1]);
  });
});
