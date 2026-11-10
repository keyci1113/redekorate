import { describe, expect, it } from "vitest";
import { clock, percentile, timedSummary, vsBenchmarkLabel } from "./timed";
import type { TimedTaskValue } from "./types";

const ok = (ms: number): TimedTaskValue => ({ outcome: "success", ms });

describe("percentile", () => {
  it("interpolates between sorted values", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([40, 10, 30, 20], 0.25)).toBe(17.5);
    expect(percentile([5], 0.9)).toBe(5);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("timedSummary", () => {
  it("only times completed tasks and counts every outcome", () => {
    const s = timedSummary([ok(10_000), ok(30_000), { outcome: "gave_up", ms: 90_000 }, { outcome: "timeout", ms: 120_000 }, undefined], null);
    expect(s.n).toBe(4);
    expect(s.success).toBe(2);
    expect(s.gaveUp).toBe(1);
    expect(s.timeout).toBe(1);
    expect(s.times).toEqual([10_000, 30_000]);
    expect(s.median).toBe(20_000);
    expect(s.min).toBe(10_000);
    expect(s.max).toBe(30_000);
    expect(s.vsBenchmark).toBeNull();
    expect(s.onTime).toBe(0);
  });

  it("compares the median against the benchmark in seconds", () => {
    const s = timedSummary([ok(20_000), ok(40_000), ok(60_000)], 30);
    expect(s.vsBenchmark).toBeCloseTo(40 / 30);
    expect(s.onTime).toBe(1);
  });

  it("ignores a zero or negative benchmark", () => {
    expect(timedSummary([ok(1000)], 0).vsBenchmark).toBeNull();
    expect(timedSummary([ok(1000)], -5).vsBenchmark).toBeNull();
  });

  it("has no ratio when nobody completed the task", () => {
    const s = timedSummary([{ outcome: "gave_up", ms: 5000 }], 30);
    expect(s.vsBenchmark).toBeNull();
    expect(s.median).toBe(0);
  });
});

describe("labels", () => {
  it("formats the benchmark delta with sign", () => {
    expect(vsBenchmarkLabel(1.35)).toBe("+35 %");
    expect(vsBenchmarkLabel(0.8)).toBe("−20 %");
    expect(vsBenchmarkLabel(1)).toBe("±0 %");
  });
  it("formats the stopwatch", () => {
    expect(clock(4_200)).toBe("4 s");
    expect(clock(59_999)).toBe("59 s");
    expect(clock(60_000)).toBe("1:00");
    expect(clock(125_000)).toBe("2:05");
    expect(clock(-5)).toBe("0 s");
  });
});
