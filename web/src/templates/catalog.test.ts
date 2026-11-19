import { describe, expect, it } from "vitest";
import { catalogCounts, TEMPLATES, templateByKey } from "./catalog";

describe("new study catalog", () => {
  it("counts match the cards and no card is disabled", () => {
    const c = catalogCounts();
    expect(c.unavailable).toBe(0);
    expect(c.studies + c.documents + c.features).toBe(TEMPLATES.length);
  });
  it("sends the insight repository to the Insights tab", () => {
    expect(templateByKey("insight_repo")?.tab).toBe("insights");
  });
  it("files Tree Testing under information architecture", () => {
    expect(templateByKey("tree_test")?.category).toBe("Arquitectura de información");
  });
  it("gives card sorts a real welcome, not the thank-you text", () => {
    for (const key of ["card_sort_open", "card_sort_closed", "card_sort_hybrid"]) {
      const blocks = templateByKey(key)!.build!();
      const welcome = blocks.find((b) => b.type === "welcome")!, thanks = blocks.find((b) => b.type === "thank_you")!;
      expect(welcome.title).toMatch(/^Hi!/);
      expect(welcome.title).not.toBe(thanks.title);
      expect(welcome.description).toMatch(/cards/);
    }
  });
});
