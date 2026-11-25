// Lettered rows (SCAMPER) are drawn from each section's `letter`, title and prompt; a typo would break the acronym
// and a missing translation would show Spanish in an English document.
import { describe, expect, it } from "vitest";
import { DOC_TEMPLATES, docTemplate } from "./templates";
import { EN as en } from "../lib/en";

describe("lettered rows", () => {
  it("SCAMPER spells its name with seven list sections, each asking a question", () => {
    const rows = docTemplate("scamper")!.sections.filter((s) => s.letter);
    expect(rows.map((s) => s.letter).join("")).toBe("SCAMPER");
    for (const s of rows) {
      expect(s.type).toBe("list");
      expect(s.prompt).toMatch(/^¿.+\?$/);
    }
  });

  const lettered = DOC_TEMPLATES.flatMap((t) => t.sections.filter((s) => s.letter).map((s) => [`${t.kind}.${s.id}`, s] as const));
  it.each(lettered)("%s: one capital letter, and its title, question and hint are translated", (_, s) => {
    expect(s.letter).toMatch(/^[A-Z]$/);
    const hint = "placeholder" in s ? s.placeholder : undefined;
    for (const key of [s.title, s.prompt, hint].filter(Boolean) as string[]) expect(en[key], key).toBeTruthy();
  });
});
