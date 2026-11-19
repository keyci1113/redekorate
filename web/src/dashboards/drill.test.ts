import { describe, expect, it } from "vitest";
import { drillPath, liveStudiesFor, milestonesFor, projectsFor, responsesByStudy, studyLink, ticketLink } from "./drill";
import type { LiveStudy, MilestoneRow, ProjectRow } from "./model";

const study = (id: string, started: number, finished: number, attention: LiveStudy["attention"] = null): LiveStudy =>
  ({ id, title: id, method: "survey", published_at: "2026-11-01T00:00:00Z", project_name: "P", started, finished, last_response_at: "2026-11-17T10:00:00Z", attention });

describe("API paths", () => {
  it("keeps the dashboard's filters and adds the figure", () => {
    expect(drillPath({ kind: "tickets", title: "", by: "overdue" }, { project: null, period: "30" })).toBe("/dashboards/tickets/items?by=overdue");
    expect(drillPath({ kind: "tickets", title: "", by: "status", value: "todo" }, { project: "p1", period: "7" })).toBe("/dashboards/tickets/items?project=p1&period=7&by=status&value=todo");
    expect(drillPath({ kind: "studies", title: "", by: "day", value: "2026-11-02", bucket: "week" }, { project: null, period: "90" })).toBe("/dashboards/studies/items?period=90&by=day&value=2026-11-02&bucket=week");
  });
  it("a drill that names a project overrides the project filter", () => {
    expect(drillPath({ kind: "tickets", title: "", by: "open", project: "p2" }, { project: "p1", period: "30" })).toBe("/dashboards/tickets/items?project=p2&by=open");
  });
  it("encodes values", () => {
    expect(drillPath({ kind: "tickets", title: "", by: "page", value: "/caja & más" }, { project: null, period: "30" })).toBe("/dashboards/tickets/items?by=page&value=%2Fcaja+%26+m%C3%A1s");
  });
});

describe("links", () => {
  it("opens drafts in the editor and the rest in results", () => {
    expect(studyLink({ id: "s", status: "draft" })).toBe("/studies/s/edit");
    expect(studyLink({ id: "s", status: "live" })).toBe("/studies/s/results");
    expect(ticketLink({ project_id: "p", number: 7 })).toBe("/projects/p/tickets/7");
  });
});

describe("live studies behind a tile", () => {
  const live = [study("b-ok", 10, 10), study("a-low", 10, 5, "low_completion"), study("c-silent", 2, 2, "silent"), study("d-new", 1, 1)];
  it("all of them, the ones that need attention first", () => {
    expect(liveStudiesFor(live, "all", 5).map((s) => s.id)).toEqual(["a-low", "c-silent", "b-ok", "d-new"]);
  });
  it("only those that need attention", () => {
    expect(liveStudiesFor(live, "attention", 5).map((s) => s.id)).toEqual(["a-low", "c-silent"]);
  });
  it("by completion leaves out studies with too few sessions to judge", () => {
    expect(liveStudiesFor(live, "by_completion", 5).map((s) => s.id)).toEqual(["a-low", "b-ok"]);
  });
  it("does not reorder the list it was given", () => {
    const copy = [...live];
    liveStudiesFor(live, "all", 5);
    expect(live).toEqual(copy);
  });
});

describe("projects behind a tile", () => {
  const row = (name: string, health: ProjectRow["health"], live = 0, open = 0, overdue = 0): ProjectRow =>
    ({ id: name, name, description: "", color: "#000", live_studies: live, responses_7d: 0, studies_attention: 0, low_completion: 0, milestones_behind: 0, milestones_at_risk: 0, open_tickets: open, overdue, health, next_milestone: null });
  const rows = [row("Quiet", "quiet"), row("Risk", "at_risk", 1, 4, 2), row("Ok", "on_track", 2, 1), row("Watch", "needs_attention", 0, 3, 1)];
  it("sorts the worst health first", () => {
    expect(projectsFor(rows, "all").map((r) => r.name)).toEqual(["Risk", "Watch", "Ok", "Quiet"]);
  });
  it("filters by what the tile counts", () => {
    expect(projectsFor(rows, "risky").map((r) => r.name)).toEqual(["Risk", "Watch"]);
    expect(projectsFor(rows, "with_live").map((r) => r.name)).toEqual(["Risk", "Ok"]);
    expect(projectsFor(rows, "with_open").map((r) => r.name)).toEqual(["Risk", "Watch", "Ok"]);
    expect(projectsFor(rows, "with_overdue").map((r) => r.name)).toEqual(["Risk", "Watch"]);
  });
});

describe("milestones behind a figure", () => {
  const m = (name: string, state: MilestoneRow["state"], project = "p1", end: string | null = null): MilestoneRow =>
    ({ id: name, name, project_id: project, project_name: project, total: 2, done: 1, overdue_open: 0, unassigned_open: 0, end_date: end, state, progress: 50 });
  const ms = [m("Done", "done"), m("Later", "on_track", "p1", "2026-12-20"), m("Soon", "on_track", "p2", "2026-11-20"), m("Late", "behind"), m("Plan", "planned"), m("Risk", "at_risk", "p2")];
  it("puts what needs help first, then by date", () => {
    expect(milestonesFor(ms, "all").map((x) => x.name)).toEqual(["Late", "Risk", "Soon", "Later", "Plan", "Done"]);
  });
  it("groups on track and planned as in progress, and open leaves out the finished", () => {
    expect(milestonesFor(ms, "in_progress").map((x) => x.name)).toEqual(["Soon", "Later", "Plan"]);
    expect(milestonesFor(ms, "open")).toHaveLength(5);
    expect(milestonesFor(ms, "behind").map((x) => x.name)).toEqual(["Late"]);
  });
  it("narrows to one project", () => {
    expect(milestonesFor(ms, "all", "p2").map((x) => x.name)).toEqual(["Risk", "Soon"]);
  });
});

describe("home: responses per study", () => {
  const trend = [
    { study_id: "a", day: "2026-11-10", n: 3 }, { study_id: "a", day: "2026-11-15", n: 2 },
    { study_id: "b", day: "2026-11-16", n: 4 }, { study_id: "c", day: "2026-11-05", n: 9 },
  ];
  it("adds up the days in the window, most first", () => {
    expect(responsesByStudy(trend, "2026-11-11")).toEqual([{ study_id: "b", n: 4 }, { study_id: "a", n: 2 }]);
    expect(responsesByStudy(trend, "2026-11-01")).toEqual([{ study_id: "c", n: 9 }, { study_id: "a", n: 5 }, { study_id: "b", n: 4 }]);
  });
  it("one day", () => {
    expect(responsesByStudy(trend, "2026-11-15", "2026-11-15")).toEqual([{ study_id: "a", n: 2 }]);
    expect(responsesByStudy(trend, "2026-11-14", "2026-11-14")).toEqual([]);
  });
});
