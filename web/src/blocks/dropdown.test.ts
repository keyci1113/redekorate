import { describe, expect, it } from "vitest";
import type { DropdownBlock } from "./types";
import { isAnswered } from "./Runner";
import { ruleMatches } from "./logic";
import { validateStudy } from "./validate";
import { choiceCounts } from "../lib/analytics";
import { BLOCKS } from "./registry";

const block: DropdownBlock = {
  id: "d", type: "dropdown", title: "Country", required: true, allowOther: true,
  options: [{ id: "mx", label: "Mexico" }, { id: "us", label: "United States" }, { id: "cr", label: "Costa Rica" }],
};

describe("dropdown question", () => {
  it("is in the block palette and creates a valid question", () => {
    const def = BLOCKS.find((b) => b.type === "dropdown")!;
    expect(def.logic).toEqual(["choice"]);
    const made = def.create();
    expect(made.type).toBe("dropdown");
    expect(validateStudy([made]).filter((i) => i.level === "error")).toEqual([]);
  });
  it("is answered once an option is picked, and Other needs its text", () => {
    expect(isAnswered(block, undefined)).toBe(false);
    expect(isAnswered(block, { selected: [] })).toBe(false);
    expect(isAnswered(block, { selected: ["cr"] })).toBe(true);
    expect(isAnswered(block, { selected: ["__other"] })).toBe(false);
    expect(isAnswered(block, { selected: ["__other"], other: "Peru" })).toBe(true);
  });
  it("works with is / is not logic like multiple choice", () => {
    expect(ruleMatches(block, { id: "r", op: "is", value: "mx", goTo: "end" }, { selected: ["mx"] })).toBe(true);
    expect(ruleMatches(block, { id: "r", op: "is", value: "mx", goTo: "end" }, { selected: ["us"] })).toBe(false);
    expect(ruleMatches(block, { id: "r", op: "is_not", value: "mx", goTo: "end" }, { selected: ["us"] })).toBe(true);
  });
  it("counts answers per option, Other included", () => {
    const { rows, others, n } = choiceCounts(block, [{ selected: ["mx"] }, { selected: ["mx"] }, { selected: ["__other"], other: "Peru" }]);
    expect(n).toBe(3);
    expect(rows[0]).toMatchObject({ id: "mx", count: 2 });
    expect(rows.find((r) => r.id === "__other")?.count).toBe(1);
    expect(others).toEqual(["Peru"]);
  });
  it("needs at least two options", () => {
    expect(validateStudy([{ ...block, options: [block.options[0]] }]).some((i) => i.level === "error")).toBe(true);
  });
});
