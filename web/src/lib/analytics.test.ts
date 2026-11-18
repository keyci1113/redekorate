import { describe, expect, it } from "vitest";
import { overview } from "./analytics";
import type { Answer, Session } from "./types";

const s = (id: string, start: string, end: string | null): Session => ({ id, started_at: start, completed_at: end } as Session);
const a = (session_id: string, ms: number): Answer => ({ session_id, block_id: "q", value: 1, duration_ms: ms });

describe("study median time", () => {
  it("is the median of completed sessions' completed_at − started_at", () => {
    const o = overview([s("1", "2026-01-01T00:00:00Z", "2026-01-01T00:01:00Z"), s("2", "2026-01-01T00:00:00Z", "2026-01-01T00:03:00Z"),
      s("3", "2026-01-01T00:00:00Z", "2026-01-01T00:05:00Z"), s("4", "2026-01-01T00:00:00Z", null)]);
    expect(o.medianMs).toBe(180_000);
    expect(o.completed).toBe(3);
  });
  it("is never less than a single question's median", () => {
    // These sessions started on leaving the first screen, so their clock missed a 90 s question.
    const sessions = [s("1", "2026-01-01T00:00:00Z", "2026-01-01T00:00:20Z"), s("2", "2026-01-01T00:00:00Z", "2026-01-01T00:00:30Z")];
    const o = overview(sessions, [a("1", 90_000), a("2", 95_000)]);
    expect(o.medianMs).toBeGreaterThanOrEqual(92_500);
  });
});
