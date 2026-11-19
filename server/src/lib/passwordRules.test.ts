import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_MIN_LENGTH, brokenPasswordRule } from "./passwordRules.js";
import { passwordProblem } from "./security.js";

test("the shared password rules: length, letters and digits, not one repeated character", () => {
  assert.equal(brokenPasswordRule("abc123"), "length");
  assert.equal(brokenPasswordRule("abcdefghijkl"), "letters_and_digits");
  assert.equal(brokenPasswordRule("1234567890"), "letters_and_digits");
  assert.equal(brokenPasswordRule("research2026"), null);
});

test("the server's message names the same minimum length the web app shows", () => {
  assert.match(passwordProblem("short1")!, new RegExp(`\\b${PASSWORD_MIN_LENGTH}\\b`));
  assert.equal(passwordProblem("research2026"), null);
});
