import { test } from "node:test";
import assert from "node:assert/strict";
import { briefSince, dueBucket, safeTimeZone, weekEnd } from "./brief.js";

test("the week ends on Sunday (Monday start)", () => {
  assert.equal(weekEnd("2026-11-16"), "2026-11-22");   // Monday
  assert.equal(weekEnd("2026-11-19"), "2026-11-22");   // Thursday
  assert.equal(weekEnd("2026-11-22"), "2026-11-22");   // Sunday closes its own week
  assert.equal(weekEnd("2026-12-30"), "2027-01-03");   // across the year
});

test("due dates fall into overdue, today, this week or nothing", () => {
  const today = "2026-11-19";
  assert.equal(dueBucket("2026-11-18", today), "overdue");
  assert.equal(dueBucket("2025-01-01", today), "overdue");
  assert.equal(dueBucket("2026-11-19", today), "today");
  assert.equal(dueBucket("2026-11-20", today), "week");
  assert.equal(dueBucket("2026-11-22", today), "week");
  assert.equal(dueBucket("2026-11-23", today), null);   // next Monday is next week
  assert.equal(dueBucket(null, today), null);
  // On a Sunday nothing is "later this week".
  assert.equal(dueBucket("2026-11-23", "2026-11-22"), null);
});

test("since: last open, 24 hours on the first one, never more than 7 days back nor ahead", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  assert.equal(briefSince(null, now).toISOString(), "2026-11-18T12:00:00.000Z");
  assert.equal(briefSince(new Date("2026-11-19T08:00:00Z"), now).toISOString(), "2026-11-19T08:00:00.000Z");
  assert.equal(briefSince(new Date("2026-10-01T00:00:00Z"), now).toISOString(), "2026-11-12T12:00:00.000Z");
  // A refresh keeps the start it was given, under the same cap.
  assert.equal(briefSince(new Date("2026-11-19T11:00:00Z"), now, new Date("2026-11-19T07:00:00Z")).toISOString(), "2026-11-19T07:00:00.000Z");
  assert.equal(briefSince(null, now, new Date("2020-01-01T00:00:00Z")).toISOString(), "2026-11-12T12:00:00.000Z");
  assert.equal(briefSince(null, now, new Date("2030-01-01T00:00:00Z")).toISOString(), now.toISOString());
});

test("an unknown time zone falls back to UTC", () => {
  assert.equal(safeTimeZone("Europe/Madrid"), "Europe/Madrid");
  assert.equal(safeTimeZone("Mars/Base"), "UTC");
  assert.equal(safeTimeZone(undefined), "UTC");
  assert.equal(safeTimeZone("x".repeat(100)), "UTC");
});
