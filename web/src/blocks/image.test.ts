import { describe, expect, it } from "vitest";
import { imageSize, imageStyle } from "./image";

describe("block image size", () => {
  it("is automatic until a size is chosen", () => {
    expect(imageSize({ url: "/uploads/a.png" })).toBeNull();
    expect(imageStyle({ url: "/uploads/a.png" })).toBeUndefined();
    expect(imageSize(null)).toBeNull();
  });
  it("keeps the chosen size within limits", () => {
    expect(imageStyle({ url: "a", size: 60 })).toEqual({ width: "60%" });
    expect(imageSize({ url: "a", size: 500 })).toBe(100);
    expect(imageSize({ url: "a", size: 3 })).toBe(20);
    expect(imageSize({ url: "a", size: "x" as unknown as number })).toBeNull();
  });
});
