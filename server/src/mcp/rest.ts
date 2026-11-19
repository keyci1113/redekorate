/**
 * The MCP tools over plain HTTP, for AI apps that don't speak MCP (ChatGPT GPT actions, Gemini, n8n, Zapier,
 * custom agents and scripts): one POST /api/v1/tools/<tool> per MCP tool, described by an OpenAPI 3.1 document
 * at /api/v1/tools/openapi.json.
 *
 * It is not a second API: the same list, the same input schemas, the same code, the same tokens. So it reads,
 * creates and edits but never deletes, a read-only token only gets the operations that read, and participant
 * details are dropped exactly as they are for MCP.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { verifyBearer } from "../lib/apiAccess.js";
import { ApiCallError, MCP_INSTRUCTIONS, bearer, loopbackApi, outsideActor } from "./server.js";
import { ImageResult, TOOLS, ToolError, toolsFor, type ToolDef } from "./tools.js";
import { HttpError } from "../lib/http.js";
import { translate } from "../lib/i18n.js";

export const API_VERSION = "1.0.0";
/** Where the operations live, relative to the app's address. */
export const TOOLS_PATH = "/api/v1/tools";

/** One tool's input as a JSON Schema, as a caller sends it: fields with defaults are optional, unknown ones refused. */
export function inputSchema(t: ToolDef) {
  const { $schema: _, ...schema } = z.toJSONSchema(z.object(t.input).strict(), { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  return schema;
}

const ERRORS = {
  BadRequest: "The input is not valid, or the app refused the change.",
  Unauthorized: "No token, or the token is not valid any more.",
  Forbidden: "The token is read-only, or your role in the project does not allow this.",
  NotFound: "Not found, or you don't have access to it.",
  Conflict: "It changed since you read it: read it again and send your change on top.",
  TooManyRequests: "Too many requests. Wait a minute.",
};
const errorRef = (name: keyof typeof ERRORS) => ({ $ref: `#/components/responses/${name}` });

/** The OpenAPI document, generated from TOOLS so it can never describe an operation that isn't there. */
export function openApiDocument(baseUrl: string) {
  const paths: Record<string, unknown> = {};
  for (const t of TOOLS) {
    paths[`/${t.name}`] = {
      post: {
        operationId: t.name,
        summary: t.title,
        description: `${t.description}${t.writes ? "\n\nWrites: needs a token with write access." : ""}`,
        tags: [t.writes ? "write" : "read"],
        // GPT actions: reads run without asking the person each time; anything that writes asks first.
        "x-openai-isConsequential": t.writes,
        requestBody: { required: false, content: { "application/json": { schema: inputSchema(t) } } },
        responses: {
          200: { description: "The result. Its shape is the operation's own.", content: { "application/json": { schema: {} } } },
          400: errorRef("BadRequest"), 401: errorRef("Unauthorized"), 403: errorRef("Forbidden"),
          404: errorRef("NotFound"), 409: errorRef("Conflict"), 429: errorRef("TooManyRequests"),
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "redekorate AI operations",
      version: API_VERSION,
      description: `${MCP_INSTRUCTIONS.replace(/\n/g, " ")}\n\nEvery operation is a POST with a JSON body. `
        + "Authenticate with a personal access token from Connect AI apps (Authorization: Bearer rdk_pat_…). "
        + "The same operations are available as an MCP server at /mcp.",
    },
    servers: [{ url: `${baseUrl}${TOOLS_PATH}` }],
    security: [{ bearerAuth: [] }],
    tags: [{ name: "read", description: "Reads only" }, { name: "write", description: "Creates or edits; never deletes" }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "A redekorate personal access token (rdk_pat_…) or OAuth access token" } },
      responses: Object.fromEntries(Object.entries(ERRORS).map(([name, description]) =>
        [name, { description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }])),
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "string" }, issues: { type: "array", items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } } } },
          required: ["error"],
        },
      },
    },
  };
}

export function toolsApi(opts: { apiBase: string; baseUrl: (req: Request) => string }) {
  const r = Router();
  const byName = new Map(TOOLS.map((t) => [t.name, t]));
  const fail = (res: Response, status: number, error: string, extra: object = {}) => res.status(status).json({ error, ...extra });

  r.get("/openapi.json", (req, res) => { res.set("Cache-Control", "public, max-age=300").json(openApiDocument(opts.baseUrl(req))); });

  r.post("/:op", async (req, res) => {
    const t = byName.get(req.params.op);
    if (!t) return fail(res, 404, `Unknown operation. See ${opts.baseUrl(req)}${TOOLS_PATH}/openapi.json`);
    const raw = bearer(req);
    const access = await verifyBearer(raw);
    if (!access) {
      res.set("WWW-Authenticate", `Bearer${raw ? ' error="invalid_token"' : ""}`);
      return fail(res, 401, raw ? "invalid_token" : "unauthorized", { error_description: "Send a redekorate access token as a Bearer token" });
    }
    if (!toolsFor(access.scope).includes(t)) return fail(res, 403, "This token is read-only");

    // Strict, like the MCP tools: a misspelled field is refused by name instead of being dropped without a word.
    const args = z.object(t.input).strict().safeParse(req.body ?? {});
    if (!args.success)
      return fail(res, 400, "Invalid input", { issues: args.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });

    try {
      const baseUrl = opts.baseUrl(req);
      const ctx = { api: loopbackApi(opts.apiBase, access.user, access.scope), baseUrl, actor: outsideActor(access.user, baseUrl) };
      const out = await t.run(args.data, ctx);
      // An image (a ticket screenshot) travels as base64 in JSON here; the REST API at /api/v1 serves the bytes.
      if (out instanceof ImageResult) return void res.json({ mime: out.mime, data_base64: out.bytes.toString("base64"), note: out.note });
      res.json(out ?? null);
    } catch (e) {
      if (e instanceof HttpError) return fail(res, e.status, translate(e.message, "en"), e.extra);
      if (e instanceof ApiCallError) return fail(res, e.status >= 500 ? 502 : e.status, e.message);
      if (e instanceof ToolError) return fail(res, 400, e.message);
      console.error(`ai operation ${t.name}`, e);
      fail(res, 500, "Internal error");
    }
  });

  r.all("/:op", (_req, res) => res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" }));
  return r;
}
