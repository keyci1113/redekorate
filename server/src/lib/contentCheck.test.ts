import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDocument, checkStudy } from "./contentCheck.js";

const paths = (issues: { path: string }[]) => issues.map((i) => i.path);
const opts = [{ id: "o1", label: "A" }, { id: "o2", label: "B" }];

test("study blocks the app cannot use are refused, with where", () => {
  // Everything the audit sent and the server took.
  const issues = checkStudy([
    { id: "b1", type: "welcome", title: "Hi" },
    { id: "b2", type: "choice", title: "No options" },
    { id: "b2", type: "choice", title: "Repeated id", options: opts },
    { id: "b4", type: "choice", title: "Bad logic", options: opts, logic: { rules: [{ id: "r", op: "equals", value: "o1", goTo: "b99" }, { id: "r2", op: "is", value: "A", goTo: "b5" }] } },
    { id: "b5", type: "scale", title: "Backwards", min: 10, max: 1 },
    { id: "b6", type: "thank_you", title: "Too early" },
    { id: "b7", type: "choice", title: "Options as text", options: "A, B" },
  ], { language: "fr" });
  for (const p of ["settings.language", "blocks.1.options", "blocks.2.id", "blocks.3.logic.rules.0.op", "blocks.3.logic.rules.1.value", "blocks.4.max", "blocks.5", "blocks.6.options"])
    assert.ok(paths(issues).includes(p), `${p} missing from ${JSON.stringify(paths(issues))}`);
});

test("logic must jump forward to a real block, with values that fit the block", () => {
  const blocks = [
    { id: "a", type: "yes_no", title: "?", logic: { rules: [{ id: "r", op: "is", value: "si", goTo: "c" }], otherwise: "a" } },
    { id: "b", type: "nps", title: "?", logic: { rules: [{ id: "r", op: "gt", value: "x", goTo: "end" }] } },
    { id: "c", type: "open_question", title: "?", logic: { rules: [{ id: "r", op: "success", goTo: "end" }] } },
  ];
  assert.deepEqual(paths(checkStudy(blocks)), ["blocks.0.logic.rules.0.value", "blocks.0.logic.otherwise", "blocks.1.logic.rules.0", "blocks.2.logic.rules.0.op"]);
});

test("a well-formed study passes", () => {
  assert.deepEqual(checkStudy([
    { id: "w", type: "welcome", title: "Hi", buttonLabel: "Go" },
    { id: "q", type: "choice", title: "Pick", options: opts, logic: { rules: [{ id: "r", op: "is", value: "o2", goTo: "end" }], otherwise: "s" } },
    { id: "s", type: "scale", title: "Rate", min: 1, max: 5, logic: { rules: [{ id: "r", op: "lt", value: 3, goTo: "t" }] } },
    { id: "y", type: "yes_no", title: "?", logic: { rules: [{ id: "r", op: "is", value: "no", goTo: "t" }] } },
    { id: "t", type: "thank_you", title: "Thanks" },
  ], { language: "en" }), []);
});

test("diagrams need nodes the canvas draws and edges between them; documents only take their own sections", () => {
  assert.deepEqual(paths(checkDocument("diagram", {
    nodes: [{ id: "n1", shape: "star", x: 0, y: 0, color: "red" }, { id: "n2", shape: "rect", text: "no position" }],
    edges: [{ id: "e", from: "n1", to: "n99" }],
  })), ["data.nodes.0.shape", "data.nodes.0.color", "data.nodes.1", "data.edges.0.to"]);
  assert.deepEqual(paths(checkDocument("moodboard", { nodes: "text" })), ["data.nodes"]);
  assert.deepEqual(checkDocument("diagram", { nodes: [{ id: "a", shape: "rounded", x: 0, y: 0, w: 160, h: 80, text: "A", color: "blue" }], edges: [] }), []);
  assert.deepEqual(paths(checkDocument("interview_guide", { topic: "not an object", questions: ["ok", 3], extra: 1 })), ["data.topic", "data.questions", "data.extra"]);
  assert.deepEqual(checkDocument("interview_guide", { questions: ["Tell me about it"] }), []);
});
