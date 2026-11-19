import { test } from "node:test";
import assert from "node:assert/strict";
import { builtInColumns, columnsProblem, fallbackColumn, findColumn, type Column } from "./board.js";

const custom: Column[] = [
  { id: "a", name: "Backlog", status: "todo", custom: true },
  { id: "b", name: "Next up", status: "todo", custom: true },
  { id: "c", name: "QA", status: "in_review", custom: true },
  { id: "d", name: "Shipped", status: "done", custom: true },
];

test("built-in columns are the four statuses", () => {
  assert.deepEqual(builtInColumns().map((c) => c.id), ["todo", "in_progress", "in_review", "done"]);
});

test("finds a column by id, by status, or the first one", () => {
  assert.equal(findColumn(custom, "c")?.name, "QA");
  assert.equal(findColumn(custom, "done")?.name, "Shipped", "a status key reaches the first column that counts as it");
  assert.equal(findColumn(custom, undefined, "todo")?.name, "Backlog");
  assert.equal(findColumn(custom, undefined, "in_progress"), null, "no column counts as in progress here");
  assert.equal(findColumn(custom, "nope"), null);
  assert.equal(findColumn(builtInColumns(), "in_review")?.status, "in_review");
});

test("a board needs sensible columns", () => {
  const ok = [{ name: "Backlog", status: "todo" as const }, { name: "Done", status: "done" as const }];
  assert.equal(columnsProblem(ok), null);
  assert.equal(columnsProblem([ok[0]]), "count");
  assert.equal(columnsProblem([...ok, { name: " ", status: "todo" }]), "name");
  assert.equal(columnsProblem([...ok, { name: "backlog", status: "in_progress" }]), "duplicate");
  assert.equal(columnsProblem([{ name: "Doing", status: "in_progress" }, ok[1]]), "todo");
  assert.equal(columnsProblem([ok[0], { name: "Doing", status: "in_progress" }]), "done");
  // Done columns go last: a QA column in front of the final Done cannot count as Done.
  assert.equal(columnsProblem([ok[0], { name: "QA", status: "done" }, { name: "Released", status: "in_review" }]), "done_last");
  assert.equal(columnsProblem([ok[0], { name: "QA", status: "done" }, { name: "Doing", status: "in_progress" }, { name: "Shipped", status: "done" }]), "done_last");
  assert.equal(columnsProblem([ok[0], { name: "Verified", status: "done" }, { name: "Shipped", status: "done" }]), null, "several done columns at the end are fine");
  assert.equal(columnsProblem(Array.from({ length: 13 }, (_, i) => ({ name: `C${i}`, status: i ? "done" as const : "todo" as const }))), "count");
});

test("tickets of a removed column go somewhere sensible", () => {
  const kept = custom.filter((c) => c.id !== "a");
  assert.equal(fallbackColumn({ status: "todo" }, kept).id, "b");
  assert.equal(fallbackColumn({ status: "todo" }, kept, "d").id, "d");
  assert.equal(fallbackColumn({ status: "in_progress" }, kept).id, "b", "nothing with that status: the first column");
  assert.equal(fallbackColumn({ status: "todo" }, kept, "gone").id, "b");
});
