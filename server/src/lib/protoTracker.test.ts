// The tracker is JavaScript kept in a template string, so the compiler never sees it: this catches a syntax slip before it ships.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKER, injectTracker } from "./protoTracker.js";

test("the tracker script parses", () => {
  assert.doesNotThrow(() => new Function(TRACKER));
});

test("the tracker tells the parent whether it reached the requested screen", () => {
  assert.match(TRACKER, /type: "goto", name: text\(name\), ok: ok \}/);
});

test("the tracker tag goes first in the head so it runs before the prototype", () => {
  assert.match(injectTracker("<html><head><title>x</title></head></html>"), /<head><script src="\/proto-tracker\.js"/);
});
