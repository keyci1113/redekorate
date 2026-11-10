import { describe, expect, it } from "vitest";
import { ASSIGNABLE_PROJECT_ROLES, assignableOrgRoles, atLeast, canComment, canEdit, canManageOrg, isOwner } from "./roles";

describe("project roles", () => {
  it("ranks viewer < commenter < editor < owner", () => {
    expect(atLeast("owner", "editor")).toBe(true);
    expect(atLeast("editor", "editor")).toBe(true);
    expect(atLeast("commenter", "editor")).toBe(false);
    expect(atLeast("viewer", "commenter")).toBe(false);
  });
  it("no role is never enough", () => {
    expect(atLeast(null, "viewer")).toBe(false);
    expect(atLeast(undefined, "viewer")).toBe(false);
    expect(canEdit(undefined)).toBe(false);
  });
  it("only editors and owners edit; commenters and up comment", () => {
    expect(canEdit("editor")).toBe(true);
    expect(canEdit("commenter")).toBe(false);
    expect(canEdit("viewer")).toBe(false);
    expect(canComment("commenter")).toBe(true);
    expect(canComment("viewer")).toBe(false);
    expect(canComment("owner")).toBe(true);
    expect(isOwner("editor")).toBe(false);
  });
  it("owner is not an assignable collaborator role", () => {
    expect(ASSIGNABLE_PROJECT_ROLES).toEqual(["editor", "commenter", "viewer"]);
  });
});

describe("organization roles", () => {
  it("admins and owners manage; members do not", () => {
    expect(canManageOrg("owner")).toBe(true);
    expect(canManageOrg("admin")).toBe(true);
    expect(canManageOrg("member")).toBe(false);
    expect(canManageOrg(null)).toBe(false);
  });
  it("only owners can hand out the owner role", () => {
    expect(assignableOrgRoles("owner")).toEqual(["owner", "admin", "member"]);
    expect(assignableOrgRoles("admin")).toEqual(["admin", "member"]);
    expect(assignableOrgRoles("member")).toEqual(["admin", "member"]);
  });
});
