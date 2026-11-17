import { describe, expect, it } from "vitest";
import { CENTER, clampCrop, cropStyle, dragCrop, parseAvatar, withCrop } from "./avatarCrop";

describe("avatar crop", () => {
  it("round-trips through the address and keeps a centered photo plain", () => {
    const url = withCrop("/uploads/abc.gif", { x: 0.42, y: 0.3, z: 1.8 });
    expect(url).toBe("/uploads/abc.gif#c=0.42,0.3,1.8");
    expect(parseAvatar(url)).toEqual({ src: "/uploads/abc.gif", crop: { x: 0.42, y: 0.3, z: 1.8 } });
    expect(withCrop("/uploads/abc.png#c=0.1,0.1,2", CENTER)).toBe("/uploads/abc.png");
    expect(parseAvatar("/uploads/abc.png")).toEqual({ src: "/uploads/abc.png", crop: CENTER });
  });

  it("ignores or clamps a broken fragment instead of breaking the photo", () => {
    expect(parseAvatar("/uploads/a.png#nope").crop).toEqual(CENTER);
    expect(parseAvatar("/uploads/a.png#c=7,0.5,99").crop).toEqual({ x: 1, y: 0.5, z: 4 });
    expect(clampCrop({ x: NaN, y: -1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("only zooms when zoomed, around the chosen point", () => {
    expect(cropStyle(CENTER).transform).toBeUndefined();
    expect(cropStyle({ x: 0.25, y: 0.75, z: 2 })).toMatchObject({ objectPosition: "25.0% 75.0%", transformOrigin: "25.0% 75.0%", transform: "scale(2)" });
  });

  it("drags along the axis that has room: a wide photo moves sideways at zoom 1, a square one only when zoomed", () => {
    // 2:1 photo in a 200px circle: 200px of travel sideways, none up and down.
    const wide = dragCrop(CENTER, 100, 50, 200, 800, 400);
    expect(wide).toEqual({ x: 0, y: 0.5, z: 1 });
    expect(dragCrop(CENTER, 40, 40, 200, 500, 500)).toEqual(CENTER);
    const zoomed = dragCrop({ x: 0.5, y: 0.5, z: 2 }, -50, 50, 200, 500, 500);
    expect(zoomed.x).toBeCloseTo(0.75); expect(zoomed.y).toBeCloseTo(0.25);
  });
});
