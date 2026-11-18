import { describe, expect, it } from "vitest";
import { responsesByStudy } from "./drill";

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
