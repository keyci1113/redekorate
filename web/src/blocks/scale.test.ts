import { describe, expect, it } from "vitest";
import { scaleRange, styleLimitsRange } from "./scale";

describe("scale style switch", () => {
  it("keeps the stored range when emoji limits what shows", () => {
    const b = { style: "emoji" as const, min: 0, max: 10 };
    expect(scaleRange(b)).toEqual({ min: 1, max: 5 });
    expect(styleLimitsRange(b)).toBe(true);
    // Back to numbers: the stored 0–10 comes back untouched.
    expect(scaleRange({ ...b, style: "numbers" })).toEqual({ min: 0, max: 10 });
    expect(styleLimitsRange({ ...b, style: "stars" })).toBe(false);
  });
  it("has nothing to explain when the range already is 1–5", () => {
    expect(styleLimitsRange({ style: "emoji", min: 1, max: 5 })).toBe(false);
  });
});
