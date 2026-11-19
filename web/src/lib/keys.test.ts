import { describe, expect, it } from "vitest";
import { isSendShortcut } from "./keys";

const key = (k: string, mods: { metaKey?: boolean; ctrlKey?: boolean; composing?: boolean } = {}) =>
  ({ key: k, metaKey: !!mods.metaKey, ctrlKey: !!mods.ctrlKey, nativeEvent: { isComposing: !!mods.composing } });

describe("isSendShortcut", () => {
  it("sends on Ctrl+Enter and Cmd+Enter", () => {
    expect(isSendShortcut(key("Enter", { ctrlKey: true }))).toBe(true);
    expect(isSendShortcut(key("Enter", { metaKey: true }))).toBe(true);
  });
  it("leaves plain Enter (a new line) and other keys alone", () => {
    expect(isSendShortcut(key("Enter"))).toBe(false);
    expect(isSendShortcut(key("a", { ctrlKey: true }))).toBe(false);
  });
  it("does not send while an input method is composing", () => {
    expect(isSendShortcut(key("Enter", { ctrlKey: true, composing: true }))).toBe(false);
  });
});
