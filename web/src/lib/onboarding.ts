// First-run wizard and the "getting started" checklist: pure logic, no React or texts, so it can be tested.

export type Step = "profile" | "workspace" | "project" | "method";
export const ALL_STEPS: Step[] = ["profile", "workspace", "project", "method"];

/** What we already know about the person when the wizard opens. */
export interface OnboardingCtx {
  inOrg: boolean;        // joined an organization (through an invitation): no need to create one
  hasProjects: boolean;  // already sees projects (invited as a collaborator): no first project, no first study
}

/** The steps this person actually needs, in order. Profile is always first. */
export function steps(ctx: OnboardingCtx): Step[] {
  return ALL_STEPS.filter((s) => (s === "workspace" ? !ctx.inOrg : s === "project" || s === "method" ? !ctx.hasProjects : true));
}

/** The step after `cur`, or null when `cur` is the last one. Unknown steps (skipped ones) resolve to the first remaining step after them. */
export function nextStep(cur: Step, ctx: OnboardingCtx): Step | null {
  const list = steps(ctx);
  const after = ALL_STEPS.indexOf(cur) + 1;
  return list.find((s) => ALL_STEPS.indexOf(s) >= after) ?? null;
}

/** 1-based position of `cur` among the needed steps, for the progress indicator. */
export function progress(cur: Step, ctx: OnboardingCtx): { index: number; total: number } {
  const list = steps(ctx);
  return { index: list.indexOf(cur) + 1, total: list.length };
}

// ── Getting started (Home card) ─────────────────────────────────────
export type StartTask = "project" | "study" | "publish" | "response" | "share";
export const START_TASKS: StartTask[] = ["project", "study", "publish", "response", "share"];
export interface StartTotals { projects: number; studies: number; published: number; responses: number; shares: number }

/** Which of the five first steps the account has already taken. */
export function startDone(t: StartTotals): Record<StartTask, boolean> {
  return { project: t.projects > 0, study: t.studies > 0, publish: t.published > 0, response: t.responses > 0, share: t.shares > 0 };
}
export const startComplete = (t: StartTotals) => Object.values(startDone(t)).every(Boolean);
/** The first task still pending, to highlight it. */
export const startNext = (t: StartTotals): StartTask | null => START_TASKS.find((k) => !startDone(t)[k]) ?? null;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const browserStorage = (): StorageLike | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
const DISMISS_KEY = (userId: string) => `rk_start_dismissed:${userId}`;

/** Hiding the card is a per-browser convenience; without storage it simply shows again. */
export function startDismissed(userId: string, storage: StorageLike | null = browserStorage()): boolean {
  try { return storage?.getItem(DISMISS_KEY(userId)) === "1"; } catch { return false; }
}
export function dismissStart(userId: string, storage: StorageLike | null = browserStorage()) {
  try { if (!storage) return false; storage.setItem(DISMISS_KEY(userId), "1"); return true; } catch { return false; }
}
