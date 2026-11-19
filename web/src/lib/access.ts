// Pure helpers for what a person can open inside a project: no React, no texts, so they can be tested.
// A project has two sections ("areas"): research (studies, documents, insights, participants, reports)
// and tickets (tickets, milestones, roadmap, feedback widget).
import type { ProjectRole } from "./types";

export type Area = "research" | "tickets";
export const AREAS: Area[] = ["research", "tickets"];

/** The three ready-made choices offered when giving someone access. */
export type Profile = "full" | "research" | "tickets";
export const PROFILES: Profile[] = ["full", "research", "tickets"];
export const areasOf = (p: Profile): Area[] => (p === "full" ? ["research", "tickets"] : [p]);
export const profileOf = (areas: readonly Area[] | null | undefined): Profile =>
  !areas || AREAS.every((a) => areas.includes(a)) ? "full" : areas.includes("tickets") ? "tickets" : "research";

/** A project loaded before sections existed carries no list: that means everything. */
export const hasArea = (areas: readonly Area[] | null | undefined, area: Area) => !areas || areas.includes(area);

export type MemberLevel = Exclude<ProjectRole, "owner">;
/** What an organization member (not an owner or admin) gets. */
export interface MemberAccess { all_projects: boolean; project_role: MemberLevel; areas: Area[]; project_ids: string[] }
export const DEFAULT_ACCESS: MemberAccess = { all_projects: true, project_role: "commenter", areas: ["research", "tickets"], project_ids: [] };

/** Chosen projects with none chosen would leave the person with nothing to open. */
export const accessProblem = (a: MemberAccess): "no-projects" | null => (!a.all_projects && a.project_ids.length === 0 ? "no-projects" : null);
