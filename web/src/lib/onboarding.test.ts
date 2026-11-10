import { describe, expect, it } from "vitest";
import { dismissStart, nextStep, progress, startComplete, startDismissed, startDone, startNext, steps } from "./onboarding";

const fresh = { inOrg: false, hasProjects: false };

describe("wizard steps", () => {
  it("a brand-new account walks through all four steps", () => {
    expect(steps(fresh)).toEqual(["profile", "workspace", "project", "method"]);
  });
  it("someone who joined an organization skips the workspace step", () => {
    expect(steps({ inOrg: true, hasProjects: false })).toEqual(["profile", "project", "method"]);
  });
  it("someone invited to a project skips the project and method steps", () => {
    expect(steps({ inOrg: false, hasProjects: true })).toEqual(["profile", "workspace"]);
    expect(steps({ inOrg: true, hasProjects: true })).toEqual(["profile"]);
  });
  it("nextStep follows the filtered list and ends with null", () => {
    expect(nextStep("profile", fresh)).toBe("workspace");
    expect(nextStep("profile", { inOrg: true, hasProjects: false })).toBe("project");
    expect(nextStep("workspace", { inOrg: false, hasProjects: true })).toBeNull();
    expect(nextStep("method", fresh)).toBeNull();
  });
  it("progress counts only the needed steps", () => {
    expect(progress("project", fresh)).toEqual({ index: 3, total: 4 });
    expect(progress("project", { inOrg: true, hasProjects: false })).toEqual({ index: 2, total: 3 });
  });
});

describe("getting started checklist", () => {
  const none = { projects: 0, studies: 0, published: 0, responses: 0, shares: 0 };
  it("marks tasks from the dashboard totals", () => {
    expect(startDone({ ...none, projects: 1, studies: 2 })).toEqual({ project: true, study: true, publish: false, response: false, share: false });
    expect(startNext({ ...none, projects: 1, studies: 2 })).toBe("publish");
  });
  it("is complete only when every task is done", () => {
    expect(startComplete(none)).toBe(false);
    expect(startComplete({ projects: 1, studies: 1, published: 1, responses: 1, shares: 1 })).toBe(true);
    expect(startNext({ projects: 1, studies: 1, published: 1, responses: 1, shares: 1 })).toBeNull();
  });
  it("dismissal is per user and survives a missing storage", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(startDismissed("u1", storage)).toBe(false);
    expect(dismissStart("u1", storage)).toBe(true);
    expect(startDismissed("u1", storage)).toBe(true);
    expect(startDismissed("u2", storage)).toBe(false);
    expect(dismissStart("u1", null)).toBe(false);
    expect(startDismissed("u1", null)).toBe(false);
  });
});
