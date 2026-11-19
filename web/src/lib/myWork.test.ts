import { describe, expect, it } from "vitest";
import { assignedSummary } from "./myWork";

describe("my work summary", () => {
  it("agrees in number in Spanish", () => {
    expect(assignedSummary(1, 1, "es")).toBe("1 ticket abierto asignado a ti en 1 proyecto");
    expect(assignedSummary(3, 2, "es")).toBe("3 tickets abiertos asignados a ti en 2 proyectos");
  });
  it("agrees in number in English", () => {
    expect(assignedSummary(1, 1, "en")).toBe("1 open ticket assigned to you in 1 project");
    expect(assignedSummary(3, 2, "en")).toBe("3 open tickets assigned to you in 2 projects");
  });
});
