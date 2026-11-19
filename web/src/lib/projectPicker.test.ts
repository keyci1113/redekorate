import { describe, expect, it } from "vitest";
import { pickerProjects } from "./projectPicker";
import { splitTabs } from "../components/ui";

describe("Nuevo estudio picker", () => {
  const ps = Array.from({ length: 15 }, (_, i) => ({ id: `p${i}` }));
  it("lists the current project first, then the rest, 12 at most", () => {
    const out = pickerProjects(ps, "p13");
    expect(out[0].id).toBe("p13");
    expect(out).toHaveLength(12);
    expect(pickerProjects(ps).map((p) => p.id).slice(0, 2)).toEqual(["p0", "p1"]);
  });
});

describe("tab overflow", () => {
  it("keeps every tab when all fit", () => {
    expect(splitTabs([100, 100, 100], 300)).toEqual({ visible: [0, 1, 2], overflow: [] });
  });
  it("moves the rest into Más, leaving room for the button to name any of them", () => {
    // 500 px minus the Más button showing a 100 px tab's name (124) leaves room for three 100 px tabs.
    expect(splitTabs(Array(12).fill(100), 500)).toEqual({ visible: [0, 1, 2], overflow: [3, 4, 5, 6, 7, 8, 9, 10, 11] });
    // A 200 px tab in Más needs 224 px for the button: two 60 px tabs fit beside it in 400 px, not five.
    expect(splitTabs([60, 60, 60, 60, 60, 200], 400)).toEqual({ visible: [0, 1], overflow: [2, 3, 4, 5] });
  });
  it("keeps at least one tab visible", () => {
    expect(splitTabs([300, 300], 200).visible).toEqual([0]);
  });
});
