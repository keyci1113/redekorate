/** What kind of work a project holds. Projects created before categories existed are UX research. */
export const PROJECT_CATEGORIES = ["ux_research", "software", "ai", "automation", "it", "design", "other"] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
