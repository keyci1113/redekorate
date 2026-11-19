/**
 * Outside access to the MCP server: personal access tokens and OAuth 2.1 (authorization code + PKCE,
 * public clients, rotating refresh tokens). Tokens are random strings with a readable prefix; only their
 * SHA-256 hash is stored, so a database leak does not leak working tokens.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { customAlphabet } from "nanoid";
import { one, query } from "./db.js";
import type { AuthUser, Role } from "./auth.js";

const random = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 40);

export type TokenKind = "pat" | "oat" | "ort" | "code" | "client";
/** rdk_pat_… personal access token · rdk_oat_… OAuth access token · rdk_ort_… OAuth refresh token. */
export const newToken = (kind: TokenKind) => `rdk_${kind}_${random()}`;
export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
/** The last four characters, so people can tell their tokens apart in the list. */
export const tokenHint = (raw: string) => raw.slice(-4);

export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_DAYS = 60;
export const CODE_TTL_S = 300;

// ---------- pure checks (unit tested) ----------

/** PKCE S256: base64url(sha256(verifier)) must equal the challenge sent to /authorize. */
export function pkceOk(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"]);

/**
 * Where an app may receive its code: https anywhere, http only on this computer (native apps such as
 * Claude Code listen on a local port), or an app's own scheme (cursor://, vscode://). Never script-like schemes.
 */
export function redirectUriOk(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 2000) return false;
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return LOOPBACK.has(u.hostname);
  return !BLOCKED_SCHEMES.has(u.protocol) && /^[a-z][a-z0-9+.-]*:$/.test(u.protocol);
}

/** Exact match with a registered URI; on loopback the port may differ (RFC 8252 §7.3). */
export function redirectMatches(registered: string[], given: string): boolean {
  if (registered.includes(given)) return true;
  let g: URL;
  try { g = new URL(given); } catch { return false; }
  if (g.protocol !== "http:" || !LOOPBACK.has(g.hostname)) return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === "http:" && u.hostname === g.hostname && u.pathname === g.pathname && u.search === g.search;
    } catch { return false; }
  });
}

// ---------- bearer tokens ----------

/** What a token may do: "write" reads, creates and edits; "read" only gets what reads. */
export type Scope = "read" | "write";
export const SCOPES: readonly Scope[] = ["read", "write"];

/** Who a bearer token acts as, and what it may do. */
export interface BearerAccess { user: AuthUser; scope: Scope }

interface TokenUserRow {
  token_id: string; last_used_at: string | null; scope: Scope;
  id: string; email: string; name: string; role: Role; avatar: string | null; onboarded_at: string | null;
}

/** The user a bearer token acts as and its scope, or null when it is unknown, revoked, expired or the account is disabled. */
export async function verifyBearer(raw: string | undefined): Promise<BearerAccess | null> {
  if (!raw || !raw.startsWith("rdk_pat_") && !raw.startsWith("rdk_oat_")) return null;
  const r = await one<TokenUserRow>(
    `select t.id as token_id, t.last_used_at, t.scope, u.id, u.email, u.name, u.role, u.avatar, u.onboarded_at
     from api_tokens t join users u on u.id = t.user_id left join oauth_grants g on g.id = t.grant_id
     where t.token_hash = $1 and t.revoked_at is null and (t.expires_at is null or t.expires_at > now())
       and u.disabled_at is null and (t.grant_id is null or g.revoked_at is null)`, [hashToken(raw)]);
  if (!r) return null;
  // Write at most once a minute per token: every MCP call would otherwise be a write.
  if (!r.last_used_at || Date.now() - new Date(r.last_used_at).getTime() > 60_000) {
    await query("update api_tokens set last_used_at = now() where id = $1", [r.token_id]);
    await query("update oauth_grants g set last_used_at = now() from api_tokens t where t.id = $1 and g.id = t.grant_id", [r.token_id]);
  }
  return { user: { id: r.id, email: r.email, name: r.name, role: r.role, avatar: r.avatar, onboarded_at: r.onboarded_at }, scope: r.scope };
}

// ---------- personal access tokens ----------

export async function createPat(userId: string, name: string, expiresDays: number | null, scope: Scope = "write") {
  const token = newToken("pat");
  const row = await one(
    `insert into api_tokens(user_id, name, token_hash, hint, expires_at, scope)
     values ($1,$2,$3,$4, case when $5::int is null then null else now() + make_interval(days => $5::int) end, $6)
     returning id, name, hint, scope, created_at, last_used_at, expires_at`,
    [userId, name, hashToken(token), tokenHint(token), expiresDays, scope]);
  return { token, row };
}

/** What the Account page lists: the person's own tokens and the apps they allowed. */
export async function listAccess(userId: string) {
  const tokens = await query(
    `select id, name, hint, scope, created_at, last_used_at, expires_at from api_tokens
     where user_id = $1 and grant_id is null and revoked_at is null and (expires_at is null or expires_at > now())
     order by created_at desc`, [userId]);
  const apps = await query(
    `select g.id, c.name, g.created_at, g.last_used_at from oauth_grants g join oauth_clients c on c.id = g.client_id
     where g.user_id = $1 and g.revoked_at is null and g.refresh_expires_at > now() order by coalesce(g.last_used_at, g.created_at) desc`, [userId]);
  return { tokens, apps };
}

export const revokePat = (userId: string, id: string) =>
  one("update api_tokens set revoked_at = now() where id = $1 and user_id = $2 and grant_id is null and revoked_at is null returning id", [id, userId]);

