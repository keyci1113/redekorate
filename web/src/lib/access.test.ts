import { describe, expect, it } from "vitest";
import { DEFAULT_ACCESS, accessProblem, areasOf, hasArea, profileOf } from "./access";

describe("profiles", () => {
  it("round-trip between a profile and its sections", () => {
    for (const p of ["full", "research", "tickets"] as const) expect(profileOf(areasOf(p))).toBe(p);
  });
  it("treat a missing list as everything", () => {
    expect(profileOf(undefined)).toBe("full");
    expect(hasArea(undefined, "tickets")).toBe(true);
  });
  it("tell sections apart", () => {
    expect(hasArea(["research"], "tickets")).toBe(false);
    expect(hasArea(["research"], "research")).toBe(true);
  });
});

describe("accessProblem", () => {
  it("flags chosen projects with none chosen", () => {
    expect(accessProblem(DEFAULT_ACCESS)).toBeNull();
    expect(accessProblem({ ...DEFAULT_ACCESS, all_projects: false })).toBe("no-projects");
    expect(accessProblem({ ...DEFAULT_ACCESS, all_projects: false, project_ids: ["a"] })).toBeNull();
  });
});
