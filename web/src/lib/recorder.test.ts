import { describe, expect, it } from "vitest";
import { chunks } from "./recorder";

describe("recording pieces", () => {
  const size = (n: number) => n;
  it("keeps the order and fills each piece up to the limit", () => {
    expect(chunks([4, 4, 4, 4, 4], size, 10)).toEqual([[4, 4], [4, 4], [4]]);
  });
  it("sends an event bigger than the limit on its own, and drops one too big to send at all", () => {
    expect(chunks([1, 15, 1], size, 10)).toEqual([[1], [15], [1]]);
    expect(chunks([1, 25, 1], size, 10)).toEqual([[1, 1]]);
  });
  it("makes no pieces from nothing", () => { expect(chunks([], size, 10)).toEqual([]); });
});
