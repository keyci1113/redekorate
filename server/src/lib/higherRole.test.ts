import { test } from "node:test";
import assert from "node:assert/strict";
import { higherRole } from "./access.js";

test("a document's role is the higher of the project role and the share", () => {
  assert.equal(higherRole(null, null), null);
  assert.equal(higherRole(null, "commenter"), "commenter");
  assert.equal(higherRole("editor", undefined), "editor");
  assert.equal(higherRole("viewer", "editor"), "editor");
  assert.equal(higherRole("owner", "viewer"), "owner");
  assert.equal(higherRole("commenter", "commenter"), "commenter");
});
