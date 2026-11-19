import { test } from "node:test";
import assert from "node:assert/strict";
import { ANSWERS_PER_BLOCK, TOOLS, shapeResults, toolCatalog, toolsFor, type Api } from "./tools.js";

test("the Connect AI apps page lists exactly the tools apps get, with their write flag and inputs", () => {
  const catalog = toolCatalog();
  assert.deepEqual(catalog.map((t) => t.name), TOOLS.map((t) => t.name));
  for (const [i, t] of TOOLS.entries()) {
    assert.equal(catalog[i].writes, t.writes, t.name);
    assert.deepEqual(catalog[i].params, Object.keys(t.input), t.name);
    assert.ok(catalog[i].description.length > 0, t.name);
  }
  // a read-only token gets exactly the tools the page marks as reading
  assert.deepEqual(toolsFor("read").map((t) => t.name), catalog.filter((t) => !t.writes).map((t) => t.name));
  assert.equal(toolsFor("write"), TOOLS);
  // nothing that runs or validates leaks into the JSON the page loads
  assert.deepEqual(Object.keys(catalog[0]).sort(), ["description", "name", "params", "title", "writes"]);
});

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

test("ticket and milestone tools: annotations, filtering by column name, no reporter details, versions by number", async () => {
  const { toolAnnotations, MCP_INSTRUCTIONS } = await import("./server.js");
  const ann = (name: string) => toolAnnotations(TOOLS.find((t) => t.name === name)!);
  for (const name of ["update_ticket", "update_milestone", "restore_version"]) assert.equal(ann(name).destructiveHint, true, name);
  for (const name of ["create_ticket", "comment_on_ticket", "link_ticket", "create_milestone"]) assert.deepEqual([ann(name).destructiveHint, ann(name).readOnlyHint], [false, false], name);
  for (const name of ["list_tickets", "get_ticket", "get_ticket_screenshot", "list_milestones", "my_work"]) assert.equal(ann(name).readOnlyHint, true, name);
  for (const name of ["list_tickets", "get_ticket", "create_ticket", "update_ticket", "comment_on_ticket", "link_ticket", "list_milestones", "create_milestone", "update_milestone", "my_work", "get_ticket_screenshot", "from_feedback_widget"])
    assert.ok(MCP_INSTRUCTIONS.includes(name), `the instructions mention ${name}`);

  const calls: [string, string, unknown?][] = [];
  const board = {
    columns: [{ id: "todo", name: null, status: "todo" }, { id: "c2", name: "Needs QA", status: "in_review" }],
    tickets: [
      { number: 1, title: "A", type: "bug", status: "in_review", column: "c2", priority: "high", labels: [], assignees: [], updated_at: "2026-01-02", source: "widget", widget_ref: "FB-1" },
      { number: 2, title: "B", type: "task", status: "todo", column: "todo", priority: "low", labels: [], assignees: [], updated_at: "2026-01-01", source: "manual", widget_ref: null },
    ],
    people: [{ id: "u1", name: "Ana", email: "ana@team.co", role: "owner" }], milestones: [],
    ticket: { number: 1, source: "widget", widget_ref: "FB-1", updated_at: "x", reporters: [{ name: "Rita", email: "rita@x.com", verified: false, reports_count: 2, attachments: { screenshot: "/uploads/a1.png" } }], comments: [{ user_id: null, name: "Rita", body: "hi" }] },
  };
  const api: Api = {
    get: async (path: string) => { calls.push(["get", path]); return board as any; },
    post: async (path: string, body?: unknown) => { calls.push(["post", path, body]); return { ticket: { number: 3, links: [], comments: [] } } as any; },
    patch: async (path: string, body?: unknown) => { calls.push(["patch", path, body]); return { ticket: { number: 1 } } as any; },
  };
  const run = (name: string, args: object) => TOOLS.find((t) => t.name === name)!.run(args as any, { api, baseUrl: "https://x", actor: null as any });
  const listed: any = await run("list_tickets", { project_id: "p", column: "needs qa" });
  assert.deepEqual([listed.total, listed.tickets[0].column, listed.tickets[0].from_feedback_widget], [1, "Needs QA", true]);
  assert.match(listed.untrusted_content, /outside the team/);
  assert.deepEqual(listed.columns.map((c: any) => c.name), ["To do", "Needs QA"]);
  assert.ok(!JSON.stringify(listed).includes("FB-1"));
  const one: any = await run("get_ticket", { project_id: "p", number: 1 });
  assert.doesNotMatch(JSON.stringify(one), /rita@x\.com|Rita|FB-1/);
  assert.equal(one.screenshot_count, 1);

  await run("create_ticket", { project_id: "p", title: "New", column: "Needs QA", insight_ids: ["i1"] });
  assert.deepEqual(calls.at(-1), ["post", "/projects/p/tickets", { title: "New", column: "c2", links: [{ target_type: "insight", target_id: "i1", relation: "evidence" }] }]);
  await assert.rejects(run("update_ticket", { project_id: "p", number: 1, description: "x" }), /base_updated_at/);
  await assert.rejects(run("create_ticket", { project_id: "p", title: "New", column: "Nowhere" }), /No column "Nowhere"/);
  await run("list_versions", { of: "ticket", project_id: "p", number: 4 });
  assert.deepEqual(calls.at(-1), ["get", "/projects/p/tickets/4/versions"]);
  await assert.rejects(run("list_versions", { of: "ticket", id: "00000000-0000-4000-8000-000000000000" }), /project_id and number/);
});
