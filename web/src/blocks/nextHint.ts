// Why "Siguiente" is disabled, said next to the button so a participant is never stuck guessing.
import type { Block, CardSortValue } from "./types";
import { t } from "../lib/i18n";

/** How far a card sort is: cards placed and groups still without a name. */
export function cardSortProgress(total: number, value: CardSortValue | undefined) {
  const groups = value?.groups ?? [];
  return {
    placed: groups.reduce((n, g) => n + g.cardIds.length, 0),
    total,
    unnamed: groups.filter((g) => g.cardIds.length && !g.name.trim()).length,
  };
}

/** The reason a required block can't go on yet, or null when it can (or when the block has nothing specific to say). */
export function nextHint(block: Block, value: unknown, answered: boolean): string | null {
  if (answered || !block.required) return null;
  if (block.type === "card_sort") {
    const p = cardSortProgress(block.cards.length, value as CardSortValue | undefined);
    if (block.requireAll && p.placed < p.total) return t("Ordena todas las tarjetas ({a} de {b})", { a: p.placed, b: p.total });
    if (!p.placed) return t("Coloca al menos una tarjeta en un grupo");
    if (p.unnamed) return t("Ponle nombre a cada grupo");
  }
  return t("Responde para continuar");
}
