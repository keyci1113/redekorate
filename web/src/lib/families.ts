import { templateByKey, type Category } from "../templates/catalog";

// Cada familia de método tiene un color fijo en toda la app. Es solo para puntos y figuras, nunca para texto.
const FAMILY_COLOR: Record<Category, string> = {
  "Usabilidad": "var(--color-family-usability)",
  "Arquitectura de información": "var(--color-family-ia)",
  "Generativa": "var(--color-family-generative)",
  "Síntesis y mapeo": "var(--color-family-synthesis)",
  "Métricas": "var(--color-family-metrics)",
  "Organización": "var(--color-family-org)",
};

export const familyOf = (method: string): Category => templateByKey(method)?.category ?? "Generativa";
export const familyColor = (family: Category) => FAMILY_COLOR[family];

/** Personas por figura: la misma para todos los estudios visibles, para que se puedan comparar. */
export function figureUnit(maxStarted: number, capacity = 48) {
  const target = maxStarted / capacity;
  for (let base = 1; ; base *= 10) {
    for (const step of [1, 2, 5]) if (step * base >= target) return step * base;
  }
}