export const revokeGrant = (userId: string, id: string) =>
  one("update oauth_grants set revoked_at = now(), refresh_hash = null where id = $1 and user_id = $2 and revoked_at is null returning id", [id, userId]);

// ---------- OAuth ----------

export interface OAuthClient { id: string; name: string; redirect_uris: string[] }

export const registerClient = (name: string, redirectUris: string[]) =>
  one<OAuthClient & { created_at: string }>(
    "insert into oauth_clients(id, name, redirect_uris) values ($1,$2,$3) returning id, name, redirect_uris, created_at",
    [newToken("client"), name, redirectUris]);

export const findClient = (id: unknown) =>
  typeof id === "string" && id.length <= 80 ? one<OAuthClient>("select id, name, redirect_uris from oauth_clients where id = $1", [id]) : Promise.resolve(null);

export async function createCode(clientId: string, userId: string, redirectUri: string, challenge: string) {
  const code = newToken("code");
  await query(
    `insert into oauth_codes(code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at)
     values ($1,$2,$3,$4,$5, now() + make_interval(secs => $6))`,
    [hashToken(code), clientId, userId, redirectUri, challenge, CODE_TTL_S]);
  return code;
}

export interface TokenResponse { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string }

async function issue(grantId: string, userId: string, clientName: string): Promise<TokenResponse> {
  const access = newToken("oat"), refresh = newToken("ort");
  await query(
    `insert into api_tokens(user_id, grant_id, name, token_hash, hint, expires_at)
     values ($1,$2,$3,$4,$5, now() + make_interval(secs => $6))`,
    [userId, grantId, clientName, hashToken(access), tokenHint(access), ACCESS_TTL_S]);
  await query(
    `update oauth_grants set refresh_hash = $2, refresh_expires_at = now() + make_interval(days => $3), last_used_at = now() where id = $1`,
    [grantId, hashToken(refresh), REFRESH_TTL_DAYS]);
  // Expired access tokens of this grant are no use to anyone.
  await query("delete from api_tokens where grant_id = $1 and expires_at < now()", [grantId]);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: "mcp" };
}

export class OAuthError extends Error {
  constructor(public code: "invalid_grant" | "invalid_request" | "invalid_client" | "unsupported_grant_type", message: string) { super(message); }
}

/** authorization_code grant: single use, bound to client, redirect URI and PKCE verifier. */
export async function exchangeCode(p: { code?: unknown; client_id?: unknown; redirect_uri?: unknown; code_verifier?: unknown }) {
  if (typeof p.code !== "string") throw new OAuthError("invalid_request", "code is required");
  const c = await one<{ client_id: string; user_id: string; redirect_uri: string; code_challenge: string; name: string }>(
    `update oauth_codes o set used_at = now() from oauth_clients c
     where o.code_hash = $1 and o.used_at is null and o.expires_at > now() and c.id = o.client_id
     returning o.client_id, o.user_id, o.redirect_uri, o.code_challenge, c.name`, [hashToken(p.code)]);
  if (!c) throw new OAuthError("invalid_grant", "The code is invalid, expired or already used");
  if (p.client_id !== undefined && p.client_id !== c.client_id) throw new OAuthError("invalid_grant", "The code was issued to another client");
  if (p.redirect_uri !== c.redirect_uri) throw new OAuthError("invalid_grant", "redirect_uri does not match");
  if (!pkceOk(p.code_verifier, c.code_challenge)) throw new OAuthError("invalid_grant", "code_verifier does not match");
  const active = await one("select 1 from users where id = $1 and disabled_at is null", [c.user_id]);
  if (!active) throw new OAuthError("invalid_grant", "The account is disabled");
  const g = await one<{ id: string }>("insert into oauth_grants(user_id, client_id) values ($1,$2) returning id", [c.user_id, c.client_id]);
  return issue(g!.id, c.user_id, c.name);
}

/** refresh_token grant: the refresh token rotates on every use. */
export async function refreshGrant(p: { refresh_token?: unknown; client_id?: unknown }) {
  if (typeof p.refresh_token !== "string") throw new OAuthError("invalid_request", "refresh_token is required");
  const g = await one<{ id: string; user_id: string; client_id: string; name: string }>(
    `select g.id, g.user_id, g.client_id, c.name from oauth_grants g join oauth_clients c on c.id = g.client_id join users u on u.id = g.user_id
     where g.refresh_hash = $1 and g.revoked_at is null and g.refresh_expires_at > now() and u.disabled_at is null`, [hashToken(p.refresh_token)]);
  if (!g) throw new OAuthError("invalid_grant", "The refresh token is invalid or expired");
  if (p.client_id !== undefined && p.client_id !== g.client_id) throw new OAuthError("invalid_grant", "The refresh token was issued to another client");
  return issue(g.id, g.user_id, g.name);
}

/** RFC 7009: revoking either token of a connection ends the whole connection. Unknown tokens are not an error. */
export async function revokeRaw(raw: unknown) {
  if (typeof raw !== "string") return;
  const h = hashToken(raw);
  await query("update oauth_grants set revoked_at = now(), refresh_hash = null where refresh_hash = $1", [h]);
  await query(
    `update oauth_grants g set revoked_at = now(), refresh_hash = null from api_tokens t where t.token_hash = $1 and g.id = t.grant_id`, [h]);
  await query("update api_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null", [h]);
}
