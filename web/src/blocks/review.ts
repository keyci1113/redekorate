// Pure helpers for the pre-publish review and the logic editor: time estimate, no-op logic, default jump target.
import type { Block, LogicRule } from "./types";

/** Seconds a participant typically spends on one block. Card sorting is about a minute per five cards. */
export function blockSeconds(b: Block): number {
  switch (b.type) {
    case "welcome": case "context": case "thank_you": return 8;
    case "open_question": return 45;
    case "choice": case "dropdown": case "yes_no": case "scale": case "nps": return 10;
    case "ranking": return 10 + 5 * b.items.length;
    case "matrix": return 6 * Math.max(1, b.rows.length);
    case "sus": return 90;                                   // ten statements
    case "card_sort": return Math.max(60, 12 * b.cards.length);
    case "tree_test": return 45;
    case "preference": return b.askWhy ? 60 : 30;
    case "five_second": return b.seconds + 30;              // the exposure plus the recall questions
    case "first_click": return 20;
    case "kano": return 20 * b.features.length;             // two questions per feature
    case "timed_task": return b.benchmarkSec ?? b.limitSec ?? 120;
    case "prototype_task": return 120;
    default: return 20;
  }
}

/** Estimated minutes to finish the whole study, at least 1. */
export function estimateMinutes(blocks: Block[]): number {
  return Math.max(1, Math.round(blocks.reduce((s, b) => s + blockSeconds(b), 0) / 60));
}

/** Where a block goes when no rule matches and there is no "otherwise": the next block, or the end. */
export const naturalNext = (blocks: Block[], i: number): string => blocks[i + 1]?.id ?? "end";

/**
 * Logic that changes nothing: rules that jump where the flow already goes (the "otherwise" target, or the next
 * block when there is none), and an "otherwise" that points at the next block.
 */
export function noopLogic(blocks: Block[], i: number): { rules: LogicRule[]; otherwise: boolean } {
  const b = blocks[i], next = naturalNext(blocks, i);
  const fallback = b.logic?.otherwise ?? next;
  return {
    rules: (b.logic?.rules ?? []).filter((r) => r.goTo === fallback),
    otherwise: !!b.logic?.otherwise && b.logic.otherwise === next,
  };
}

/** Default target of a new rule: the block after the next one (the next one would be a no-op), else the end. */
export function defaultGoTo(blocks: Block[], i: number): string {
  return blocks[i + 2]?.id ?? "end";
}
