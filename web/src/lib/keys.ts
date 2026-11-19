// Keyboard shortcuts shared by every comment box.

/** ⌘+Enter (Mac) or Ctrl+Enter sends a comment. Ignored while an input method is composing text (e.g. accents, CJK). */
export const isSendShortcut = (e: { key: string; metaKey: boolean; ctrlKey: boolean; nativeEvent?: { isComposing?: boolean } }) =>
  e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent?.isComposing;
