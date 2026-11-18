import { describe, expect, test } from "vitest";
import { optionLetter, preferenceBlocks } from "./BoardTestModal";
import { getLang } from "../lib/i18n";

describe("testing a mood board", () => {
  test("one neutral option per direction, with its picture, the question asked and random order on", () => {
    const blocks = preferenceBlocks("en", "Which one feels calmer?", ["/uploads/a.png", "/uploads/b.png", "/uploads/c.png"]);
    expect(blocks.map((b) => b.type)).toEqual(["welcome", "preference", "thank_you"]);
    const pref = blocks[1] as Extract<(typeof blocks)[number], { type: "preference" }>;
    expect(pref.title).toBe("Which one feels calmer?");
    expect(pref.randomize).toBe(true);
    expect(pref.options.map((o) => [o.label, o.image])).toEqual([["Option A", "/uploads/a.png"], ["Option B", "/uploads/b.png"], ["Option C", "/uploads/c.png"]]);
  });

  test("the study is written in the board's language, and the app's own language is left as it was", () => {
    const before = getLang();
    const blocks = preferenceBlocks("es", "", ["/uploads/a.png", "/uploads/b.png"]);
    const pref = blocks[1] as Extract<(typeof blocks)[number], { type: "preference" }>;
    expect(pref.title).toBe("¿Cuál de estos diseños prefieres?");
    expect(pref.options[0].label).toBe("Opción A");
    expect(getLang()).toBe(before);
  });

  test("letters run A to Z", () => {
    expect([0, 1, 25].map(optionLetter)).toEqual(["A", "B", "Z"]);
  });
});
