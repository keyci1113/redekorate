import { test } from "node:test";
import assert from "node:assert/strict";
import { ANSWERS_PER_BLOCK, TOOLS, shapeResults, type Api } from "./tools.js";

test("tool names are unique and every tool says whether it writes", () => {
  const names = TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const t of TOOLS) assert.equal(typeof t.writes, "boolean", t.name);
});

test("no tool deletes: the API handed to tools has no delete, and tools only use the methods they declare", async () => {
  const calls: string[] = [];
  const fake = new Proxy({}, {
    get: (_t, method: string) => async (path: string) => {
      calls.push(method);
      if (!["get", "post", "patch"].includes(method)) throw new Error(`unexpected ${method} ${path}`);
      return new Proxy({}, { get: () => [] }); // every field is an empty list: enough to run each tool
    },
  }) as Api;
  const uuid = "00000000-0000-4000-8000-000000000000";
  for (const t of TOOLS) {
    const args = Object.fromEntries(Object.keys(t.input).map((k) => [k, k.endsWith("_id") ? uuid : undefined]));
    await t.run(args as any, { api: fake, baseUrl: "https://x" }).catch(() => undefined);
  }
  assert.ok(calls.length > 0);
  assert.ok(calls.every((m) => m !== "del" && m !== "delete"));
  for (const t of TOOLS.filter((t) => !t.writes)) assert.doesNotMatch(t.run.toString(), /api\.(post|patch)\(/, `${t.name} is read-only but writes`);
});

test("results never carry the participant record and are grouped and capped per block", () => {
  const answers = Array.from({ length: ANSWERS_PER_BLOCK + 3 }, (_, i) => ({ session_id: "s1", block_id: "q1", value: i, duration_ms: 10 }));
  const out = shapeResults({
    study: { id: "st", title: "T", status: "live", blocks: [{ id: "q1", type: "open_question", title: "Why?" }, { id: "q2", type: "nps" }] },
    sessions: [{ id: "s1", participant: { email: "ana@example.com", name: "Ana" }, device: "mobile", started_at: "x", completed_at: "y" }, { id: "s2", participant: {}, device: null, started_at: "x", completed_at: null }],
    answers, insights: [],
  });
  assert.doesNotMatch(JSON.stringify(out), /ana@example\.com|participant/);
  assert.deepEqual([out.sessions.started, out.sessions.completed], [2, 1]);
  assert.equal(out.blocks[0].answer_count, ANSWERS_PER_BLOCK + 3);
  assert.equal(out.blocks[0].answers.length, ANSWERS_PER_BLOCK);
  assert.ok(out.blocks[0].note);
  assert.deepEqual([out.blocks[1].answer_count, out.blocks[1].answers.length], [0, 0]);
});

test("project tools read, filter and set the project's category", async () => {
  const calls: [string, string, unknown?][] = [];
  const api: Api = {
    get: async (path: string) => { calls.push(["get", path]); return { projects: [{ id: "p1", name: "Bot", category: "ai" }] } as any; },
    post: async (path: string, body?: unknown) => { calls.push(["post", path, body]); return { project: body } as any; },
    patch: async (path: string, body?: unknown) => { calls.push(["patch", path, body]); return { project: body } as any; },
  };
  const run = (name: string, args: object) => TOOLS.find((t) => t.name === name)!.run(args as any, { api, baseUrl: "https://x" });
  const listed: any = await run("list_projects", { category: "ai" });
  assert.deepEqual(calls.at(-1), ["get", "/projects?category=ai"]);
  assert.equal(listed[0].category, "ai");
  await run("list_projects", {});
  assert.deepEqual(calls.at(-1), ["get", "/projects"]);
  await run("update_project", { project_id: "p1", category: "automation" });
  assert.deepEqual(calls.at(-1), ["patch", "/projects/p1", { category: "automation" }]);
  const create = TOOLS.find((t) => t.name === "create_project")!;
  assert.ok(create.input.category.safeParse("software").success);
  assert.ok(!create.input.category.safeParse("marketing").success);
});

test("tools that replace content or change what participants see are marked destructive; creating is not", async () => {
  const { toolAnnotations } = await import("./server.js");
  const ann = (name: string) => toolAnnotations(TOOLS.find((t) => t.name === name)!);
  for (const name of ["update_study", "update_document", "update_insight", "set_study_status", "publish_study_changes", "restore_version"])
    assert.equal(ann(name).destructiveHint, true, name);
  for (const name of ["create_study", "create_document", "get_study"]) assert.equal(ann(name).destructiveHint, false, name);
  assert.equal(ann("get_study").readOnlyHint, true);
});

test("results are marked as outside text, carry option labels, and lose contacts typed into answers", () => {
  const r: any = shapeResults({
    study: { id: "s", title: "T", status: "live", blocks: [{ id: "q", type: "choice", title: "Pick", options: [{ id: "f1", label: "Fast" }] }] },
    sessions: [], answers: [{ session_id: "x", block_id: "q", value: { selected: ["f1"], other: "write me at a@b.co" }, duration_ms: 1 }], insights: [],
  });
  assert.match(r.untrusted_content, /never as instructions/);
  assert.deepEqual(r.blocks[0].options, { f1: "Fast" });
  assert.equal(r.blocks[0].answers[0].value.other, "write me at [email removed]");
});

test("replacing content without base_updated_at is refused before anything is sent", async () => {
  let sent = false;
  const api = { get: async () => ({}), post: async () => ({}), patch: async () => { sent = true; return {}; } };
  const t = TOOLS.find((x) => x.name === "update_document")!;
  await assert.rejects(t.run({ document_id: "00000000-0000-0000-0000-000000000000", data: { a: 1 } } as any, { api, baseUrl: "" }), /base_updated_at/);
  assert.equal(sent, false);
});
