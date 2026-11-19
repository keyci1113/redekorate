import { describe, expect, it } from "vitest";
import { attention, completion, daysSince, delta, dueText, filterQuery, labelTicks, peak, percent, readFilters, shares, weeksBehind, type LiveStudy } from "./model";

describe("filters", () => {
  it("defaults to all projects and the last 30 days", () => {
    expect(readFilters(new URLSearchParams(""))).toEqual({ project: null, period: "30" });
    expect(readFilters(new URLSearchParams("period=year"))).toEqual({ project: null, period: "30" });
  });
  it("round-trips through the query string and leaves defaults out", () => {
    const f = readFilters(new URLSearchParams("project=abc&period=quarter"));
    expect(f).toEqual({ project: "abc", period: "quarter" });
    expect(filterQuery(f)).toBe("?project=abc&period=quarter");
    expect(filterQuery({ project: null, period: "30" })).toBe("");
    expect(filterQuery({ project: null, period: "7" })).toBe("?period=7");
  });
});

describe("figures", () => {
  it("delta gives the size and the direction of a change", () => {
    expect(delta(9, 6)).toEqual({ diff: 3, dir: "up" });
    expect(delta(1, 2)).toEqual({ diff: 1, dir: "down" });
    expect(delta(4, 4)).toEqual({ diff: 0, dir: "same" });
  });
  it("percent never divides by zero", () => {
    expect(percent(6, 9)).toBe(67);
    expect(percent(3, 0)).toBe(0);
  });
});

describe("studies that need attention", () => {
  const NOW = new Date("2026-11-11T18:00:00Z").getTime();
  const study = (over: Partial<LiveStudy>): LiveStudy => ({ id: "s", title: "S", method: "survey", published_at: "2026-11-01T00:00:00Z", project_name: "P", started: 90, finished: 85, last_response_at: "2026-11-11T12:00:00Z", ...over });
  it("flags completion under the threshold once enough people started", () => {
    expect(attention(study({ started: 31, finished: 26 }), NOW, 0.88, 5)).toBe("low_completion");
    expect(attention(study({ started: 4, finished: 1 }), NOW, 0.88, 5)).toBeNull();
    expect(completion({ started: 0, finished: 0 })).toBe(0);
  });
  it("flags a study with no responses for 48 hours, counting from publication when it has none", () => {
    expect(attention(study({ last_response_at: "2026-11-09T12:00:00Z" }), NOW, 0.88, 5)).toBe("silent");
    expect(attention(study({ started: 0, finished: 0, last_response_at: null }), NOW, 0.88, 5)).toBe("silent");
    expect(attention(study({ started: 0, finished: 0, last_response_at: null, published_at: "2026-11-11T00:00:00Z" }), NOW, 0.88, 5)).toBeNull();
    expect(daysSince("2026-11-09T12:00:00Z", NOW)).toBe(2);
  });
  it("leaves healthy studies alone", () => {
    expect(attention(study({}), NOW, 0.88, 5)).toBeNull();
  });
});

describe("due texts", () => {
  it("reads late, today, tomorrow or a plain date", () => {
    expect(dueText("2026-11-09", "2026-11-11")).toEqual({ kind: "late", days: 2 });
    expect(dueText("2026-11-11", "2026-11-11")).toEqual({ kind: "today" });
    expect(dueText("2026-11-12", "2026-11-11")).toEqual({ kind: "tomorrow" });
    expect(dueText("2026-11-14", "2026-11-11")).toEqual({ kind: "date" });
    expect(dueText("2026-10-31", "2026-11-01")).toEqual({ kind: "late", days: 1 });
  });
});

describe("charts", () => {
  it("scales bars to the largest value and keeps small values visible", () => {
    expect(shares([7, 3, 2])).toEqual([100, 43, 29]);
    expect(shares([200, 1, 0])).toEqual([100, 2, 0]);
    expect(shares([0, 0])).toEqual([0, 0]);
    expect(shares([])).toEqual([]);
  });
  it("labels every position when they fit, otherwise an even subset with both ends", () => {
    expect([...labelTicks(8, 8)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([...labelTicks(30, 5)]).toEqual([0, 7, 15, 22, 29]);
  });
  it("finds the peak and counts the weeks that fell behind", () => {
    expect(peak([{ day: "a", n: 3 }, { day: "b", n: 57 }, { day: "c", n: 34 }])).toEqual({ day: "b", n: 57 });
    expect(peak([{ n: 0 }, { n: 0 }])).toBeNull();
    expect(weeksBehind([{ created: 1, closed: 9 }, { created: 8, closed: 5 }, { created: 5, closed: 6 }, { created: 7, closed: 4 }, { created: 9, closed: 6 }])).toBe(3);
  });
});
