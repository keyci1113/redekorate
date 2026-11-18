import { describe, expect, it } from "vitest";
import { PROJECT_CATEGORIES, categoryCounts, categoryOf, filterByCategory, readCategory } from "./projectCategories";

describe("project categories", () => {
  it("lists the seven kinds of work, UX research first", () => {
    expect(PROJECT_CATEGORIES).toEqual(["ux_research", "software", "ai", "automation", "it", "design", "other"]);
  });
  it("reads only known categories", () => {
    expect(readCategory("ai")).toBe("ai");
    expect(readCategory("marketing")).toBeNull();
    expect(readCategory(null)).toBeNull();
    expect(readCategory("")).toBeNull();
  });
  it("treats a project without a category as UX research", () => {
    expect(categoryOf({})).toBe("ux_research");
    expect(categoryOf({ category: null })).toBe("ux_research");
    expect(categoryOf({ category: "software" })).toBe("software");
  });
  it("filters by category and keeps everything when none is chosen", () => {
    const list = [{ id: 1, category: "software" }, { id: 2 }, { id: 3, category: "ai" }, { id: 4, category: "software" }];
    expect(filterByCategory(list, "software").map((p) => p.id)).toEqual([1, 4]);
    expect(filterByCategory(list, "ux_research").map((p) => p.id)).toEqual([2]);
    expect(filterByCategory(list, null)).toBe(list);
  });
  it("counts the categories present, in the canonical order", () => {
    expect(categoryCounts([{ category: "other" }, { category: "ai" }, {}, { category: "ai" }])).toEqual([
      { category: "ux_research", n: 1 }, { category: "ai", n: 2 }, { category: "other", n: 1 },
    ]);
    expect(categoryCounts([])).toEqual([]);
  });
});
