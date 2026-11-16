import { describe, expect, it } from "vitest";
import { addRange, formatDays, joinDays, monthGrid, parseDays, runs, toggleDay } from "./dates";

describe("parseDays", () => {
  it("keeps ISO days only, sorted and unique", () => {
    expect(parseDays("2026-10-08, 2026-10-01,2026-10-08,01/10 – 25/11,")).toEqual(["2026-10-01", "2026-10-08"]);
    expect(parseDays(undefined)).toEqual([]);
  });
  it("round-trips through joinDays", () => {
    expect(parseDays(joinDays(["2026-10-02", "2026-10-01"]))).toEqual(["2026-10-01", "2026-10-02"]);
  });
});

describe("selection", () => {
  it("toggles a day in and out", () => {
    expect(toggleDay(["2026-10-01"], "2026-10-03")).toEqual(["2026-10-01", "2026-10-03"]);
    expect(toggleDay(["2026-10-01", "2026-10-03"], "2026-10-01")).toEqual(["2026-10-03"]);
  });
  it("adds a range in either direction, across months, keeping what was there", () => {
    expect(addRange(["2026-11-20"], "2026-11-02", "2026-10-30")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-20"]);
  });
});

describe("runs and formatDays", () => {
  const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-08"];
  it("groups consecutive days", () => {
    expect(runs(days)).toEqual([["2026-10-01", "2026-10-03"], ["2026-10-08", "2026-10-08"]]);
  });
  it("writes ranges and single days, with the year once", () => {
    expect(formatDays(days, "en-US").replace(/\s/g, " ")).toBe("Oct 1 – 3, Oct 8, 2026");
    expect(formatDays(["2026-11-02"], "en-US")).toBe("Nov 2, 2026");
    expect(formatDays([], "en-US")).toBe("");
  });
  it("writes each year when the days span two", () => {
    expect(formatDays(["2026-12-31", "2027-01-05"], "en-US")).toBe("Dec 31, 2026, Jan 5, 2027");
  });
  it("speaks the document's language", () => {
    expect(formatDays(days, "es")).toMatch(/^1[–-]3 oct/);
  });
});

describe("monthGrid", () => {
  it("pads November 2026 to whole weeks (Nov 1 is a Sunday)", () => {
    const mon = monthGrid(2026, 10, true);
    expect(mon[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(mon[0][6]).toBe("2026-11-01");
    const sun = monthGrid(2026, 10, false);
    expect(sun[0][0]).toBe("2026-11-01");
    expect(sun.flat().filter(Boolean)).toHaveLength(30);
  });
});
