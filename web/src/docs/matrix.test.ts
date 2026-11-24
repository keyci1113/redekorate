// A template's 2×2 grid points at its own sections by id; a renamed or removed section would silently drop a cell.
import { describe, expect, it } from "vitest";
import { DOC_TEMPLATES, docTemplate } from "./templates";
import { EN as en } from "../lib/en";

describe("template matrices", () => {
  const withMatrix = DOC_TEMPLATES.filter((t) => t.matrix);

  it("the stakeholder map is drawn as a power / interest grid, high power and low interest top-left", () => {
    const m = docTemplate("stakeholder_map")?.matrix;
    expect(m?.y).toBe("Poder");
    expect(m?.x).toBe("Interés");
    expect(m?.cells.map((c) => c.id)).toEqual(["satisfy", "manage", "monitor", "inform"]);
  });

  it.each(withMatrix.map((t) => [t.kind, t] as const))("%s: four distinct cells, each an existing notes section", (_, t) => {
    const ids = t.matrix!.cells.map((c) => c.id);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(t.sections.find((s) => s.id === id)?.type).toBe("notes");
  });

  it.each(withMatrix.map((t) => [t.kind, t] as const))("%s: axis and cell names are translated", (_, t) => {
    const m = t.matrix!;
    for (const key of [m.x, m.y, "Alto", "Bajo", ...m.cells.map((c) => c.label)]) expect(en[key], key).toBeTruthy();
  });
});
