// Project categories: what kind of work a project holds (UX research, software, AI, automation, IT, design, other).
// The list mirrors server/src/lib/projectCategories.ts; projects created before categories existed are UX research.
import { t } from "./i18n";

export const PROJECT_CATEGORIES = ["ux_research", "software", "ai", "automation", "it", "design", "other"] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export const DEFAULT_CATEGORY: ProjectCategory = "ux_research";

export const categoryLabel = (c: ProjectCategory) => ({
  ux_research: t("Investigación UX"), software: t("Desarrollo de software"), ai: t("Inteligencia artificial"),
  automation: t("Automatizaciones"), it: t("TI en general"), design: t("Diseño"), other: t("Otro"),
})[c];

/** A category from the URL or the API; anything unknown (or missing) is null. */
export const readCategory = (v: string | null | undefined): ProjectCategory | null =>
  (PROJECT_CATEGORIES as readonly string[]).includes(v ?? "") ? (v as ProjectCategory) : null;

/** A project's category, treating a missing one as the default. */
export const categoryOf = (p: { category?: string | null }): ProjectCategory => readCategory(p.category) ?? DEFAULT_CATEGORY;

/** The projects of one category; null keeps them all. */
export const filterByCategory = <T extends { category?: string | null }>(projects: T[], category: ProjectCategory | null) =>
  category ? projects.filter((p) => categoryOf(p) === category) : projects;

/** The categories present in a list of projects with how many each has, in the canonical order. */
export function categoryCounts(projects: { category?: string | null }[]): { category: ProjectCategory; n: number }[] {
  const n = new Map<ProjectCategory, number>();
  for (const p of projects) n.set(categoryOf(p), (n.get(categoryOf(p)) ?? 0) + 1);
  return PROJECT_CATEGORIES.filter((c) => n.has(c)).map((c) => ({ category: c, n: n.get(c)! }));
}
