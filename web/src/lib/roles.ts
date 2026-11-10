// Pure helpers for project and organization roles: no React, no texts, so they can be tested.
import type { OrgRole, ProjectRole } from "./types";

export const PROJECT_RANK: Record<ProjectRole, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };
export const ORG_RANK: Record<OrgRole, number> = { member: 1, admin: 2, owner: 3 };

/** true when `role` is at least `min`. No role (null/undefined) is never enough. */
export const atLeast = (role: ProjectRole | null | undefined, min: ProjectRole) => !!role && PROJECT_RANK[role] >= PROJECT_RANK[min];
/** Create, edit, delete and share inside the project. */
export const canEdit = (role: ProjectRole | null | undefined) => atLeast(role, "editor");
/** Write comments on the project, its studies and its documents. */
export const canComment = (role: ProjectRole | null | undefined) => atLeast(role, "commenter");
export const isOwner = (role: ProjectRole | null | undefined) => role === "owner";

export const orgAtLeast = (role: OrgRole | null | undefined, min: OrgRole) => !!role && ORG_RANK[role] >= ORG_RANK[min];
/** Change the organization's settings and people. */
export const canManageOrg = (role: OrgRole | null | undefined) => orgAtLeast(role, "admin");

/** Roles a project owner can hand out to collaborators (owner is not assignable). */
export const ASSIGNABLE_PROJECT_ROLES: Exclude<ProjectRole, "owner">[] = ["editor", "commenter", "viewer"];
/** Roles an organization admin can assign; only owners can also assign "owner". */
export const assignableOrgRoles = (mine: OrgRole | null | undefined): OrgRole[] => (mine === "owner" ? ["owner", "admin", "member"] : ["admin", "member"]);
