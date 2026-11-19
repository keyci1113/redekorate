import { test } from "node:test";
import assert from "node:assert/strict";
import { emailFor, recipients, sentence, type NoticeRow } from "./notify.js";

const row = (over: Partial<NoticeRow>): NoticeRow => ({ kind: "assigned", data: {}, lang: "en", actor_name: "Ana Ríos", number: 7, title: "Checkout button hidden", project_name: "Fintech", ...over });

test("the person who made the change is never told about it, and nobody is told twice", () => {
  assert.deepEqual(recipients(["a", "b", "a", null, undefined, "me"], "me"), ["a", "b"]);
  assert.deepEqual(recipients(["me"], "me"), []);
  assert.deepEqual(recipients(["a"], null), ["a"]);
});

test("each kind of notification reads as one plain sentence, in the reader's language", () => {
  assert.equal(sentence(row({})), "Ana Ríos assigned you #7");
  assert.equal(sentence(row({ kind: "tagged" })), "Ana Ríos tagged you on #7");
  assert.equal(sentence(row({ kind: "status", data: { from: "todo", to: "in_review" } })), "Ana Ríos moved #7 from To do to In review");
  assert.equal(sentence(row({ kind: "comment" })), "Ana Ríos commented on #7");
  assert.equal(sentence(row({ kind: "status", lang: "es", data: { from: "in_progress", to: "done" } })), "Ana Ríos movió #7 de En progreso a Hecho");
  assert.equal(sentence(row({ actor_name: null })), "The feedback widget assigned you #7");
});

test("the email names the project and ticket, links to it, and says how to turn emails off", () => {
  const mail = emailFor(row({ kind: "comment", data: { excerpt: "Can you check this?" } }), "https://app.test/projects/p1/tickets/7");
  assert.equal(mail.subject, "[Fintech] Ana Ríos commented on #7: Checkout button hidden");
  assert.match(mail.text, /"Can you check this\?"/);
  assert.match(mail.text, /https:\/\/app\.test\/projects\/p1\/tickets\/7/);
  assert.match(mail.text, /My account/);
});
