import { test } from "node:test";
import assert from "node:assert/strict";
import { TicketFilterInput, cleanLabels, filterTickets, mentionedIds, mostSimilar, reorder, setDiff, severityFromPriority, titleSimilarity } from "./tickets.js";

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

test("filterTickets filters, sorts and pages a board, and names each ticket's column", () => {
  const row = (number: number, title: string, column: string, extra: object = {}) => ({ number, title, type: "task", status: "todo", column, priority: "medium", labels: [], assignees: [], updated_at: `2026-01-0${number}T00:00:00Z`, ...extra });
  const rows = [row(1, "Login fails", "c1", { labels: ["Web"] }), row(2, "Export", "c2"), row(3, "Login copy", "c1", { assignees: [{ id: "u1" }] })];
  const cols = [{ id: "c1", name: "Needs QA" }, { id: "c2", name: "Done" }];
  const all = (f: object) => filterTickets(rows, cols, TicketFilterInput.parse(f));
  assert.deepEqual(all({}).tickets.map((t) => t.number), [3, 2, 1], "newest edit first");
  assert.deepEqual(all({ column: "needs qa", sort: "number_asc" }).tickets.map((t) => t.number), [1, 3]);
  assert.equal(all({ column: "Nowhere" }).total, 0);
  assert.deepEqual(all({ label: "web" }).tickets.map((t) => t.number), [1]);
  assert.deepEqual(all({ assignee_id: "00000000-0000-4000-8000-000000000001" }).total, 0);
  assert.deepEqual(all({ query: "LOGIN", limit: "1", page: "7" }), { total: 2, page: 2, pages: 2, limit: 1, tickets: [{ ...rows[0], column_name: "Needs QA" }] });
});
