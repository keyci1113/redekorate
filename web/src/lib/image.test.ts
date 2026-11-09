import { describe, expect, it } from "vitest";
import { MAX_SIDE, SKIP_UNDER_BYTES, chooseResult, planResize, renameForType, shouldOptimize, targetFormat } from "./image";

describe("planResize", () => {
  it("leaves images that already fit alone", () => {
    expect(planResize({ width: 780, height: 1688 })).toBeNull();
    expect(planResize({ width: MAX_SIDE, height: 100 })).toBeNull();
    expect(planResize({ width: 0, height: 0 })).toBeNull();
  });
  it("scales the longest side down to MAX_SIDE and keeps the ratio", () => {
    expect(planResize({ width: 2880, height: 1800 })).toEqual({ width: 2048, height: 1280 });
    expect(planResize({ width: 1000, height: 4096 })).toEqual({ width: 500, height: 2048 });
  });
  it("never produces a zero dimension", () => {
    expect(planResize({ width: 1, height: 100000 })!.width).toBe(1);
  });
});

describe("targetFormat", () => {
  it("prefers WebP when the browser can encode it", () => {
    expect(targetFormat("image/png", true)?.type).toBe("image/webp");
    expect(targetFormat("image/jpeg", true)?.type).toBe("image/webp");
  });
  it("keeps alpha-capable sources as PNG without WebP, photos become JPEG", () => {
    expect(targetFormat("image/png", false)).toEqual({ type: "image/png" });
    expect(targetFormat("image/webp", false)).toEqual({ type: "image/png" });
    expect(targetFormat("image/jpeg", false)?.type).toBe("image/jpeg");
  });
  it("never touches GIF or SVG", () => {
    expect(targetFormat("image/gif", true)).toBeNull();
    expect(targetFormat("image/svg+xml", true)).toBeNull();
  });
});

describe("chooseResult", () => {
  it("keeps the original when re-encoding did not shrink it", () => {
    expect(chooseResult(1000, 1200, false)).toBe("original");
    expect(chooseResult(1000, 1000, false)).toBe("original");
    expect(chooseResult(1000, 600, false)).toBe("candidate");
  });
  it("always takes a resized candidate, even a bigger one, so dimensions stay capped", () => {
    expect(chooseResult(1000, 1200, true)).toBe("candidate");
  });
});

describe("renameForType", () => {
  it("swaps the extension and keeps the base name used for screen names", () => {
    expect(renameForType("Home - v2.PNG", "image/webp")).toBe("Home - v2.webp");
    expect(renameForType("photo.jpeg", "image/jpeg")).toBe("photo.jpg");
    expect(renameForType("noext", "image/png")).toBe("noext.png");
  });
});

describe("shouldOptimize", () => {
  it("skips small files and non-images, but not oversized small ones", () => {
    expect(shouldOptimize({ type: "image/png", size: SKIP_UNDER_BYTES - 1 })).toBe(false);
    expect(shouldOptimize({ type: "image/png", size: SKIP_UNDER_BYTES })).toBe(true);
    expect(shouldOptimize({ type: "text/html", size: 10_000_000 })).toBe(false);
    expect(shouldOptimize({ type: "image/gif", size: 10_000_000 })).toBe(false);
    expect(shouldOptimize({ type: "image/png", size: 1000 }, { width: 5000, height: 100 })).toBe(true);
  });
});
