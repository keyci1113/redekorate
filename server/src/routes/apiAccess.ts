/**
 * Outside access, server side:
 *  - oauthServer: the OAuth 2.1 authorization server an MCP client discovers from /mcp's 401 (metadata,
 *    dynamic client registration, authorize, token, revoke). Public clients with PKCE S256 only.
 *  - connect (/api/connect, signed-in users): the consent step behind /authorize, and the Account page's
 *    list of access tokens and connected apps, and the tool list the Connect AI apps page shows.
 */
import express, { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { oauthLimiter, registerLimiter } from "../lib/security.js";
import { toolCatalog } from "../mcp/tools.js";
import {
  OAuthError, SCOPES, createCode, createPat, exchangeCode, findClient, listAccess, redirectMatches, redirectUriOk,
  refreshGrant, registerClient, revokeGrant, revokePat, revokeRaw, type OAuthClient,
} from "../lib/apiAccess.js";

export const SCOPE = "mcp";

/** Bearer-only endpoints carry no cookies, so any origin may call them (browser-based MCP clients do). */
export function openCors(req: Request, res: Response, next: NextFunction) {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
    "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  });
  if (req.method === "OPTIONS") return void res.sendStatus(204);
  next();
}

type AuthorizeCheck =
  | { kind: "ok"; client: OAuthClient; redirectUri: string; challenge: string; state: string | undefined }
  | { kind: "fatal"; message: string }       // shown to the person; never redirect to an unverified URI
  | { kind: "redirect"; to: string };        // error reported back to the app

export function withParams(uri: string, params: Record<string, string | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

/** Validates an /authorize request in the order RFC 6749 §4.1.2.1 asks for. */
export async function checkAuthorize(q: Record<string, unknown>, issuer: string): Promise<AuthorizeCheck> {
  const client = await findClient(q.client_id);
  if (!client) return { kind: "fatal", message: "Esta app no está registrada en redekorate. Quita el conector y vuelve a agregarlo." };
  const redirectUri = q.redirect_uri;
  if (typeof redirectUri !== "string" || !redirectMatches(client.redirect_uris, redirectUri) || !redirectUriOk(redirectUri))
    return { kind: "fatal", message: "La app envió una dirección de regreso que no registró." };
  const state = typeof q.state === "string" ? q.state : undefined;
  const fail = (error: string, description: string): AuthorizeCheck =>
    ({ kind: "redirect", to: withParams(redirectUri, { error, error_description: description, state, iss: issuer }) });
  if (q.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported");
  if (typeof q.code_challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge) || q.code_challenge_method !== "S256")
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
  if (typeof q.scope === "string" && q.scope.trim() && !q.scope.split(/\s+/).every((s) => s === SCOPE))
    return fail("invalid_scope", `The only scope is "${SCOPE}"`);
  return { kind: "ok", client, redirectUri, challenge: q.code_challenge, state };
}

export function oauthServer(baseUrl: (req: Request) => string) {
  const r = Router();
  r.use(["/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server", "/oauth/register", "/oauth/token", "/oauth/revoke"], openCors);

  // RFC 9728: where /mcp's tokens come from. Clients may ask with or without the resource path.
  const resourceMetadata = (req: Request, res: Response) => res.json({
    resource: `${baseUrl(req)}/mcp`,
    authorization_servers: [baseUrl(req)],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "redekorate",
    resource_documentation: `${baseUrl(req)}/help`,
  });
  r.get("/.well-known/oauth-protected-resource", resourceMetadata);
  r.get("/.well-known/oauth-protected-resource/mcp", resourceMetadata);

  // RFC 8414.
  r.get("/.well-known/oauth-authorization-server", (req, res) => {
    const b = baseUrl(req);
    res.json({
      issuer: b,
      authorization_endpoint: `${b}/oauth/authorize`,
      token_endpoint: `${b}/oauth/token`,
      registration_endpoint: `${b}/oauth/register`,
      revocation_endpoint: `${b}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [SCOPE],
      authorization_response_iss_parameter_supported: true,
    });
  });

  // RFC 7591 dynamic client registration (public clients).
  r.post("/oauth/register", registerLimiter, express.json({ limit: "16kb" }), async (req, res) => {
    const b = req.body ?? {};
    const uris: unknown = b.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every(redirectUriOk))
      return res.status(400).json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be https, http on localhost, or an app scheme" });
    if (b.token_endpoint_auth_method && b.token_endpoint_auth_method !== "none")
      return res.status(400).json({ error: "invalid_client_metadata", error_description: "Only public clients (token_endpoint_auth_method=none) are supported" });
    const name = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 100) : "MCP client";
    const c = await registerClient(name, uris as string[]);
    res.status(201).set("Cache-Control", "no-store").json({
      client_id: c!.id, client_id_issued_at: Math.floor(new Date(c!.created_at).getTime() / 1000),
      client_name: c!.name, redirect_uris: c!.redirect_uris,
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: SCOPE,
    });
  });

  // The consent screen is the app's /authorize page (it handles signing in first).
  r.get("/oauth/authorize", async (req, res) => {
    const check = await checkAuthorize(req.query as Record<string, unknown>, baseUrl(req));
    if (check.kind === "redirect") return res.redirect(302, check.to);
    // A fatal problem is explained by the consent page itself (it asks /api/connect/authorize).
    res.redirect(302, `/authorize?${new URLSearchParams(req.query as Record<string, string>)}`);
  });

  r.post("/oauth/token", oauthLimiter, express.urlencoded({ extended: false, limit: "16kb" }), express.json({ limit: "16kb" }), async (req, res) => {
    res.set({ "Cache-Control": "no-store", Pragma: "no-cache" });
    const b = req.body ?? {};
    try {
      if (b.grant_type === "authorization_code") return res.json(await exchangeCode(b));
      if (b.grant_type === "refresh_token") return res.json(await refreshGrant(b));
      throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token");
    } catch (e) {
      if (e instanceof OAuthError) return res.status(400).json({ error: e.code, error_description: e.message });
      throw e;
    }
  });

  r.post("/oauth/revoke", oauthLimiter, express.urlencoded({ extended: false, limit: "16kb" }), express.json({ limit: "16kb" }), async (req, res) => {
    await revokeRaw(req.body?.token);
    res.sendStatus(200);
  });
  return r;
}

// ---------- /api/connect (signed in) ----------

const AuthorizeBody = z.object({
  client_id: z.string(), redirect_uri: z.string(), response_type: z.string(),
  code_challenge: z.string(), code_challenge_method: z.string(),
  state: z.string().max(2000).optional(), scope: z.string().max(200).optional(),
  approve: z.boolean(),
});

export function connectApi(baseUrl: (req: Request) => string) {
  const r = Router();
  r.use(requireAuth);

  /** What the consent page shows: which app, and where it will send the person back. */
  r.get("/authorize", async (req, res) => {
    const check = await checkAuthorize(req.query as Record<string, unknown>, baseUrl(req));
    if (check.kind === "fatal") throw new HttpError(400, check.message);
    if (check.kind === "redirect") return res.json({ redirect: check.to });
    res.json({ client: { name: check.client.name }, redirect_host: new URL(check.redirectUri).host || check.redirectUri });
  });

  r.post("/authorize", async (req, res) => {
    const b = parse(AuthorizeBody, req.body);
    const check = await checkAuthorize(b, baseUrl(req));
    if (check.kind === "fatal") throw new HttpError(400, check.message);
    if (check.kind === "redirect") return res.json({ redirect: check.to });
    const back = (p: Record<string, string>) => withParams(check.redirectUri, { ...p, state: check.state, iss: baseUrl(req) });
    if (!b.approve) return res.json({ redirect: back({ error: "access_denied", error_description: "The user declined" }) });
    const code = await createCode(check.client.id, req.user!.id, check.redirectUri, check.challenge);
    res.json({ redirect: back({ code }) });
  });

  r.get("/access", async (req, res) => res.json({
    ...(await listAccess(req.user!.id)), mcp_url: `${baseUrl(req)}/mcp`, openapi_url: `${baseUrl(req)}/api/v1/tools/openapi.json`,
    rest_url: `${baseUrl(req)}/api/v1`,
  }));

  /** What an app can do once connected, for the Connect AI apps page. */
  r.get("/tools", (_req, res) => res.json({ tools: toolCatalog() }));

  r.post("/tokens", async (req, res) => {
    const b = parse(z.object({
      name: z.string().trim().min(1).max(80), expires_days: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable().default(90),
      scope: z.enum(SCOPES).default("write"),
    }), req.body);
    const { token, row } = await createPat(req.user!.id, b.name, b.expires_days, b.scope);
    res.status(201).json({ token, row });
  });

  r.delete("/tokens/:id", async (req, res) => {
    if (!(await revokePat(req.user!.id, req.params.id))) throw notFound("Token");
    res.json({ ok: true });
  });

  r.delete("/apps/:id", async (req, res) => {
    if (!(await revokeGrant(req.user!.id, req.params.id))) throw new HttpError(404, "Conexión no encontrada");
    res.json({ ok: true });
  });
  return r;
}
