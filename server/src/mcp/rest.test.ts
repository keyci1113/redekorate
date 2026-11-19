import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { openApiDocument, toolsApi } from "./rest.js";
import { TOOLS } from "./tools.js";

const doc = openApiDocument("https://rk.example");

test("the OpenAPI document has exactly one POST operation per MCP tool, and nothing else", () => {
  assert.equal(doc.openapi, "3.1.0");
  assert.deepEqual(doc.servers, [{ url: "https://rk.example/api/v1/tools" }]);
  assert.deepEqual(Object.keys(doc.paths).sort(), TOOLS.map((t) => `/${t.name}`).sort());
  for (const t of TOOLS) {
    const p = doc.paths[`/${t.name}`] as Record<string, any>;
    assert.deepEqual(Object.keys(p), ["post"], `${t.name} has only POST`);
    assert.equal(p.post.operationId, t.name);
    // GPT actions ask the person before anything that writes, and only then.
    assert.equal(p.post["x-openai-isConsequential"], t.writes, t.name);
    assert.deepEqual(p.post.tags, [t.writes ? "write" : "read"]);
  }
  for (const path of Object.keys(doc.paths)) assert.doesNotMatch(path, /delete|remove|archive/i, "no operation deletes");
});

test("each operation's body schema is its tool's input, as a caller sends it, and refuses unknown fields", () => {
  for (const t of TOOLS) {
    const s = (doc.paths[`/${t.name}`] as any).post.requestBody.content["application/json"].schema;
    assert.equal(s.type, "object", t.name);
    assert.equal(s.$schema, undefined, `${t.name}: no $schema inside an OpenAPI document`);
    assert.equal(s.additionalProperties, false, t.name);
    assert.deepEqual(Object.keys(s.properties ?? {}).sort(), Object.keys(t.input).sort(), t.name);
  }
  const getStudy = (doc.paths["/get_study"] as any).post.requestBody.content["application/json"].schema;
  assert.deepEqual(getStudy.required, ["study_id"]);
});

async function serve() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/tools", toolsApi({ apiBase: "http://127.0.0.1:1/api", baseUrl: () => "https://rk.example" }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/tools`;
  return { base, close: () => server.close() };
}

test("routes: the spec is public, operations need a token, unknown ones and other methods are refused", async () => {
  const { base, close } = await serve();
  try {
    const spec = await fetch(`${base}/openapi.json`);
    assert.equal(spec.status, 200);
    assert.equal((await spec.json()).servers[0].url, "https://rk.example/api/v1/tools");

    const none = await fetch(`${base}/whoami`, { method: "POST" });
    assert.equal(none.status, 401);
    assert.equal(none.headers.get("www-authenticate"), "Bearer");

    // A token that isn't one of ours is rejected before any database lookup.
    const bad = await fetch(`${base}/whoami`, { method: "POST", headers: { authorization: "Bearer nope" } });
    assert.equal(bad.status, 401);
    assert.match(bad.headers.get("www-authenticate") ?? "", /invalid_token/);

    assert.equal((await fetch(`${base}/delete_project`, { method: "POST" })).status, 404);
    const get = await fetch(`${base}/whoami`);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
  } finally { close(); }
});
