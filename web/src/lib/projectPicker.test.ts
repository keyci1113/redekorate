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
    expect(splitTabs(4, 4, 2)).toEqual({ visible: [0, 1, 2, 3], overflow: [] });
  });
  it("moves the rest into Más and keeps the active tab visible", () => {
    expect(splitTabs(8, 5, 1)).toEqual({ visible: [0, 1, 2, 3, 4], overflow: [5, 6, 7] });
    expect(splitTabs(8, 5, 7)).toEqual({ visible: [0, 1, 2, 3, 7], overflow: [4, 5, 6] });
  });
});
