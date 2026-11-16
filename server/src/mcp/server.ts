/**
 * The MCP endpoint (/mcp, Streamable HTTP, stateless). A bearer token (personal access token or OAuth access
 * token) is required; each request builds a fresh server whose tools act as that token's user.
 */
import { Router, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { verifyBearer } from "../lib/apiAccess.js";
import { COOKIE, internalSession, type AuthUser } from "../lib/auth.js";
import { TOOLS, type Api, type Ctx } from "./tools.js";

export const MCP_INSTRUCTIONS = `redekorate is a UX research platform: projects hold studies (surveys, usability tests, card sorts…),
their responses, research documents and insights. Start with list_projects, then get_project.
You act as the signed-in user with their project roles. You can read, create and edit, never delete.
Before building or editing a study, read study_block_reference. Editing a live study changes a draft;
publish_study_changes makes it what participants see.`;

class ApiCallError extends Error {}

/** The app's REST API on this same server, called as `user`. */
export function loopbackApi(apiBase: string, user: AuthUser): Api {
  let cookie: Promise<string> | null = null;
  const call = async (method: string, path: string, body?: unknown) => {
    cookie ??= internalSession(user).then((s) => `${COOKIE}=${s}`);
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: { cookie: await cookie, "x-requested-with": "redekorate", "x-lang": "en", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const issues = Array.isArray(data.issues) ? ` ${data.issues.map((i: any) => `${(i.path ?? []).join(".")}: ${i.message}`).join("; ")}` : "";
      throw new ApiCallError(`${data.error ?? `HTTP ${res.status}`}${issues}`);
    }
    return data;
  };
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b ?? {}), patch: (p, b) => call("PATCH", p, b ?? {}) };
}

export function buildServer(ctx: Ctx) {
  const server = new McpServer({ name: "redekorate", version: "1.0.0" }, { instructions: MCP_INSTRUCTIONS });
  for (const t of TOOLS) {
    server.registerTool(t.name, {
      title: t.title, description: t.description, inputSchema: t.input,
      annotations: { title: t.title, readOnlyHint: !t.writes, destructiveHint: false, idempotentHint: !t.writes, openWorldHint: false },
    }, async (args: any) => {
      try {
        const out = await t.run(args, ctx);
        return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }] };
      } catch (e) {
        if (!(e instanceof ApiCallError)) console.error(`mcp tool ${t.name}`, e);
        return { isError: true, content: [{ type: "text" as const, text: e instanceof ApiCallError ? e.message : "Internal error" }] };
      }
    });
  }
  return server;
}

const bearer = (req: Request) => /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "")?.[1];

export function mcpRouter(opts: { apiBase: string; baseUrl: (req: Request) => string }) {
  const r = Router();
  const challenge = (req: Request, res: Response, error?: string) => res
    .set("WWW-Authenticate", `Bearer resource_metadata="${opts.baseUrl(req)}/.well-known/oauth-protected-resource"${error ? `, error="${error}"` : ""}`)
    .status(401).json({ error: error ?? "unauthorized", error_description: "Sign in with OAuth or send a redekorate access token as a Bearer token" });

  r.post("/", async (req, res) => {
    const raw = bearer(req);
    const user = await verifyBearer(raw);
    if (!user) return challenge(req, res, raw ? "invalid_token" : undefined);
    const server = buildServer({ api: loopbackApi(opts.apiBase, user), baseUrl: opts.baseUrl(req) });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  // Stateless server: no SSE stream to open and no session to end.
  r.all("/", (_req, res) => res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" }));
  return r;
}
