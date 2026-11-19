import { test } from "node:test";
import assert from "node:assert/strict";
import { milestoneProgress, milestoneState } from "./milestones.js";

test("milestone state follows its tickets", () => {
  assert.equal(milestoneState({ total: 4, done: 4, overdue_open: 0, unassigned_open: 0 }), "done");
  assert.equal(milestoneState({ total: 4, done: 1, overdue_open: 2, unassigned_open: 1 }), "behind");
  assert.equal(milestoneState({ total: 4, done: 1, overdue_open: 0, unassigned_open: 1 }), "at_risk");
  assert.equal(milestoneState({ total: 4, done: 1, overdue_open: 0, unassigned_open: 0 }), "on_track");
  assert.equal(milestoneState({ total: 0, done: 0, overdue_open: 0, unassigned_open: 0 }), "on_track");
  // With dates: not started yet is "planned" whatever its tickets say; past its own end date is "behind".
  const open = { total: 4, done: 1, overdue_open: 0, unassigned_open: 1 };
  assert.equal(milestoneState({ ...open, start_date: "2027-01-12", end_date: "2027-03-06" }, "2026-11-11"), "planned");
  assert.equal(milestoneState({ ...open, unassigned_open: 0, start_date: "2026-10-01", end_date: "2026-11-01" }, "2026-11-11"), "behind");
  assert.equal(milestoneState({ ...open, start_date: "2026-11-03", end_date: "2026-12-12" }, "2026-11-11"), "at_risk");
  assert.equal(milestoneState({ total: 4, done: 4, overdue_open: 0, unassigned_open: 0, start_date: "2027-01-12" }, "2026-11-11"), "done");
  assert.equal(milestoneProgress({ total: 9, done: 4 }), 44);
  assert.equal(milestoneProgress({ total: 0, done: 0 }), 0);
});
