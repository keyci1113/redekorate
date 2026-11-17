import { describe, expect, it } from "vitest";
import { downFromResponse } from "./maintenance";

describe("down detection", () => {
  it("reads maintenance mode from the API's 503", () => {
    expect(downFromResponse(503, { maintenance: true, message: "Back at 3pm" }, true)).toEqual({ kind: "maintenance", message: "Back at 3pm" });
  });
  it("treats the proxy's HTML 502/503/504 as a deploy in progress", () => {
    for (const s of [502, 503, 504]) expect(downFromResponse(s, {}, false)).toEqual({ kind: "deploy" });
  });
  it("leaves ordinary errors alone", () => {
    expect(downFromResponse(500, { error: "x" }, true)).toBeNull();
    expect(downFromResponse(404, {}, false)).toBeNull();
    expect(downFromResponse(503, { error: "busy" }, true)).toBeNull();
  });
});
