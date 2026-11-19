import { describe, expect, it } from "vitest";
import { barSpan, dayMark, daysBetween, labelPlacement, labelPx, daysToSunday, filterWork, groupWork, milestoneNote, shownState, span, timeWindow, workGroup, workProjects, type Milestone } from "./model";

const TODAY = "2026-11-11";
const ms = (over: Partial<Milestone>): Milestone => ({
  id: "m", name: "M", project_id: "p", project_name: "P", start_date: null, due_date: null, begin_date: "2026-11-03", end_date: "2026-12-12",
  total: 9, todo: 2, in_progress: 1, in_review: 2, done: 4, overdue_open: 0, unassigned_open: 0, closed_at: null, state: "on_track", progress: 44, ...over,
});

describe("milestone states and notes", () => {
  it("shows a milestone that is behind as at risk", () => {
    expect(shownState("behind")).toBe("at_risk");
    expect(["done", "planned", "at_risk", "on_track"].map((s) => shownState(s as never))).toEqual(["done", "planned", "at_risk", "on_track"]);
  });
  it("says when an on-track milestone is due", () => {
    expect(milestoneNote(ms({}), TODAY)).toEqual({ kind: "due", days: 31 });
    expect(milestoneNote(ms({ end_date: null }), TODAY)).toBeNull();
  });
  it("explains why a milestone is at risk, overdue tickets first", () => {
    expect(milestoneNote(ms({ state: "at_risk", end_date: "2026-11-20" }), TODAY)).toEqual({ kind: "due_open", days: 9, open: 5 });
    // Unassigned tickets alone are no reason to alarm: an on-track milestone just says when it is due.
    expect(milestoneNote(ms({ unassigned_open: 2 }), TODAY)).toEqual({ kind: "due", days: 31 });
    expect(milestoneNote(ms({ state: "behind", overdue_open: 1, unassigned_open: 2 }), TODAY)).toEqual({ kind: "overdue", n: 1 });
    expect(milestoneNote(ms({ state: "behind", end_date: "2026-11-01" }), TODAY)).toEqual({ kind: "late", days: 10 });
  });
  it("says when a planned milestone starts and when a done one was closed", () => {
    expect(milestoneNote(ms({ state: "planned", begin_date: "2027-01-12" }), TODAY)).toEqual({ kind: "starts", days: 62 });
    expect(milestoneNote(ms({ state: "done", closed_at: "2026-11-07" }), TODAY)).toEqual({ kind: "closed", date: "2026-11-07" });
    expect(milestoneNote(ms({ state: "done", closed_at: null }), TODAY)).toBeNull();
  });
  it("speaks in days up to eight weeks, then in months", () => {
    expect(span(31)).toEqual({ n: 31, unit: "day" });
    expect(span(62)).toEqual({ n: 2, unit: "month" });
    expect(span(-10)).toEqual({ n: 10, unit: "day" });
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("timeline window", () => {
  it("month zoom shows six months from the month before today", () => {
    const w = timeWindow("month", TODAY);
    expect([w.start, w.end, w.days]).toEqual(["2026-10-01", "2027-03-31", 182]);
    expect(w.columns.map((c) => `${c.year}-${c.month}`)).toEqual(["2026-10", "2026-11", "2026-12", "2027-1", "2027-2", "2027-3"]);
    expect(Math.round(w.columns.reduce((n, c) => n + c.share, 0))).toBe(100);
    expect(w.columns[4].share).toBeLessThan(w.columns[0].share);   // February is narrower than October
  });
  it("quarter zoom shows four quarters from the quarter before this one", () => {
    const w = timeWindow("quarter", TODAY);
    expect([w.start, w.end]).toEqual(["2026-07-01", "2027-06-30"]);
    expect(w.columns.map((c) => `Q${c.quarter} ${c.year}`)).toEqual(["Q3 2026", "Q4 2026", "Q1 2027", "Q2 2027"]);
  });
  it("shifts by whole steps in either direction, across years", () => {
    expect(timeWindow("month", TODAY, 3).start).toBe("2027-01-01");
    expect(timeWindow("month", TODAY, -11).start).toBe("2025-11-01");
    expect(timeWindow("quarter", TODAY, -1).start).toBe("2026-04-01");
  });
});

describe("bars and the today mark", () => {
  const w = timeWindow("month", TODAY);
  it("places an item by its dates", () => {
    const b = barSpan("2026-10-01", "2026-10-31", w)!;
    expect([b.left, Math.round(b.width * 10) / 10, b.cutStart, b.cutEnd]).toEqual([0, Math.round((31 / 182) * 1000) / 10, false, false]);
  });
  it("clips an item that runs past the window and flags the cut edge", () => {
    const b = barSpan("2026-09-01", "2026-10-15", w)!;
    expect([b.left, b.cutStart, b.cutEnd]).toEqual([0, true, false]);
    const c = barSpan("2027-03-01", "2027-05-01", w)!;
    expect([c.cutStart, c.cutEnd, Math.round(c.left + c.width)]).toEqual([false, true, 100]);
  });
  it("is null for items outside the window or with reversed dates", () => {
    expect(barSpan("2026-01-01", "2026-09-30", w)).toBeNull();
    expect(barSpan("2027-04-01", "2027-05-01", w)).toBeNull();
    expect(barSpan("2026-12-01", "2026-11-01", w)).toBeNull();
  });
  it("keeps a one-day item visible", () => {
    expect(barSpan("2026-11-11", "2026-11-11", w)!.width).toBeGreaterThanOrEqual(0.5);
  });
  it("marks today inside the window only", () => {
    expect(Math.round(dayMark(TODAY, w)!)).toBe(23);
    expect(dayMark("2026-09-30", w)).toBeNull();
    expect(dayMark("2027-04-01", w)).toBeNull();
  });
});

describe("my work", () => {
  const t = (number: number, due: string | null, project = "p1", type = "task") => ({ number, due_date: due, project_id: project, project_name: project === "p1" ? "Fintech" : "Billing", type: type as "task" | "bug" });
  const list = [t(3, "2026-11-09", "p2"), t(4, "2026-11-12", "p2", "bug"), t(21, "2026-11-11"), t(19, "2026-11-18"), t(12, "2026-11-19"), t(20, null)];
  it("sorts tickets into overdue, this week, later and undated", () => {
    // TODAY is Wednesday 2026-11-11: "this week" runs through Sunday 2026-11-15, not seven rolling days.
    expect([workGroup("2026-11-10", TODAY), workGroup(TODAY, TODAY), workGroup("2026-11-15", TODAY), workGroup("2026-11-16", TODAY), workGroup("2026-11-18", TODAY), workGroup(null, TODAY)])
      .toEqual(["overdue", "week", "week", "later", "later", "undated"]);
    const g = groupWork(list, TODAY);
    expect([g.overdue, g.week, g.later, g.undated].map((x) => x.map((y) => y.number))).toEqual([[3], [4, 21], [19, 12], [20]]);
  });
  it("ends the calendar week on Sunday, Monday start", () => {
    expect(daysToSunday("2026-11-09")).toBe(6); // Monday
    expect(daysToSunday("2026-11-15")).toBe(0); // Sunday: only today counts
    expect(workGroup("2026-11-16", "2026-11-15")).toBe("later");
    expect(workGroup("2026-11-15", "2026-11-09")).toBe("week");
    expect(workGroup("2026-11-16", "2026-11-09")).toBe("later");
  });
  it("filters by project and type together", () => {
    expect(filterWork(list, { project: "p2", type: null }).map((x) => x.number)).toEqual([3, 4]);
    expect(filterWork(list, { project: "p2", type: "bug" }).map((x) => x.number)).toEqual([4]);
    expect(filterWork(list, { project: null, type: null }).length).toBe(6);
  });
  it("lists each project once, by name", () => {
    expect(workProjects(list)).toEqual([{ id: "p2", name: "Billing" }, { id: "p1", name: "Fintech" }]);
  });
});

describe("bar labels", () => {
  it("stay inside a bar wide enough for them", () => {
    expect(labelPlacement({ left: 10, width: 40 }, "On track · 44%")).toBe("inside");
  });
  it("move beside a short bar instead of being cut off", () => {
    // 4% of the narrowest track is ~23px, far less than "At risk · 20%" needs.
    expect(labelPlacement({ left: 10, width: 4 }, "At risk · 20%")).toBe("after");
    expect(labelPlacement({ left: 90, width: 4 }, "At risk · 20%")).toBe("before");
    expect(labelPx("At risk · 20%")).toBeGreaterThan(580 * 0.04);
  });
});
