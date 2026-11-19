import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLabels, mentionedIds, mostSimilar, reorder, setDiff, severityFromPriority, titleSimilarity } from "./tickets.js";

const people = [{ id: "ana", name: "Ana" }, { id: "anar", name: "Ana Ríos" }, { id: "luis", name: "Luis Mejía" }];

test("mentions are found by full name, ignoring case and accents", () => {
  assert.deepEqual(mentionedIds("@luis mejia parece el mismo cálculo", people), ["luis"]);
  assert.deepEqual(mentionedIds("Necesito las citas, @Ana Ríos.", people), ["anar"]);
});

test("a longer name is not also counted as the shorter one it starts with", () => {
  assert.deepEqual(mentionedIds("@Ana Ríos y @Ana, revisen", people).sort(), ["ana", "anar"]);
  assert.deepEqual(mentionedIds("@Ana Ríos revisa", people), ["anar"]);
});

test("a mention needs the @ and a whole name", () => {
  assert.deepEqual(mentionedIds("Luis Mejía lo vio", people), []);
  assert.deepEqual(mentionedIds("@Anastasia lo vio", people), []);
  assert.deepEqual(mentionedIds("", people), []);
});

test("labels are trimmed, de-duplicated without case and capped", () => {
  assert.deepEqual(cleanLabels(["  POS ", "pos", "", "cierre  de caja"]), ["POS", "cierre de caja"]);
  assert.equal(cleanLabels(Array.from({ length: 30 }, (_, i) => `l${i}`)).length, 20);
});

test("setDiff reports what was added and removed", () => {
  assert.deepEqual(setDiff(["a", "b"], ["b", "c"]), { added: ["c"], removed: ["a"] });
  assert.deepEqual(setDiff([], []), { added: [], removed: [] });
});

test("reorder drops a card before another one or at the end", () => {
  assert.deepEqual(reorder(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(reorder(["a", "b", "c"], "a", null), ["b", "c", "a"]);
  assert.deepEqual(reorder(["a", "b"], "x", "b"), ["a", "x", "b"]);
  assert.deepEqual(reorder(["a", "b"], "x", "missing"), ["a", "b", "x"]);
});

test("similar titles are suggested for a merge, unrelated ones are not", () => {
  const a = { id: "1", title: "El total del cierre no coincide con el POS cuando hay devoluciones" };
  const b = { id: "2", title: "Totales del cierre no coinciden con el POS" };
  const c = { id: "3", title: "Copy del onboarding para cajeros" };
  assert.ok(titleSimilarity(a.title, a.title) === 1);
  assert.equal(mostSimilar(a, [a, c]), null);
  assert.equal(mostSimilar(a, [a, b, c])?.id, "2");   // singular and plural forms count as the same word
  assert.equal(mostSimilar(c, [a, b, c]), null);
});

test("an insight made from a ticket takes its severity from the ticket's priority", () => {
  assert.equal(severityFromPriority("urgent"), "critical");
  assert.equal(severityFromPriority("high"), "high");
  assert.equal(severityFromPriority("medium"), "medium");
  assert.equal(severityFromPriority("low"), "low");
});
