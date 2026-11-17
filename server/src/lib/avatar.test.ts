import { test } from "node:test";
import assert from "node:assert/strict";
import { AVATAR_RE } from "./avatar.js";

test("an avatar is an uploaded photo, with or without its position in the circle", () => {
  for (const ok of ["/uploads/abc123.png", "/uploads/abc.gif#c=0.42,0.3,1.8", "/uploads/abc.webp#c=1,0,4"]) assert.ok(AVATAR_RE.test(ok), ok);
  for (const bad of ["https://evil.example/x.png", "/uploads/abc.svg", "/uploads/abc.png#c=0.5,0.5", "/uploads/abc.png#c=0.5,0.5,2\"><script>", "/uploads/../x.png"])
    assert.ok(!AVATAR_RE.test(bad), bad);
});
