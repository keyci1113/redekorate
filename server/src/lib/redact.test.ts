import { test } from "node:test";
import assert from "node:assert/strict";
import { redactContacts } from "./redact.js";

test("contacts typed into answers are removed, dates and numbers stay", () => {
  assert.equal(redactContacts("Escríbanme a qa.participante1@example.com"), "Escríbanme a [email removed]");
  assert.equal(redactContacts("Call +1 (949) 555-0100 or 5551234567"), "Call [phone removed] or [phone removed]");
  for (const keep of ["2026-11-18", "18/11/2026", "score 10 of 2026", "order 123456", "pi 3.1415926"]) assert.equal(redactContacts(keep), keep);
  assert.deepEqual(redactContacts({ selected: ["a"], other: "mail me: a@b.co" }), { selected: ["a"], other: "mail me: [email removed]" });
});
