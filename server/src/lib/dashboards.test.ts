import { test } from "node:test";
import assert from "node:assert/strict";
import { bindNamed, pagePath, periodRange, projectHealth, topCounts } from "./dashboards.js";
import { milestoneProgress, milestoneState } from "./milestones.js";

const NOW = new Date(2026, 10, 11, 12);   // Wed Nov 11, 2026

test("named placeholders get numbers after the base parameters, only when the SQL uses them", () => {
  assert.deepEqual(bindNamed("t.status <> 'done'", ["u", null], { since: 1, arg: "x" }), { sql: "t.status <> 'done'", params: ["u", null] });
  assert.deepEqual(bindNamed("a = {arg} and b >= {since} and c < {arg}", ["u", null], { since: 1, arg: "x" }), { sql: "a = $3 and b >= $4 and c < $3", params: ["u", null, "x", 1] });
  // unknown names stay as they are, and a value equal to a base parameter still gets its own number
  assert.deepEqual(bindNamed("{other} {arg}", ["u"], { arg: "u" }), { sql: "{other} $2", params: ["u", "u"] });
});

test("a period of N days starts N days ago and the previous one has the same length", () => {
  const r = periodRange("30", NOW);
  assert.equal(r.days, 30);
  assert.equal(NOW.getTime() - r.since.getTime(), 30 * 864e5);
  assert.equal(r.since.getTime() - r.before.getTime(), 30 * 864e5);
});

test("this quarter starts on the first day of the quarter", () => {
  const r = periodRange("quarter", NOW);
  assert.deepEqual([r.since.getFullYear(), r.since.getMonth(), r.since.getDate()], [2026, 9, 1]);
  assert.equal(r.days, 42);
});

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

test("project health escalates with its signals", () => {
  const calm = { overdue: 0, low_completion: 0, milestones_behind: 0, responses_7d: 12, ticket_changes_7d: 3 };
  assert.equal(projectHealth(calm), "on_track");
  assert.equal(projectHealth({ ...calm, overdue: 1 }), "needs_attention");
  assert.equal(projectHealth({ ...calm, low_completion: 2 }), "needs_attention");
  assert.equal(projectHealth({ ...calm, overdue: 2, low_completion: 1 }), "at_risk");
  assert.equal(projectHealth({ ...calm, milestones_behind: 1 }), "at_risk");
  assert.equal(projectHealth({ ...calm, responses_7d: 0, ticket_changes_7d: 0 }), "quiet");
  assert.equal(projectHealth({ ...calm, responses_7d: 0, ticket_changes_7d: 0, overdue: 1 }), "needs_attention");
});

test("page paths drop the host, query and trailing slash", () => {
  assert.equal(pagePath("https://app.example.com/caja/cierre?fecha=2026-11-11#x"), "/caja/cierre");
  assert.equal(pagePath("https://app.example.com/"), "/");
  assert.equal(pagePath("not a url"), null);
  assert.equal(pagePath(null), null);
});

test("top counts keep the most frequent and fold the rest", () => {
  assert.deepEqual(topCounts(["a", "b", "a", "c", "b", "a", "d"], 2), { top: [{ key: "a", n: 3 }, { key: "b", n: 2 }], other: 2 });
  assert.deepEqual(topCounts([], 3), { top: [], other: 0 });
});
